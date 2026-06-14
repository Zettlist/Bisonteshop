import pool from '@/lib/db';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

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

    const [rows] = await pool.query(
        `SELECT id, name, sale_price, stock FROM products WHERE empresa_id = ? AND id IN (?)`,
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

// Registro de qué cliente ya canjeó qué cupón (un canje por cliente y cupón).
let redemptionsReady = false;
export async function ensureCouponRedemptions() {
    if (redemptionsReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS coupon_redemptions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            coupon_id INT NOT NULL,
            cliente_id INT NOT NULL,
            sale_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_coupon_cliente (coupon_id, cliente_id)
        )`);
    redemptionsReady = true;
}

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
            await ensureCouponRedemptions();
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
