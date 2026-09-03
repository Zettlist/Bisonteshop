// ─────────────────────────────────────────────────────────────────────────────
// Progreso de un pedido: una sola fuente para la tarjeta, las pestanas y
// cualquier otra vista. Antes cada archivo repetia su propia lista de estados
// y se iban separando entre si.
//
// Los estados vienen ya traducidos por /api/orders (bisonte_orders.estado ->
// verificando | preparando | transito | entregado | reclamo | cancelado).
// El eje del reclamo es aparte: vive en claim_status y corre en paralelo.
// ─────────────────────────────────────────────────────────────────────────────

// Pedido normal. Las claves son los estados que manda la API.
export const FLUJO_NORMAL = [
    { key: 'verificando', label: 'Verificando' },
    { key: 'preparando',  label: 'Preparando'  },
    { key: 'transito',    label: 'En camino'   },
    { key: 'entregado',   label: 'Entregado'   },
];

// Preventa: mismos estados, otra lectura. Lo que en un pedido normal es
// "verificando existencias" aqui es el apartado, y "preparando" es el tiempo
// que el titulo tarda en llegar al almacen.
export const FLUJO_PREVENTA = [
    { key: 'verificando', label: 'Apartado'      },
    { key: 'preparando',  label: 'En producción' },
    { key: 'transito',    label: 'En camino'     },
    { key: 'entregado',   label: 'Entregado'     },
];

// Eje del reclamo. `abierto` es el valor por defecto cuando el POS todavia no
// mueve el caso; la ruta de alta lo deja en `disputa`.
export const FLUJO_RECLAMO = [
    { key: 'abierto',    label: 'Recibido'   },
    { key: 'disputa',    label: 'En revisión' },
    { key: 'resolucion', label: 'Resuelto'   },
];

export function esReclamo(order) {
    return order?.status === 'reclamo';
}

export function reclamoResuelto(order) {
    return esReclamo(order) && order?.claimStatus === 'resolucion';
}

export function esReclamoActivo(order) {
    return esReclamo(order) && !reclamoResuelto(order);
}

// Cerrado para el cliente: ya no se mueve solo. El reclamo resuelto cuenta,
// porque el pedido vuelve a quedar completo.
export function esFinalizado(order) {
    return order?.status === 'entregado'
        || order?.status === 'cancelado'
        || reclamoResuelto(order);
}

export function esEnCurso(order) {
    return !esFinalizado(order) && !esReclamoActivo(order);
}

export function esCancelado(order) {
    return order?.status === 'cancelado';
}

// Un pedido entregado admite reclamo mientras no tenga uno abierto ni resuelto.
export function puedeReclamar(order) {
    return order?.status === 'entregado' && !esReclamo(order);
}

export function tieneSaldoPendiente(order) {
    const pagado = (order?.payments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);
    return Number(order?.total || 0) - pagado > 0.01;
}

// Una preventa no entra a produccion hasta liquidar el anticipo: mientras
// falte saldo, "preparando" no es que se este fabricando todavia — es que
// esta separado, en espera de que el cliente complete el pago.
function esperandoPagoDePreventa(order) {
    return order?.type === 'Preventa' && order?.status === 'preparando' && tieneSaldoPendiente(order);
}

// { flujo, indice, tono } — `indice` es el paso actual; -1 si el estado no
// pertenece al flujo (cancelado, sobre todo).
export function progresoDe(order) {
    if (esReclamo(order)) {
        const clave = order.claimStatus || 'abierto';
        const indice = FLUJO_RECLAMO.findIndex(p => p.key === clave);
        return { flujo: FLUJO_RECLAMO, indice: indice === -1 ? 0 : indice, tono: 'reclamo' };
    }

    let flujo = order?.type === 'Preventa' ? FLUJO_PREVENTA : FLUJO_NORMAL;
    if (esperandoPagoDePreventa(order)) {
        flujo = flujo.map(p => p.key === 'preparando'
            ? { ...p, label: 'Separado (Esperando pago completo)' }
            : p);
    }

    return { flujo, indice: flujo.findIndex(p => p.key === order?.status), tono: 'normal' };
}

// Etiqueta del paso actual — la misma que ve el cliente en el recorrido
// (BarraProgreso, OrderTracking). Antes cada tarjeta traia su propio texto
// fijo para el badge de arriba ("Preparando") que no distinguia Preventa y
// quedaba peleado con la etiqueta del recorrido de abajo ("En producción").
export function etiquetaActual(order) {
    if (esCancelado(order)) return 'Cancelado';
    if (reclamoResuelto(order)) return 'Completado';
    if (esReclamo(order)) return 'En Reclamo';
    const { flujo, indice } = progresoDe(order);
    return flujo[indice]?.label || 'Verificando';
}

// Clave de color para el badge — normalmente el status tal cual, salvo
// "esperando pago": se pinta neutro como Apartado, porque todavia no pasa
// nada (el rojo de "preparando" decia visualmente que ya se estaba moviendo).
export function claseDe(order) {
    return esperandoPagoDePreventa(order) ? 'verificando' : order?.status;
}
