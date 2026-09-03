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

// { flujo, indice, tono } — `indice` es el paso actual; -1 si el estado no
// pertenece al flujo (cancelado, sobre todo).
export function progresoDe(order) {
    if (esReclamo(order)) {
        const clave = order.claimStatus || 'abierto';
        const indice = FLUJO_RECLAMO.findIndex(p => p.key === clave);
        return { flujo: FLUJO_RECLAMO, indice: indice === -1 ? 0 : indice, tono: 'reclamo' };
    }

    const flujo = order?.type === 'Preventa' ? FLUJO_PREVENTA : FLUJO_NORMAL;
    return { flujo, indice: flujo.findIndex(p => p.key === order?.status), tono: 'normal' };
}
