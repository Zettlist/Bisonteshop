/**
 * Reglas del apartado.
 *
 * Viven aqui y no repartidas por la interfaz porque son condiciones de venta:
 * cuando cambien, tienen que cambiar a la vez en el dialogo, en el correo de
 * confirmacion y en lo que se guarda en `pre_orders`. Un porcentaje escrito a
 * mano en dos sitios es una promesa distinta en cada uno.
 *
 * PENDIENTE DE CONFIRMAR CON LA TIENDA: el 30% y los 15 dias son la propuesta,
 * no una politica acordada.
 */
export const APARTADO = {
    porcentajeAnticipo: 0.30,
    // Piso en pesos: un anticipo del 30% sobre un articulo de $80 son $24, y la
    // comision de Stripe se come una parte que no justifica el movimiento.
    anticipoMinimo: 100,
    diasParaLiquidar: 15,
};

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
 */
export function calcularApartado(precio) {
    const total = Number(precio) || 0;
    if (total <= 0) return { total: 0, anticipo: 0, saldo: 0 };

    const anticipo = centavos(Math.min(total, Math.max(total * APARTADO.porcentajeAnticipo, APARTADO.anticipoMinimo)));
    return { total: centavos(total), anticipo, saldo: centavos(total - anticipo) };
}

/** Fecha limite para liquidar, en hora local. */
export function fechaLimite(desde = new Date()) {
    const f = new Date(desde);
    f.setDate(f.getDate() + APARTADO.diasParaLiquidar);
    return f;
}
