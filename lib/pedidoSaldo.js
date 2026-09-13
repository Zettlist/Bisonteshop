import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// El pedido que se paga entero con saldo y no pasa por la tarjeta.
//
// Todo el flujo de compra se apoya en el PaymentIntent: /api/checkout lo crea
// con los totales en el metadata, y /api/checkout/confirm los lee de ahi para
// registrar el pedido. Ese metadata es lo que hace que los importes no vengan
// del navegador -- lo escribio el servidor y Stripe lo devuelve intacto.
//
// Cuando el saldo cubre la compra entera no hay nada que cobrar, y por tanto no
// hay PaymentIntent ni metadata donde apoyarse. Antes eso ni siquiera llegaba a
// plantearse: /api/checkout intentaba cobrar $0, Stripe contestaba
// `amount_too_small` (su minimo son $10 MXN) y el cliente veia "Error al
// procesar el pago". Tener saldo de sobra impedia comprar.
//
// Este token ocupa el lugar del metadata: lo firma el servidor con el mismo
// secreto de las sesiones, viaja por el navegador y vuelve sin que nadie pueda
// tocarle una cifra. Dura poco a proposito -- es un pase para registrar UN
// pedido, no una sesion.
// ─────────────────────────────────────────────────────────────────────────────

const clave = () => new TextEncoder().encode(process.env.JWT_SECRET);

const VIGENCIA = '30m';

/** Prefijo de `bisonte_orders.payment_intent_id` para los pedidos sin cargo.
 *  La columna es NOT NULL y UNIQUE, asi que necesitan un identificador propio;
 *  que no se parezca a un `pi_...` es justo lo que permite a /capture y
 *  /refund saber que en Stripe no hay nada que capturar ni devolver. */
export const PREFIJO_SALDO = 'saldo_';

export const esPedidoDeSaldo = (id) => typeof id === 'string' && id.startsWith(PREFIJO_SALDO);

/**
 * Firma los totales de un pedido pagado integramente con saldo.
 * `ref` es el identificador que ocupara el sitio del PaymentIntent.
 */
export async function firmarPedidoSaldo({ clienteId, itemsHash, subtotal, discount, credit, shipping, total, couponId }) {
    const ref = PREFIJO_SALDO + crypto.randomBytes(16).toString('hex');
    const token = await new SignJWT({
        userId: String(clienteId),
        ref,
        // La mercancia cotizada. Aqui pesa mas que en el camino con tarjeta: un
        // pedido pagado con saldo no tiene un cargo que delate el descuadre.
        itemsHash,
        // El cupon viaja aqui porque en el camino con tarjeta lo lleva el
        // metadata del PaymentIntent, y /api/orders/capture lo lee de alli para
        // registrar el canje. Sin cargo no hay metadata que leer, asi que el
        // canje lo escribe /api/checkout/confirm; sin esta linea, un pedido
        // pagado con saldo usaria un cupon sin gastarlo.
        couponId: couponId ? String(couponId) : '',
        subtotalMXN: subtotal.toFixed(2),
        appliedDiscount: discount.toFixed(2),
        appliedCredit: credit.toFixed(2),
        shippingMXN: shipping.toFixed(2),
        totalMXN: total.toFixed(2),
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(VIGENCIA)
        .sign(clave());
    return { token, ref };
}

/**
 * Devuelve los totales firmados, o null si el token no vale (firma mala,
 * caducado, manipulado). Quien llama tiene que tratar el null como "este pedido
 * no existe": es la unica defensa, porque aqui no hay Stripe que confirme nada.
 */
export async function leerPedidoSaldo(token) {
    if (typeof token !== 'string' || !token) return null;
    try {
        const { payload } = await jwtVerify(token, clave());
        if (!esPedidoDeSaldo(payload.ref)) return null;
        return payload;
    } catch {
        return null;
    }
}
