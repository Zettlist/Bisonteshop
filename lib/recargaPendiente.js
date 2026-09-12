// ─────────────────────────────────────────────────────────────────────────────
// El cobro de una recarga y su abono son dos pasos, y entre uno y otro esta el
// navegador del cliente.
//
//   1. Stripe aprueba la tarjeta  → el dinero ya salio
//   2. POST /api/credit/confirm   → el saldo sube
//
// Si el paso 2 no llega a hacerse -- se cerro la pestaña, se cayo el wifi, el
// telefono se quedo sin bateria -- hay un cargo cobrado y un saldo sin subir, y
// nada en el servidor lo va a notar: el unico que sabe que ese PaymentIntent
// existe es el navegador que lo confirmo.
//
// Aqui se deja apuntado antes de cobrar. La siguiente vez que el cliente abra
// su cuenta se reintenta el abono, que es idempotente por el UNIQUE de
// `credit_topups.payment_intent_id`: si ya se habia acreditado no pasa nada, y
// si no, se acredita ahora.
//
// Esto no sustituye a un webhook de Stripe (ver db/README.md): si el cliente no
// vuelve nunca, el cargo sigue ahi. Cubre el caso real y frecuente -- vuelve --
// sin infraestructura nueva.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = 'bisonte:recargaPendiente';

// A las dos semanas se deja de intentar. Un cargo que lleva ese tiempo sin
// acreditarse ya no lo va a arreglar un reintento: es un caso de mostrador.
const VIGENCIA_MS = 14 * 24 * 60 * 60 * 1000;

function almacen() {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        // Safari en privado y los navegadores con cookies bloqueadas tiran aqui.
        return null;
    }
}

/** Apunta el cobro ANTES de confirmarlo con Stripe. */
export function anotarRecarga(paymentIntentId) {
    const ls = almacen();
    if (!ls || !paymentIntentId) return;
    try {
        ls.setItem(CLAVE, JSON.stringify({ id: paymentIntentId, ts: Date.now() }));
    } catch { /* cuota llena: el reintento es un extra, no se rompe el pago */ }
}

export function olvidarRecarga() {
    const ls = almacen();
    if (!ls) return;
    try { ls.removeItem(CLAVE); } catch { }
}

/** El id apuntado, o null si no hay o ya caduco. */
export function recargaPendiente() {
    const ls = almacen();
    if (!ls) return null;
    try {
        const dato = JSON.parse(ls.getItem(CLAVE) || 'null');
        if (!dato?.id || typeof dato.id !== 'string') return null;
        if (Date.now() - (dato.ts || 0) > VIGENCIA_MS) { olvidarRecarga(); return null; }
        return dato.id;
    } catch {
        olvidarRecarga();
        return null;
    }
}

/**
 * Reintenta el abono que quedo a medias.
 *
 * @returns {Promise<{abonada: boolean, balance?: number, amount?: number}>}
 */
export async function reintentarRecargaPendiente() {
    const id = recargaPendiente();
    if (!id) return { abonada: false };

    let res;
    try {
        res = await fetch('/api/credit/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId: id }),
        });
    } catch {
        // Sin red. El apunte se queda para la proxima.
        return { abonada: false };
    }

    // Un 5xx puede ser la base caida con el cargo ya hecho: eso SI hay que
    // volver a intentarlo. Cualquier otra respuesta es definitiva -- el pago no
    // existe, no es suyo, o nunca se completo -- y el apunte solo estorbaria.
    if (res.status >= 500) return { abonada: false };

    olvidarRecarga();

    let data = null;
    try { data = await res.json(); } catch { }
    if (!data?.success) return { abonada: false };

    // `yaAplicado` significa que el abono se hizo en su momento y esto fue un
    // reintento de mas: no hay nada nuevo que anunciarle al cliente.
    return { abonada: !data.yaAplicado, balance: data.balance, amount: data.amount };
}
