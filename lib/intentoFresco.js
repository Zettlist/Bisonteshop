/**
 * Crea un PaymentIntent protegido contra el doble clic, sin que esa proteccion
 * se vuelva una trampa.
 *
 * Las rutas de cobro le pasan a Stripe una llave de idempotencia armada con lo
 * que se cobra (cliente, carrito, importe...): dos clics seguidos dan la misma
 * llave y Stripe devuelve el MISMO intento en vez de retener el dinero dos
 * veces. Bien. Pero Stripe guarda esa llave 24 horas, y la llave no cambia
 * cuando el intento ya se uso o se cancelo:
 *
 *   · quien compra un tomo y horas despues compra otro igual recibia el intento
 *     del primer pedido, ya autorizado, y la pagina contestaba con un error de
 *     Stripe al pagar;
 *   · a quien se le cancelo un cobro (se agoto la pieza, el POS anulo el
 *     pedido) y volvia a intentar lo mismo le tocaba el intento cancelado, y no
 *     podia pagar hasta el dia siguiente.
 *
 * Se descubrio con scripts/prueba-cobros.mjs, que compra el mismo carrito dos
 * veces seguidas.
 *
 * La regla: si lo que devuelve la llave todavia se puede pagar, es el doble
 * clic y se reusa. Si ya no (autorizado, cobrado o cancelado), es una compra
 * nueva y se crea otro intento con otra llave.
 *
 * Ojo con un detalle de Stripe: cuando reconoce la llave, NO contesta con el
 * intento como esta ahora, sino con la respuesta original guardada -- la foto
 * de cuando se creo, "listo para pagar" aunque hoy este cancelado. Por eso, si
 * la respuesta es una repeticion (cabecera Idempotent-Replayed), se le pregunta
 * a Stripe el estado actual antes de decidir.
 */
import crypto from 'crypto';

const PAGABLES = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

// Cuantas compras iguales seguidas se admiten en 24 horas antes de dejar de
// encadenar llaves. Veinte del mismo carrito el mismo dia ya no es un cliente.
const MAX_ESLABONES = 20;

/**
 * La llave de repuesto sale del intento que reemplaza, no de la hora. Asi es
 * predecible: el segundo clic de la compra NUEVA llega a la misma llave y
 * Stripe le devuelve el mismo intento, que es justo la proteccion que se
 * queria conservar. Con la hora en la llave, cada clic creaba un cobro.
 */
const siguienteLlave = (base, llave, usado) =>
    `${base}:${crypto.createHash('sha256').update(`${llave}|${usado}`).digest('hex').slice(0, 16)}`;

export async function crearIntento(stripe, params, idempotencyKey) {
    let llave = idempotencyKey;
    for (let i = 0; i < MAX_ESLABONES; i++) {
        const intento = await stripe.paymentIntents.create(params, { idempotencyKey: llave });
        const repetido = String(intento.lastResponse?.headers?.['idempotent-replayed']) === 'true';
        const actual = repetido ? await stripe.paymentIntents.retrieve(intento.id) : intento;
        if (PAGABLES.has(actual.status)) return actual;
        llave = siguienteLlave(idempotencyKey, llave, actual.id);
    }
    // Veinte compras identicas en un dia: se deja de proteger el doble clic y
    // se cobra con una llave nueva, antes que dejar a alguien sin poder pagar.
    return stripe.paymentIntents.create(params, { idempotencyKey: `${idempotencyKey}:${Date.now()}` });
}
