/**
 * Reglas del apartado y de la preventa.
 *
 * Viven aqui y no repartidas por la interfaz porque son condiciones de venta:
 * cuando cambien, tienen que cambiar a la vez en el dialogo, en el correo de
 * confirmacion y en lo que aplica el POS. Un porcentaje escrito a mano en dos
 * sitios es una promesa distinta en cada uno.
 *
 * Politica confirmada con la tienda, y ya sin contradicciones:
 *
 *   apartado   mercancia que esta en la tienda. Anticipo del 30%, 15 dias para
 *              liquidar, contados desde el anticipo.
 *   preventa   pedido que viene en camino. Anticipo del 50%, 30 dias, contados
 *              desde que el pedido LLEGA a la tienda.
 *
 * El mismo cuadro esta en la seccion 7 de TerminosModal.js, en
 * TorlanPOS/backend/utils/apartados.js y en TorlanPOS/backend/utils/preventas.js.
 * Los cuatro tienen que decir lo mismo.
 */

/** Dias para liquidar un apartado, contados desde el anticipo. */
export const DIAS_APARTADO = 15;

/**
 * Dias para liquidar una preventa, contados desde que el pedido llega.
 *
 * Esta aqui para poder explicarselo al cliente, no para calcular una fecha: la
 * llegada la registra el POS (pre_orders.arrived_at) y la tienda web no la
 * conoce. Por eso `fechaLimite` devuelve null en una preventa, en vez de
 * inventarse una disponibilidad para rellenar el hueco.
 */
export const DIAS_PREVENTA = 30;

export const APARTADO = {
    // Apartado de un articulo que ya esta en la tienda.
    porcentajeAnticipoNormal: 0.30,
    // Preventa: el articulo es de importacion y todavia no existe. El anticipo
    // mas alto cubre el pedido al proveedor, que se hace por adelantado.
    porcentajeAnticipoPreventa: 0.50,
    // Piso en pesos: un anticipo del 30% sobre un articulo de $80 son $24, y la
    // comision de Stripe se come una parte que no justifica el movimiento.
    anticipoMinimo: 100,
    diasParaLiquidar: DIAS_APARTADO,
};

/**
 * Los dos tipos, con su porcentaje y su plazo.
 *
 * `dias: null` en la preventa no es un olvido: significa que el plazo existe
 * (son DIAS_PREVENTA) pero no arranca hoy, asi que desde aqui no se puede
 * poner fecha. Quien pinte esto tiene que decir que el conteo empieza cuando
 * el pedido llegue, no dar un dia concreto que luego no se cumple.
 */
const REGLAS = {
    normal: { porcentaje: APARTADO.porcentajeAnticipoNormal, dias: DIAS_APARTADO },
    preventa: { porcentaje: APARTADO.porcentajeAnticipoPreventa, dias: null },
};

/** Normaliza el tipo: cualquier valor que no sea de los dos conocidos cae en
 *  `normal`, para que no se cuele un porcentaje inventado. */
export function normalizarTipo(tipo) {
    return REGLAS[tipo] ? tipo : 'normal';
}

/** Reglas del tipo, con `normal` como respaldo para un valor invalido. */
export function reglasDe(tipo) {
    return REGLAS[normalizarTipo(tipo)];
}

/** Porcentaje de anticipo del tipo, ya en tanto por ciento para la interfaz. */
export function porcentajeAnticipo(tipo = 'normal') {
    return Math.round(reglasDe(tipo).porcentaje * 100);
}

/** Dias de plazo del tipo, para explicarselos al cliente. */
export function diasDePlazo(tipo = 'normal') {
    return normalizarTipo(tipo) === 'preventa' ? DIAS_PREVENTA : DIAS_APARTADO;
}

/** Redondea a dos decimales sin arrastrar el error del binario: 0.1+0.2 no
 *  puede acabar guardado como 0.30000000000000004 en una columna de dinero. */
function centavos(n) {
    return Math.round(n * 100) / 100;
}

/**
 * Anticipo y saldo de un apartado.
 *
 * El anticipo nunca supera el precio: en un articulo mas barato que el minimo,
 * el "anticipo" seria pagar de mas y quedar con saldo negativo.
 *
 * @param {number} precio
 * @param {'normal'|'preventa'} [tipo]
 */
export function calcularApartado(precio, tipo = 'normal') {
    const total = Number(precio) || 0;
    const clase = normalizarTipo(tipo);
    if (total <= 0) return { total: 0, anticipo: 0, saldo: 0, tipo: clase, porcentaje: porcentajeAnticipo(clase) };

    const { porcentaje } = reglasDe(clase);
    const anticipo = centavos(Math.min(total, Math.max(total * porcentaje, APARTADO.anticipoMinimo)));
    return {
        total: centavos(total),
        anticipo,
        saldo: centavos(total - anticipo),
        tipo: clase,
        porcentaje: porcentajeAnticipo(clase),
    };
}

/**
 * Fecha limite para liquidar, en hora local.
 *
 * Devuelve null en una preventa, y es la respuesta correcta: su plazo cuenta
 * desde que el pedido llega a la tienda, y esa fecha no existe hasta que
 * alguien la marca en el POS. Poner aqui "hoy + 30" seria prometer una fecha
 * que no se va a cumplir.
 */
export function fechaLimite(desde = new Date(), tipo = 'normal') {
    const { dias } = reglasDe(tipo);
    if (dias === null) return null;
    const f = new Date(desde);
    f.setDate(f.getDate() + dias);
    return f;
}

/**
 * Si el articulo se vende como preventa.
 *
 * `products` no tiene columna de tipo: el ENUM('stock','preventa') vive en
 * `cart_items`, y ahi lo escribe quien llama a `addItem`, no la base. El unico
 * marcador que trae el producto es la etiqueta (o el genero) "preventa" — la
 * misma que /mangas y /figuras excluyen de sus filtros con `map.delete`.
 */
export function esPreventa(producto) {
    if (!producto) return false;
    const etiquetas = Array.isArray(producto.tags) ? producto.tags : [];
    return [...etiquetas, producto.gender, producto.category]
        .some((v) => typeof v === 'string' && v.trim().toLowerCase() === 'preventa');
}

/** Tipo de apartado que le corresponde a un producto del catalogo. */
export function tipoDeApartado(producto) {
    return esPreventa(producto) ? 'preventa' : 'normal';
}
