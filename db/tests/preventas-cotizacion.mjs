/**
 * El camino que va de la cotizacion al catalogo y de vuelta al stock.
 *
 * Se cotiza una lista, se acepta la propuesta de un proveedor, y sus renglones
 * se dan de alta como productos en estado 'preventa': existen en la tienda, se
 * pueden comprar y apartar, y no suman ni una pieza al stock. Cuando el pedido
 * llega, lo que nadie compro pasa a stock y el articulo deja de ser preventa.
 *
 * Lo que se prueba aqui es lo que sostiene esa cuenta, porque si falla alguien
 * cobra dos veces la misma pieza o promete una que no tiene.
 */
import { test, sql, expectError, assert, assertEqual, assertUsesIndex, seed } from './harness.mjs';

const G = 'PREVENTA DESDE COTIZACION';

let n = 0;

/** Una cotizacion con un renglon y una propuesta de proveedor que lo cubre. */
async function cotizacion(f, { unidades = 3, piezas = 1 } = {}) {
    const [c] = await sql(
        `INSERT INTO cotizaciones (empresa_id, nombre, tipo_cambio) VALUES (?,?,?)`,
        [f.empresaId, `Pedido Japon ${++n}`, 0.1300]);
    const [i] = await sql(
        `INSERT INTO cotizacion_items (cotizacion_id, empresa_id, producto, unidades, piezas,
                                       costo_compra, precio_venta)
         VALUES (?,?,?,?,?,?,?)`,
        [c.insertId, f.empresaId, 'Berserk Deluxe Vol.3', unidades, piezas, 2000.00, 890.00]);
    const [p] = await sql(
        `INSERT INTO cotizacion_proveedores (cotizacion_id, empresa_id, nombre, moneda, item_ids)
         VALUES (?,?,?,?,CAST(? AS JSON))`,
        [c.insertId, f.empresaId, 'Mandarake', 'JPY', JSON.stringify([i.insertId])]);
    return { cotizacionId: c.insertId, itemId: i.insertId, proveedorId: p.insertId };
}

/** El producto en preventa que sale de un renglon, con sus piezas en camino. */
async function productoEnPreventa(f, cantidad) {
    const [p] = await sql(
        `INSERT INTO products (empresa_id, name, cost_price, sale_price, stock,
                               estado, preventa_cantidad)
         VALUES (?,?,?,?,?,?,?)`,
        [f.empresaId, `Berserk Deluxe Vol.3 #${++n}`, 260.00, 890.00, 0, 'preventa', cantidad]);
    return p.insertId;
}

/** El pedido al proveedor, con el renglon que ata producto y cantidad. */
async function pedido(f, cot, productId, cantidad) {
    const [pe] = await sql(
        `INSERT INTO cotizacion_pedidos (empresa_id, cotizacion_id, proveedor_id,
                                         proveedor_nombre, costo_total, moneda, tipo_cambio)
         VALUES (?,?,?,?,?,?,?)`,
        [f.empresaId, cot.cotizacionId, cot.proveedorId, 'Mandarake', 6000.00, 'JPY', 0.1300]);
    const [it] = await sql(
        `INSERT INTO cotizacion_pedido_items (pedido_id, cotizacion_item_id, product_id, cantidad)
         VALUES (?,?,?,?)`,
        [pe.insertId, cot.itemId, productId, cantidad]);
    return { pedidoId: pe.insertId, itemId: it.insertId };
}

// ── El articulo existe, pero no esta ────────────────────────────────────────
test(G, 'un producto en preventa no suma nada al stock', async () => {
    // Es todo el sentido de la columna aparte. Si las piezas en camino entraran
    // a `stock`, el mostrador vendria a buscar al estante algo que sigue en un
    // barco, y el inventario fisico nunca cuadraria.
    const f = await seed();
    const id = await productoEnPreventa(f, 12);
    const [r] = await sql(
        `SELECT stock, stock_disponible, preventa_cantidad, preventa_disponible, estado
           FROM products WHERE id = ?`, [id]);
    assertEqual(r[0].stock, 0);
    assertEqual(r[0].stock_disponible, 0);
    assertEqual(r[0].preventa_cantidad, 12);
    assertEqual(r[0].preventa_disponible, 12);
    assertEqual(r[0].estado, 'preventa');
});

test(G, 'piezas en camino en un articulo que no esta en preventa se rechazan', async () => {
    // Serian piezas que nadie va a recibir. Al marcar la llegada el contador
    // baja a cero y el estado pasa a 'normal': las dos cosas ocurren juntas o
    // el catalogo miente en una de las dos.
    const f = await seed();
    await expectError(
        () => sql(`UPDATE products SET preventa_cantidad = 5 WHERE id = ?`, [f.productId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'no se puede comprometer mas preventa de la que viene en camino', async () => {
    // La sobreventa de lo que ni siquiera ha llegado. La rechaza la base, igual
    // que el CHECK (stock_reservado <= stock) hace con la mercancia real.
    const f = await seed();
    const id = await productoEnPreventa(f, 3);
    await expectError(
        () => sql(`UPDATE products SET preventa_reservada = 4 WHERE id = ?`, [id]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

// ── Un producto, un pedido abierto ──────────────────────────────────────────
test(G, 'un producto no puede estar en dos pedidos abiertos a la vez', async () => {
    // De esto depende que la llegada cuadre. Al arribar, lo que pasa al stock es
    // `cantidad - preventa_reservada`, y esa resta solo es correcta si el
    // contador del producto pertenece a UN pedido: con dos abiertos, lo vendido
    // de uno se descontaria del otro y sobrarian piezas de la nada.
    const f = await seed();
    const cot = await cotizacion(f);
    const id = await productoEnPreventa(f, 3);
    await pedido(f, cot, id, 3);

    const otra = await cotizacion(f);
    await expectError(() => pedido(f, otra, id, 5), 'ER_DUP_ENTRY');
});

test(G, 'cuando el renglon arriba, el mismo titulo se puede volver a pedir', async () => {
    // El UNIQUE viaja en una columna generada que vale NULL una vez marcada la
    // llegada, y en un indice UNIQUE los NULL no chocan. Sin eso, pedir la
    // misma serie la temporada siguiente seria imposible.
    const f = await seed();
    const cot = await cotizacion(f);
    const id = await productoEnPreventa(f, 3);
    const primero = await pedido(f, cot, id, 3);

    await sql(`UPDATE cotizacion_pedido_items SET cerrado_at = NOW() WHERE id = ?`,
        [primero.itemId]);
    await sql(`UPDATE products SET stock = stock + 3, preventa_cantidad = 0, estado = 'normal'
                WHERE id = ?`, [id]);

    // La segunda temporada: vuelve a preventa y entra en un pedido nuevo.
    await sql(`UPDATE products SET estado = 'preventa', preventa_cantidad = 4 WHERE id = ?`, [id]);
    const otra = await cotizacion(f);
    const segundo = await pedido(f, otra, id, 4);
    assert(segundo.itemId > 0, 'el segundo pedido tenia que poder crearse');
});

test(G, 'cancelar cierra el renglon sin inventar una llegada', async () => {
    // Cerrar un renglon y que el pedido haya llegado son dos cosas distintas, y
    // por eso la columna se llama `cerrado_at` y no `arribado_at`: un pedido se
    // cancela cuando el proveedor no lo manda, y dejar escrito ahi una fecha de
    // llegada seria decir que entro mercancia que no existe. La llegada de
    // verdad vive en la cabecera, y en un pedido cancelado no la hay.
    const f = await seed();
    const cot = await cotizacion(f);
    const id = await productoEnPreventa(f, 3);
    const pe = await pedido(f, cot, id, 3);

    await sql(`UPDATE products SET preventa_cantidad = 0, preventa_reservada = 0 WHERE id = ?`, [id]);
    await sql(`UPDATE cotizacion_pedido_items SET cerrado_at = NOW() WHERE pedido_id = ?`, [pe.pedidoId]);
    await sql(`UPDATE cotizacion_pedidos SET estado = 'cancelado' WHERE id = ?`, [pe.pedidoId]);

    const [cab] = await sql(
        `SELECT estado, arribado_at FROM cotizacion_pedidos WHERE id = ?`, [pe.pedidoId]);
    assertEqual(cab[0].estado, 'cancelado');
    assertEqual(cab[0].arribado_at, null, 'un pedido cancelado no llego nunca');

    // Y el producto queda libre para entrar en el pedido correcto.
    await sql(`UPDATE products SET preventa_cantidad = 3 WHERE id = ?`, [id]);
    const otra = await cotizacion(f);
    const segundo = await pedido(f, otra, id, 3);
    assert(segundo.itemId > 0, 'el producto tenia que quedar libre tras cancelar');
});

test(G, 'un pedido arribado sin fecha de arribo lo rechaza la base', async () => {
    // Seria no saber cuando empezaron a correr los plazos de todos los clientes
    // que esperaban este pedido.
    const f = await seed();
    const cot = await cotizacion(f);
    const id = await productoEnPreventa(f, 3);
    const pe = await pedido(f, cot, id, 3);
    await expectError(
        () => sql(`UPDATE cotizacion_pedidos SET estado = 'arribado' WHERE id = ?`, [pe.pedidoId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'un renglon de pedido de cero piezas no tiene sentido', async () => {
    const f = await seed();
    const cot = await cotizacion(f);
    const id = await productoEnPreventa(f, 3);
    const [pe] = await sql(
        `INSERT INTO cotizacion_pedidos (empresa_id, cotizacion_id, proveedor_nombre)
         VALUES (?,?,?)`, [f.empresaId, cot.cotizacionId, 'Mandarake']);
    await expectError(
        () => sql(`INSERT INTO cotizacion_pedido_items (pedido_id, product_id, cantidad)
                   VALUES (?,?,?)`, [pe.insertId, id, 0]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

// ── La llegada: al stock solo lo que nadie compro ───────────────────────────
test(G, 'al llegar el pedido, al stock pasa solo lo que nadie compro', async () => {
    // Las piezas vendidas y apartadas tambien llegan, pero tienen dueño: se
    // entregan desde su preventa y no entran nunca al catalogo. Meterlas al
    // stock las pondria a la venta por segunda vez.
    const f = await seed();
    const cot = await cotizacion(f);
    const id = await productoEnPreventa(f, 10);
    const pe = await pedido(f, cot, id, 10);

    // Cuatro piezas con dueño: dos compradas de golpe y dos apartadas.
    await sql(`INSERT INTO pre_orders (empresa_id, pedido_id, product_id, quantity, modalidad,
                                       origen, order_number, client_name, title,
                                       total_price, deposit, total_paid, balance,
                                       is_paid_in_full, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [f.empresaId, pe.pedidoId, id, 2, 'compra', 'tienda', `PV-C${n}`, 'Ana Lopez',
            'Berserk Deluxe Vol.3', 1780.00, 1780.00, 1780.00, 0, 1, 'paid']);
    await sql(`INSERT INTO pre_orders (empresa_id, pedido_id, product_id, quantity, modalidad,
                                       origen, order_number, client_name, title,
                                       total_price, deposit, total_paid, balance, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [f.empresaId, pe.pedidoId, id, 2, 'apartado', 'tienda', `PV-A${n}`, 'Beto Salgado',
            'Berserk Deluxe Vol.3', 1780.00, 890.00, 890.00, 890.00, 'pending']);
    await sql(`UPDATE products SET preventa_reservada = 4 WHERE id = ?`, [id]);

    // Lo que hace el boton "Pedido Arribado", en una transaccion.
    const [[{ reservada }]] = await sql(
        `SELECT preventa_reservada AS reservada FROM products WHERE id = ?`, [id]);
    await sql(`UPDATE products
                  SET stock = stock + (10 - ?),
                      preventa_cantidad = preventa_cantidad - 10,
                      preventa_reservada = preventa_reservada - ?,
                      estado = 'normal'
                WHERE id = ?`, [reservada, reservada, id]);
    await sql(`UPDATE cotizacion_pedido_items SET cerrado_at = NOW() WHERE pedido_id = ?`,
        [pe.pedidoId]);
    await sql(`UPDATE cotizacion_pedidos SET estado = 'arribado', arribado_at = NOW()
                WHERE id = ?`, [pe.pedidoId]);

    const [r] = await sql(
        `SELECT stock, preventa_cantidad, preventa_reservada, estado FROM products WHERE id = ?`,
        [id]);
    assertEqual(r[0].stock, 6, 'seis piezas libres tenian que entrar al catalogo');
    assertEqual(r[0].preventa_cantidad, 0);
    assertEqual(r[0].preventa_reservada, 0);
    assertEqual(r[0].estado, 'normal');
});

test(G, 'la llegada busca sus preventas por indice, no recorriendo la tabla', async () => {
    // Corre una vez por pedido y toca todas las preventas que colgaban de el.
    await assertUsesIndex(
        `SELECT product_id, SUM(quantity) FROM pre_orders
          WHERE pedido_id = ? AND product_id = ? GROUP BY product_id`,
        [1, 1], 'idx_pedido');
});

// ── Comprado o apartado: la separacion que pide el panel ────────────────────
test(G, 'una compra no puede quedar debiendo', async () => {
    // "Comprado directamente" significa que no debe nada. Con saldo seria un
    // apartado con otro nombre, y el panel le reclamaria un pago a quien ya
    // pago todo.
    const f = await seed();
    await expectError(
        () => sql(`INSERT INTO pre_orders (empresa_id, order_number, client_name, modalidad,
                                           title, total_price, deposit, total_paid, balance)
                   VALUES (?,?,?,?,?,?,?,?,?)`,
            [f.empresaId, `PV-MAL${n}`, 'Ana Lopez', 'compra', 'Berserk',
                1780.00, 890.00, 890.00, 890.00]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'un apartado si puede quedar debiendo: es lo que es', async () => {
    const f = await seed();
    const [r] = await sql(
        `INSERT INTO pre_orders (empresa_id, order_number, client_name, modalidad,
                                 title, total_price, deposit, total_paid, balance)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [f.empresaId, `PV-OK${++n}`, 'Ana Lopez', 'apartado', 'Berserk',
            1780.00, 890.00, 890.00, 890.00]);
    assert(r.insertId > 0, 'el apartado tenia que poder crearse');
});

test(G, 'la preventa de mostrador sigue sin producto y sin pedido', async () => {
    // Un encargo suelto que nadie cotizo. Es el caso que existia antes de todo
    // esto y no puede dejar de funcionar: se registra con el titulo a mano y se
    // le marca la llegada en su propia fila.
    const f = await seed();
    const [r] = await sql(
        `INSERT INTO pre_orders (empresa_id, order_number, client_name, title,
                                 total_price, deposit, total_paid, balance)
         VALUES (?,?,?,?,?,?,?,?)`,
        [f.empresaId, `PV-MOS${++n}`, 'Carmen Duarte', 'Figura Rem 1/8',
            3200.00, 1000.00, 1000.00, 2200.00]);
    const [q] = await sql(
        `SELECT pedido_id, product_id, quantity, modalidad, origen FROM pre_orders WHERE id = ?`,
        [r.insertId]);
    assertEqual(q[0].pedido_id, null);
    assertEqual(q[0].product_id, null);
    assertEqual(q[0].quantity, 1);
    assertEqual(q[0].modalidad, 'apartado');
    assertEqual(q[0].origen, 'mostrador');
});

// ── Lo que sobrevive a que alguien borre algo ───────────────────────────────
test(G, 'reescribir los proveedores no borra el pedido ya hecho', async () => {
    // El PUT de proveedores reemplaza la lista entera: borra todos y reinserta.
    // Con CASCADE, editar una cotizacion vieja se llevaria por delante un pedido
    // que ya tiene mercancia pagada detras.
    const f = await seed();
    const cot = await cotizacion(f);
    const id = await productoEnPreventa(f, 3);
    const pe = await pedido(f, cot, id, 3);

    await sql(`DELETE FROM cotizacion_proveedores WHERE id = ?`, [cot.proveedorId]);

    const [r] = await sql(
        `SELECT proveedor_id, proveedor_nombre, costo_total FROM cotizacion_pedidos WHERE id = ?`,
        [pe.pedidoId]);
    assertEqual(r.length, 1, 'el pedido tenia que seguir existiendo');
    assertEqual(r[0].proveedor_id, null);
    assertEqual(r[0].proveedor_nombre, 'Mandarake', 'la copia del nombre es lo que queda');
});

test(G, 'borrar el producto no borra la preventa de quien ya pago', async () => {
    // Queda `title`, que es texto y sobrevive. El compromiso con el cliente no
    // depende de que el articulo siga en el catalogo.
    const f = await seed();
    const id = await productoEnPreventa(f, 3);
    const [r] = await sql(
        `INSERT INTO pre_orders (empresa_id, product_id, order_number, client_name, title,
                                 total_price, deposit, total_paid, balance)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [f.empresaId, id, `PV-DEL${++n}`, 'Ana Lopez', 'Berserk Deluxe Vol.3',
            1780.00, 890.00, 890.00, 890.00]);

    await sql(`DELETE FROM products WHERE id = ?`, [id]);

    const [q] = await sql(`SELECT product_id, title FROM pre_orders WHERE id = ?`, [r.insertId]);
    assertEqual(q.length, 1, 'la preventa tenia que seguir ahi');
    assertEqual(q[0].product_id, null);
    assertEqual(q[0].title, 'Berserk Deluxe Vol.3');
});

test(G, 'borrar la cotizacion se lleva su pedido y sus renglones', async () => {
    // Al reves que lo anterior: la cotizacion es la dueña del pedido. Lo que no
    // se lleva son los productos ni las preventas, que ya viven por su cuenta.
    const f = await seed();
    const cot = await cotizacion(f);
    const id = await productoEnPreventa(f, 3);
    const pe = await pedido(f, cot, id, 3);

    await sql(`DELETE FROM cotizaciones WHERE id = ?`, [cot.cotizacionId]);

    const [ped] = await sql(`SELECT id FROM cotizacion_pedidos WHERE id = ?`, [pe.pedidoId]);
    const [items] = await sql(`SELECT id FROM cotizacion_pedido_items WHERE pedido_id = ?`,
        [pe.pedidoId]);
    const [prod] = await sql(`SELECT id FROM products WHERE id = ?`, [id]);
    assertEqual(ped.length, 0);
    assertEqual(items.length, 0);
    assertEqual(prod.length, 1, 'el producto del catalogo no se toca');
});

// ── Los renglones de la cotizacion ──────────────────────────────────────────
test(G, 'un renglon de cotizacion de cero unidades se rechaza', async () => {
    // Al convertirlo daria un pedido de cero articulos, y el conversor confia en
    // que la cantidad (unidades * piezas) es positiva.
    const f = await seed();
    const [c] = await sql(
        `INSERT INTO cotizaciones (empresa_id, nombre, tipo_cambio) VALUES (?,?,?)`,
        [f.empresaId, `Cotizacion mala ${++n}`, 0.1300]);
    await expectError(
        () => sql(`INSERT INTO cotizacion_items (cotizacion_id, empresa_id, producto, unidades)
                   VALUES (?,?,?,?)`, [c.insertId, f.empresaId, 'Nada', 0]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'la tienda encuentra lo que esta en preventa por indice', async () => {
    // La consulta del catalogo. Sin indice recorre el catalogo entero para
    // encontrar las pocas filas que estan en preventa.
    await assertUsesIndex(
        `SELECT id, name, sale_price FROM products WHERE empresa_id = ? AND estado = 'preventa'`,
        [1], 'idx_empresa_estado');
});

// ── El camino de vuelta ─────────────────────────────────────────────────────
//
// Una preventa viva mantiene su mercancia fuera de la venta: antes de llegar
// como `preventa_reservada`, y despues como una pieza que arribo pero no entro
// al stock porque ya tenia dueño. Todo lo que la mata tiene que devolverla, y
// exactamente una vez. Lo que se prueba aqui es esa cuenta, que es la que
// decide si una pieza acaba existiendo en la bodega y no en el sistema.

/** Una preventa sobre un articulo del catalogo. */
async function preventaDe(f, productId, { pedidoId = null, cantidad = 1, llegada = null,
                                          status = 'pending', saldo = 890.00 } = {}) {
    const [r] = await sql(
        `INSERT INTO pre_orders (empresa_id, pedido_id, product_id, quantity, modalidad,
                                 origen, order_number, client_name, title, total_price,
                                 deposit, total_paid, balance, status, arrived_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [f.empresaId, pedidoId, productId, cantidad, 'apartado', 'mostrador',
            `PV-V${++n}`, 'Ana Lopez', 'Berserk Deluxe Vol.3', 1780.00,
            890.00, 890.00, saldo, status, llegada]);
    return r.insertId;
}

test(G, 'cerrar una preventa a mano sin fecha se rechaza', async () => {
    // Cerrar mueve inventario: la pieza vuelve a `preventa_reservada` o al
    // stock. Sin fecha ese movimiento no se puede auditar, y una fila cerrada
    // hoy no se distingue de una que lleva medio año cerrada.
    const f = await seed();
    const id = await productoEnPreventa(f, 3);
    await expectError(
        () => preventaDe(f, id, { status: 'cancelled' }),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'vencer no es cerrar: no necesita fecha de cierre', async () => {
    // Una vencida sigue en el panel. La clausula 7.6 tiene una excepcion -- que
    // el proveedor no surtiera -- que una persona tiene que reconocer, asi que
    // vencer tiene su propio `expired_at` y no pasa por `cerrado_at`.
    const f = await seed();
    const id = await productoEnPreventa(f, 3);
    const pv = await preventaDe(f, id, { status: 'expired' });
    const [r] = await sql(`SELECT status, cerrado_at FROM pre_orders WHERE id = ?`, [pv]);
    assertEqual(r[0].status, 'expired');
    assertEqual(r[0].cerrado_at, null);
});

test(G, 'cancelar antes de que llegue devuelve lo comprometido', async () => {
    // Sin esto el contador se queda arriba para siempre y, al arribar el pedido,
    // esa pieza no entra al stock de nadie: existe en la bodega y no aqui.
    const f = await seed();
    const id = await productoEnPreventa(f, 5);
    const pv = await preventaDe(f, id, { cantidad: 2 });
    await sql(`UPDATE products SET preventa_reservada = 2 WHERE id = ?`, [id]);

    // Lo que hace POST /api/preventas/:id/cancelar, en una transaccion.
    await sql(`UPDATE products SET preventa_reservada = GREATEST(preventa_reservada - 2, 0)
                WHERE id = ?`, [id]);
    await sql(`UPDATE pre_orders SET status = 'cancelled', cerrado_at = NOW() WHERE id = ?`, [pv]);

    const [r] = await sql(
        `SELECT stock, preventa_cantidad, preventa_reservada, preventa_disponible
           FROM products WHERE id = ?`, [id]);
    assertEqual(r[0].preventa_reservada, 0, 'lo comprometido tenia que soltarse');
    assertEqual(r[0].preventa_disponible, 5, 'las cinco vuelven a estar a la venta');
    assertEqual(r[0].stock, 0, 'no ha llegado nada: al stock no entra ni una');
});

test(G, 'cancelar despues de la llegada devuelve la pieza al stock', async () => {
    // Ya arribo: la pieza esta en la tienda, fuera del stock porque tenia dueño.
    // Al quedarse sin el tiene que volver al catalogo o desaparece del sistema
    // sin salir de la bodega.
    const f = await seed();
    const id = await productoEnPreventa(f, 5);
    const pv = await preventaDe(f, id, { cantidad: 2, llegada: new Date() });
    // Estado tras el arribo: tres libres al stock, dos comprometidas fuera.
    await sql(`UPDATE products SET stock = 3, preventa_cantidad = 0, preventa_reservada = 0,
                                   estado = 'normal' WHERE id = ?`, [id]);

    await sql(`UPDATE products SET stock = stock + 2 WHERE id = ?`, [id]);
    await sql(`UPDATE pre_orders SET status = 'cancelled', cerrado_at = NOW() WHERE id = ?`, [pv]);

    const [r] = await sql(`SELECT stock, stock_disponible FROM products WHERE id = ?`, [id]);
    assertEqual(r[0].stock, 5, 'la pieza que ya no tiene dueño vuelve al catalogo');
    assertEqual(r[0].stock_disponible, 5);
});

test(G, 'vencer devuelve la pieza al catalogo', async () => {
    // El job nocturno. Antes solo marcaba 'expired' porque una preventa no tenia
    // articulo detras; ahora si lo tiene, y la pieza que el cliente dejo de
    // tener derecho a recoger vuelve a estar a la venta.
    const f = await seed();
    const id = await productoEnPreventa(f, 4);
    const pv = await preventaDe(f, id, { cantidad: 1, llegada: new Date() });
    await sql(`UPDATE products SET stock = 3, preventa_cantidad = 0, preventa_reservada = 0,
                                   estado = 'normal' WHERE id = ?`, [id]);

    await sql(`UPDATE pre_orders SET status = 'expired', expired_at = NOW() WHERE id = ?`, [pv]);
    await sql(`UPDATE products SET stock = stock + 1 WHERE id = ?`, [id]);

    const [r] = await sql(`SELECT stock FROM products WHERE id = ?`, [id]);
    assertEqual(r[0].stock, 4);
    const [p] = await sql(`SELECT status, cerrado_at FROM pre_orders WHERE id = ?`, [pv]);
    assertEqual(p[0].status, 'expired');
    assertEqual(p[0].cerrado_at, null, 'vencer no cierra: el panel la sigue enseñando');
});

test(G, 'renovar no puede sacar del stock una pieza que ya no esta', async () => {
    // Mientras estuvo vencida, la pieza volvio al catalogo y cualquiera pudo
    // llevarsela. Renovarle el plazo al cliente exige retirarla otra vez, y si
    // ya no esta hay que decirlo en vez de dejar el stock en negativo.
    const f = await seed();
    const id = await productoEnPreventa(f, 2);
    await sql(`UPDATE products SET preventa_cantidad = 0, estado = 'normal', stock = 0
                WHERE id = ?`, [id]);

    const [r] = await sql(
        `UPDATE products SET stock = stock - 1 WHERE id = ? AND stock >= 1`, [id]);
    assertEqual(r.affectedRows, 0, 'sin pieza no hay renovacion que valga');

    const [q] = await sql(`SELECT stock FROM products WHERE id = ?`, [id]);
    assertEqual(q[0].stock, 0, 'y el stock no se queda en negativo');
});

// ── La preventa que no salio de una cotizacion ──────────────────────────────
test(G, 'una preventa suelta puede arribar sin pedido', async () => {
    // El formulario de productos deja marcar un articulo como preventa a mano.
    // Sin esto se quedaba asi para siempre: el boton de arribo vive en
    // Cotizaciones y solo conoce pedidos.
    const f = await seed();
    const id = await productoEnPreventa(f, 4);
    const pv = await preventaDe(f, id, { cantidad: 1 });
    await sql(`UPDATE products SET preventa_reservada = 1 WHERE id = ?`, [id]);

    // Lo que hace POST /api/products/:id/arribo.
    await sql(`UPDATE products SET stock = stock + (4 - 1), preventa_cantidad = 0,
                                   preventa_reservada = 0, estado = 'normal'
                WHERE id = ?`, [id]);
    await sql(`UPDATE pre_orders SET arrived_at = NOW(),
                      expires_at = DATE_ADD(NOW(), INTERVAL dias_plazo DAY)
                WHERE product_id = ? AND pedido_id IS NULL AND arrived_at IS NULL
                  AND status IN ('pending','paid')`, [id]);

    const [r] = await sql(
        `SELECT stock, preventa_cantidad, estado FROM products WHERE id = ?`, [id]);
    assertEqual(r[0].stock, 3, 'las tres libres entran al catalogo; la comprometida no');
    assertEqual(r[0].preventa_cantidad, 0);
    assertEqual(r[0].estado, 'normal');

    const [p] = await sql(`SELECT arrived_at, expires_at FROM pre_orders WHERE id = ?`, [pv]);
    assert(p[0].arrived_at !== null, 'el reloj tenia que arrancar');
    assert(p[0].expires_at !== null, 'y con fecha limite, porque todavia debe');
});

test(G, 'una preventa de mostrador no se toca al arribar un articulo', async () => {
    // La de siempre: un encargo suelto, sin producto. El arribo de un articulo
    // del catalogo no puede arrancarle el reloj a algo que no tiene que ver.
    const f = await seed();
    const id = await productoEnPreventa(f, 2);
    const [r] = await sql(
        `INSERT INTO pre_orders (empresa_id, order_number, client_name, title,
                                 total_price, deposit, total_paid, balance)
         VALUES (?,?,?,?,?,?,?,?)`,
        [f.empresaId, `PV-M${++n}`, 'Ana Lopez', 'Un tomo pedido a mano',
            500.00, 250.00, 250.00, 250.00]);

    const [u] = await sql(
        `UPDATE pre_orders SET arrived_at = NOW()
          WHERE product_id = ? AND pedido_id IS NULL AND arrived_at IS NULL
            AND status IN ('pending','paid')`, [id]);
    assertEqual(u.affectedRows, 0, 'no cuelga de ningun articulo');

    const [p] = await sql(`SELECT arrived_at FROM pre_orders WHERE id = ?`, [r.insertId]);
    assertEqual(p[0].arrived_at, null);
});
