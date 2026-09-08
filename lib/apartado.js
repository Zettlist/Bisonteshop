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
 * Lo dice `products.estado`, que es una columna y no una etiqueta. Lo era hasta
 * ahora — bastaba con quitar la etiqueta "preventa" desde el alta de producto
 * para que el anticipo pasara del 50% al 30% sin que nada avisara — y de este
 * valor depende cuanto dinero se le pide a alguien, asi que manda la base.
 *
 * La etiqueta sigue valiendo como respaldo: los articulos anteriores a la
 * columna se marcaron con ella, y hasta que la migracion corra en produccion es
 * lo unico que los distingue.
 */
export function esPreventa(producto) {
    if (!producto) return false;
    if (producto.estado === 'preventa') return true;
    if (producto.estado === 'normal') return false;
    const etiquetas = Array.isArray(producto.tags) ? producto.tags : [];
    return [...etiquetas, producto.gender, producto.category]
        .some((v) => typeof v === 'string' && v.trim().toLowerCase() === 'preventa');
}

/** Tipo de apartado que le corresponde a un producto del catalogo. */
export function tipoDeApartado(producto) {
    return esPreventa(producto) ? 'preventa' : 'normal';
}

/**
 * Cuantas piezas se pueden vender de este articulo.
 *
 * Son dos contadores distintos y hay que mirar el que toca. Una preventa tiene
 * `stock = 0` siempre — la mercancia esta en un barco — y venderla contra el
 * stock la dejaria agotada desde el primer dia. Lo que la limita es cuanto se
 * pidio al proveedor menos lo que ya tiene dueño: `preventa_disponible`.
 *
 * Los dos son columnas generadas en la base (stock - reservado), asi que aqui
 * no se resta nada: se elige.
 */
export function disponiblesDe(producto) {
    if (!producto) return 0;
    if (esPreventa(producto)) {
        // Los articulos viejos marcados solo por etiqueta no tienen contador de
        // preventa. Se les deja pasar: se pedian a mano y el mostrador decide.
        const n = producto.preventa_disponible;
        return n === undefined || n === null ? Infinity : Math.max(Number(n) || 0, 0);
    }
    const n = producto.stock_disponible ?? producto.stock;
    return Math.max(Number(n) || 0, 0);
}

/** Si no queda ninguna pieza que vender. */
export function estaAgotado(producto) {
    return disponiblesDe(producto) <= 0;
}
