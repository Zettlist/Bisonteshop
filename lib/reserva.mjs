/**
 * Apartar el inventario de un pedido web.
 *
 * ── El agujero que esto tapa ────────────────────────────────────────────────
 *
 * El POS lo daba por hecho desde hace tiempo. Su comentario, textual:
 *
 *     "La tienda reserva al confirmar el checkout (stock_reservado +=
 *      cantidad), con CHECK (stock_reservado <= stock) impidiendo la
 *      sobreventa desde la base. Aqui solo se consuma o se libera."
 *
 * La tienda no lo hacia. Nadie escribia `stock_reservado` en todo el proyecto,
 * y no se noto porque el POS lo resta con GREATEST(0, ...): restarle a un cero
 * que nunca subio no rompe nada visible. El stock fisico bajaba bien; lo que no
 * existia era el aparte.
 *
 * Consecuencia, con nueve piezas: entraban nueve pedidos, y el decimo, y el
 * undecimo. Todos con la tarjeta autorizada. El mostrador confirmaba los nueve
 * primeros y los demas reventaban al confirmar, uno por uno, con un aviso que
 * decia "cancela manualmente y contacta al cliente".
 *
 * ── Por que un UPDATE condicional y no leer-y-luego-escribir ────────────────
 *
 * Porque dos clientes que leen "queda 1" a la vez leen los dos que si. La
 * condicion viaja DENTRO del UPDATE:
 *
 *     SET stock_reservado = stock_reservado + N
 *     WHERE id = ? AND stock_reservado + N <= stock
 *
 * InnoDB bloquea la fila para evaluarla, asi que de dos peticiones simultaneas
 * una entra y la otra ve el contador ya subido y no cumple la condicion.
 * `affectedRows = 0` es la respuesta: "no alcanzo". No hay ventana entre
 * comprobar y apartar porque son la misma operacion.
 *
 * El CHECK (stock_reservado <= stock) de la tabla dice lo mismo y es la red de
 * abajo. La diferencia es el trato: el CHECK tira la transaccion con un error
 * de base de datos, y esto devuelve una lista de nombres que se le puede
 * ensenar a alguien.
 */

/**
 * Aparta `lines` para un pedido. Espera una conexion con transaccion abierta.
 *
 * @returns {Promise<Array<{id:number, name:string, pedido:number}>>}
 *          Los renglones que NO alcanzaron. Vacio = todo apartado.
 */
export async function reservarStock(conn, lines) {
    // Dos renglones del mismo producto son dos filas en `sale_items` (un
    // carrito puede traer el mismo id dos veces), pero UNA sola reserva. Sin
    // agrupar, el segundo UPDATE se evaluaria contra el contador que acaba de
    // subir el primero y pediria de mas.
    const porProducto = new Map();
    for (const l of lines) {
        // La preventa no se aparta aqui: su contador es `preventa_reservada` y
        // lo lleva el POS desde `pre_orders`, al llegar el pedido del
        // proveedor. Tocarlo desde la tienda descuadraria ese arribo, que
        // calcula las piezas libres como `cantidad - preventa_reservada`.
        if (l.esPreventa) continue;
        const prev = porProducto.get(l.id);
        if (prev) prev.cantidad += l.quantity;
        else porProducto.set(l.id, { id: l.id, name: l.name, cantidad: l.quantity });
    }

    // Por id ascendente, siempre. Dos pedidos que comparten productos los
    // bloquean en el mismo orden y no se quedan esperandose en cruz: eso es un
    // deadlock, y MySQL lo resuelve matando una de las dos transacciones.
    const enOrden = [...porProducto.values()].sort((a, b) => a.id - b.id);

    const faltantes = [];
    for (const p of enOrden) {
        const [r] = await conn.query(
            `UPDATE products
                SET stock_reservado = stock_reservado + ?
              WHERE id = ? AND stock_reservado + ? <= stock`,
            [p.cantidad, p.id, p.cantidad]
        );
        if (r.affectedRows === 0) faltantes.push({ id: p.id, name: p.name, pedido: p.cantidad });
    }

    return faltantes;
}
