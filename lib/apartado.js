/**
 * Reglas del apartado.
 *
 * Viven aqui y no repartidas por la interfaz porque son condiciones de venta:
 * cuando cambien, tienen que cambiar a la vez en el dialogo, en el correo de
 * confirmacion y en lo que se guarda en `pre_orders`. Un porcentaje escrito a
 * mano en dos sitios es una promesa distinta en cada uno.
 *
 * Politica confirmada con la tienda. El mismo cuadro esta en la seccion 7 de
 * TerminosModal.js y en TorlanPOS/backend/utils/apartados.js, que es lo que
 * aplica el job de vencimientos: los tres tienen que decir lo mismo.
 *
 * Hoy NO lo dicen en un punto: el POS vence las preventas a los 30 dias del
 * anticipo y aqui son 15, por lo que se explica abajo. Esta pendiente decidir
 * cual gana.
 */
export const APARTADO = {
    // Apartado de un articulo que ya esta en la tienda.
    porcentajeAnticipoNormal: 0.30,
    // Preventa: el articulo es de importacion y todavia no existe. El anticipo
    // mas alto cubre el pedido al proveedor, que se hace por adelantado.
    porcentajeAnticipoPreventa: 0.50,
    // Piso en pesos: un anticipo del 30% sobre un articulo de $80 son $24, y la
    // comision de Stripe se come una parte que no justifica el movimiento.
    anticipoMinimo: 100,
    // Los 15 dias aplican a los dos tipos (clausula 7.3 de los terminos).
    //
    // Lo que cambia en la preventa es CUANDO empieza a contar: segun 7.3, el
    // plazo corre desde que el articulo esta disponible en almacen, no desde
    // el anticipo. Eso no se puede calcular todavia: no hay fecha de arribo en
    // ninguna parte del flujo — `products` no la tiene y `publication_date` es
    // texto libre (VARCHAR(50), con valores como "Marzo 2026").
    //
    // Asi que la fecha limite que pinta el dialogo de una preventa es la del
    // apartado + 15 dias, que es MAS ESTRICTA que la prometida en los
    // terminos. No se inventa una fecha de disponibilidad para rellenar el
    // hueco: cuando el POS registre la llegada del pedido al proveedor, el
    // conteo se mueve a esa fecha y `fechaLimite` recibe el arribo como
    // `desde`, sin tocar el resto.
    diasParaLiquidar: 15,
};

/** Los dos tipos, con su porcentaje y su plazo. */
const REGLAS = {
    normal: { porcentaje: APARTADO.porcentajeAnticipoNormal, dias: APARTADO.diasParaLiquidar },
    preventa: { porcentaje: APARTADO.porcentajeAnticipoPreventa, dias: APARTADO.diasParaLiquidar },
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

/** Fecha limite para liquidar, en hora local. */
export function fechaLimite(desde = new Date(), tipo = 'normal') {
    const f = new Date(desde);
    f.setDate(f.getDate() + reglasDe(tipo).dias);
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
