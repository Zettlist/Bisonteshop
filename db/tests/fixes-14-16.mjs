import { test, sql, expectError, assert, assertEqual, seed, makeSale } from './harness.mjs';

// ── FIX 14 ─ stock reservado materializado ──────────────────────────────────
test(14, 'stock_disponible se deriva solo', async () => {
    const f = await seed();                       // stock 10, reservado 0
    await sql(`UPDATE products SET stock_reservado = 3 WHERE id = ?`, [f.productId]);
    const [r] = await sql(`SELECT stock, stock_reservado, stock_disponible FROM products WHERE id = ?`,
        [f.productId]);
    assertEqual(r[0].stock, 10);
    assertEqual(r[0].stock_reservado, 3);
    assertEqual(r[0].stock_disponible, 7, 'la columna generada debe restar sola');
});

test(14, 'la base rechaza reservar mas de lo que hay', async () => {
    const f = await seed();                       // stock 10
    await expectError(
        () => sql(`UPDATE products SET stock_reservado = 11 WHERE id = ?`, [f.productId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(14, 'reservar exactamente todo el stock es valido', async () => {
    const f = await seed();
    await sql(`UPDATE products SET stock_reservado = 10 WHERE id = ?`, [f.productId]);
    const [r] = await sql(`SELECT stock_disponible FROM products WHERE id = ?`, [f.productId]);
    assertEqual(r[0].stock_disponible, 0);
});

test(14, 'no se puede bajar el stock por debajo de lo ya comprometido', async () => {
    const f = await seed();
    await sql(`UPDATE products SET stock_reservado = 8 WHERE id = ?`, [f.productId]);
    await expectError(
        () => sql(`UPDATE products SET stock = 5 WHERE id = ?`, [f.productId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(14, 'el catalogo consulta disponibilidad sin sumar la cola de pedidos', async () => {
    const f = await seed();
    await sql(`UPDATE products SET stock_reservado = 4 WHERE id = ?`, [f.productId]);
    // Antes esto exigia una subquery por item sobre todos los pedidos pendientes.
    const [r] = await sql(
        `SELECT id FROM products WHERE empresa_id = ? AND stock_disponible > 0`, [f.empresaId]);
    assertEqual(r.length, 1);
    const [plan] = await sql(
        `EXPLAIN SELECT id FROM products WHERE empresa_id = ? AND stock_disponible > 0`, [f.empresaId]);
    assert(!JSON.stringify(plan).includes('DEPENDENT SUBQUERY'), 'no debe haber subconsulta dependiente');
});

// ── FIX 15 ─ una sola tabla dueña del pedido web ────────────────────────────
async function webOrder(f, pi = 'pi_est') {
    const saleId = await makeSale(f, 'web');
    await sql(`INSERT INTO bisonte_orders (sale_id, cliente_id, payment_intent_id) VALUES (?,?,?)`,
        [saleId, f.clienteId, pi]);
    return saleId;
}

test(15, 'cobro y entrega avanzan en la misma fila', async () => {
    const f = await seed();
    const saleId = await webOrder(f, 'pi_ejes');
    await sql(
        `UPDATE bisonte_orders SET pago_estado = 'capturado', estado = 'confirmado',
                confirmed_at = NOW() WHERE sale_id = ?`, [saleId]);
    const [r] = await sql(
        `SELECT pago_estado, estado FROM bisonte_orders WHERE sale_id = ?`, [saleId]);
    assertEqual(r[0].pago_estado, 'capturado');
    assertEqual(r[0].estado, 'confirmado');
});

test(15, 'el estado del pedido web no vive en sales', async () => {
    const [cols] = await sql(`SHOW COLUMNS FROM sales`);
    const names = cols.map(c => c.Field);
    assert(!names.includes('web_status'), 'sales no debe tener estado de pedido web');
    assert(!names.includes('estado'), 'sales no debe tener estado de pedido web');
});

test(15, 'el pedido cancelado conserva por que se cancelo', async () => {
    const f = await seed();
    const saleId = await webOrder(f, 'pi_cancel');
    await sql(
        `UPDATE bisonte_orders SET estado = 'cancelado', pago_estado = 'cancelado',
                process_type = 'auto', cancelled_at = NOW() WHERE sale_id = ?`, [saleId]);
    const [r] = await sql(
        `SELECT estado, pago_estado, process_type, cancelled_at FROM bisonte_orders WHERE sale_id = ?`,
        [saleId]);
    assertEqual(r[0].estado, 'cancelado');
    assertEqual(r[0].pago_estado, 'cancelado');
    assertEqual(r[0].process_type, 'auto');
    assert(r[0].cancelled_at !== null, 'debe quedar registrado cuando se cancelo');
});

test(15, 'la cola FIFO del POS sale de un indice', async () => {
    const [plan] = await sql(
        `EXPLAIN FORMAT=JSON SELECT id FROM bisonte_orders WHERE estado = 'pendiente' ORDER BY id`);
    const json = JSON.stringify(plan[0].EXPLAIN ?? plan[0]);
    assert(json.includes('idx_cola') || json.includes('idx_estado'), 'la cola debe usar indice');
});

test(15, 'stock_deducted evita el doble descuento', async () => {
    const f = await seed();
    const saleId = await webOrder(f, 'pi_stock');
    const marcar = `UPDATE bisonte_orders SET stock_deducted = 1
                    WHERE sale_id = ? AND stock_deducted = 0`;
    const [a] = await sql(marcar, [saleId]);
    const [b] = await sql(marcar, [saleId]);
    assertEqual(a.affectedRows, 1, 'el primer descuento debe aplicar');
    assertEqual(b.affectedRows, 0, 'el segundo no debe volver a aplicar');
});

// ── FIX 16 ─ bandeja de salida en vez de catch vacio ────────────────────────
test(16, 'la intencion de cancelar queda registrada', async () => {
    const f = await seed();
    const saleId = await webOrder(f, 'pi_outbox');
    await sql(`INSERT INTO integration_outbox (tipo, sale_id, payload) VALUES ('cancel', ?, ?)`,
        [saleId, JSON.stringify({ motivo: 'sin stock' })]);
    const [r] = await sql(
        `SELECT tipo, estado, intentos FROM integration_outbox WHERE sale_id = ?`, [saleId]);
    assertEqual(r[0].tipo, 'cancel');
    assertEqual(r[0].estado, 'pendiente');
    assertEqual(r[0].intentos, 0);
});

test(16, 'reencolar la misma intencion no la duplica', async () => {
    const f = await seed();
    const saleId = await webOrder(f, 'pi_dupintent');
    await sql(`INSERT INTO integration_outbox (tipo, sale_id) VALUES ('capture', ?)`, [saleId]);
    await expectError(
        () => sql(`INSERT INTO integration_outbox (tipo, sale_id) VALUES ('capture', ?)`, [saleId]),
        'ER_DUP_ENTRY');
});

test(16, 'capturar y reembolsar la misma venta son intenciones distintas', async () => {
    const f = await seed();
    const saleId = await webOrder(f, 'pi_dostipos');
    await sql(`INSERT INTO integration_outbox (tipo, sale_id) VALUES ('capture', ?)`, [saleId]);
    await sql(`INSERT INTO integration_outbox (tipo, sale_id) VALUES ('refund', ?)`, [saleId]);
    const [r] = await sql(`SELECT COUNT(*) n FROM integration_outbox WHERE sale_id = ?`, [saleId]);
    assertEqual(r[0].n, 2);
});

test(16, 'un fallo queda visible, no se pierde en silencio', async () => {
    const f = await seed();
    const saleId = await webOrder(f, 'pi_fallo');
    await sql(`INSERT INTO integration_outbox (tipo, sale_id) VALUES ('cancel', ?)`, [saleId]);
    await sql(
        `UPDATE integration_outbox SET intentos = intentos + 1, ultimo_error = ?
          WHERE sale_id = ? AND tipo = 'cancel'`,
        ['ECONNREFUSED tienda no responde', saleId]);
    const [r] = await sql(
        `SELECT estado, intentos, ultimo_error FROM integration_outbox WHERE sale_id = ?`, [saleId]);
    assertEqual(r[0].estado, 'pendiente', 'sigue pendiente hasta confirmarse');
    assertEqual(r[0].intentos, 1);
    assert(r[0].ultimo_error.includes('ECONNREFUSED'), 'el error debe quedar guardado');
});

test(16, 'el worker toma las pendientes mas viejas primero', async () => {
    const f1 = await seed(); const s1 = await webOrder(f1, 'pi_w1');
    const f2 = await seed(); const s2 = await webOrder(f2, 'pi_w2');
    await sql(`INSERT INTO integration_outbox (tipo, sale_id) VALUES ('capture', ?)`, [s1]);
    await sql(`INSERT INTO integration_outbox (tipo, sale_id) VALUES ('capture', ?)`, [s2]);
    await sql(`UPDATE integration_outbox SET estado = 'ok', processed_at = NOW() WHERE sale_id = ?`, [s1]);
    const [r] = await sql(
        `SELECT sale_id FROM integration_outbox
          WHERE estado = 'pendiente' AND sale_id IN (?, ?)
          ORDER BY created_at, id LIMIT 1`, [s1, s2]);
    assertEqual(r[0].sale_id, s2, 'la ya procesada no debe volver a salir');
});
