import crypto from 'crypto';
import pool from '@/lib/db';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Huella del carrito: ata la MERCANCIA al pago.
 *
 * Los importes de un pedido ya venian del servidor —del metadata del
 * PaymentIntent o del token firmado—, pero los renglones no: `/api/checkout`
 * cotizaba un carrito y `/api/checkout/confirm` aceptaba otro distinto en el
 * cuerpo de la peticion. Se pagaba un manga de $250 y se pedian dos figuras de
 * $750; la venta quedaba por $470 y el POS empacaba $1,500 de mercancia.
 *
 * Esta huella se calcula al cotizar, viaja firmada con los totales y se vuelve
 * a calcular al confirmar. Si no coincide, el pedido no se registra.
 *
 * Va sobre `lines` (lo que la BD reconocio) y no sobre el `items` crudo, para
 * que dos cuerpos que describen el mismo carrito den la misma huella. Lleva id
 * y cantidad, NO el precio: si el precio cambia entre cotizar y confirmar manda
 * el que se cobro —eso ya lo fija el metadata— y no hay por que tumbar un
 * pedido legitimo por una edicion del catalogo.
 */
export function huellaCarrito(lines) {
    const canon = lines.map(l => `${l.id}x${l.quantity}`).sort().join('|');
    return crypto.createHash('sha256').update(canon).digest('hex');
}

/**
 * Recalcula el precio del carrito DESDE LA BASE DE DATOS.
 * Nunca confía en `price`, `type` ni `anticipo_percent` que mande el cliente:
 * el navegador es manipulable. El precio es siempre `products.sale_price`.
 *
 * No bloquea por stock: el modelo es "autorizar y que el POS confirme existencias"
 * (el POS auto-cancela y libera la autorización si no hay stock).
 *
 * @param {Array<{id:number, quantity:number}>} items
 * @returns {{ lines: Array, subtotal: number, errors: string[] }}
 */
export async function priceCart(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return { lines: [], subtotal: 0, errors: ['Carrito vacío.'] };
    }

    const ids = [...new Set(items.map(i => Number(i.id)).filter(Boolean))];
    if (!ids.length) {
        return { lines: [], subtotal: 0, errors: ['Items inválidos.'] };
    }

    // `es_prueba = 0` tambien aqui, y no solo en el catalogo: esta es la
    // consulta que decide el precio de lo que se cobra. Filtrar solo la vitrina
    // deja la puerta de atras abierta -- un carrito con el id de un producto de
    // prueba escrito a mano generaria un pedido real por mercancia que no
    // existe. La tienda no debe cobrar lo que no enseña.
    const [rows] = await pool.query(
        `SELECT id, name, sale_price, stock FROM products WHERE empresa_id = ? AND es_prueba = 0 AND id IN (?)`,
        [EMPRESA_ID, ids]
    );
    const byId = new Map(rows.map(r => [r.id, r]));

    const errors = [];
    const lines = [];
    let subtotal = 0;

    for (const it of items) {
        const p = byId.get(Number(it.id));
        if (!p) { errors.push(`El producto ${it.id} no existe o no está disponible.`); continue; }

        const qty = Math.max(1, Math.min(Math.floor(Number(it.quantity) || 1), 99));
        const unitPrice = parseFloat(p.sale_price);
        if (!(unitPrice > 0)) { errors.push(`El producto "${p.name}" no tiene precio válido.`); continue; }

        const lineTotal = round2(unitPrice * qty);
        subtotal += lineTotal;
        lines.push({ id: p.id, name: p.name, unitPrice, quantity: qty, lineTotal, stock: p.stock });
    }

    return { lines, subtotal: round2(subtotal), errors };
}

// Registro de qué cliente ya canjeó qué cupón (un canje por cliente y cupón):
// la tabla `coupon_redemptions`, que vive en db/schema.sql. Aqui habia un
// ensureCouponRedemptions() que la creaba al vuelo; se ha quitado, junto con su
// gemelo en app/api/orders/capture/route.js. La app no crea tablas.

/**
 * Valida un cupón contra la BD y devuelve el monto de descuento sobre `base` (MXN).
 * Si se pasa `clienteId`, también verifica el límite por usuario (un canje por cliente).
 * @returns {Promise<{ coupon: object|null, amount: number, error?: string }>}
 */
export async function priceCoupon(discountCode, base, clienteId = null) {
    if (!discountCode) return { coupon: null, amount: 0 };
    const [coupons] = await pool.query(
        `SELECT * FROM coupons
         WHERE code = ?
           AND status = 'active'
           AND (empresa_id = ? OR empresa_id IS NULL)
           AND (expiration_date IS NULL OR expiration_date > NOW())
           AND (usage_limit IS NULL OR usage_count < usage_limit)
         LIMIT 1`,
        [String(discountCode).toUpperCase(), EMPRESA_ID]
    );
    if (!coupons.length) return { coupon: null, amount: 0, error: 'Código inválido, expirado o agotado.' };

    const coupon = coupons[0];

    // Límite por usuario: un cliente no puede canjear el mismo cupón dos veces.
    if (clienteId) {
        try {
            const [red] = await pool.query(
                'SELECT 1 FROM coupon_redemptions WHERE coupon_id = ? AND cliente_id = ? LIMIT 1',
                [coupon.id, clienteId]
            );
            if (red.length) return { coupon: null, amount: 0, error: 'Ya usaste este cupón.' };
        } catch { /* si la tabla aún no existe, no bloquea */ }
    }

    let amount = coupon.discount_type === 'percentage'
        ? (base * parseFloat(coupon.discount_value)) / 100
        : parseFloat(coupon.discount_value);
    amount = round2(Math.min(Math.max(amount, 0), base));
    return { coupon, amount };
}

export { round2 };
