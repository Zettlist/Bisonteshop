import { test, sql, expectError, assert, assertEqual, assertUsesIndex, seed } from './harness.mjs';

const G = 'PREVENTAS';

let folio = 0;

/** Un turno de caja abierto, que es lo que ahora exige el POS para cobrar. */
async function turno(f) {
    const [c] = await sql(
        `INSERT INTO cash_sessions (empresa_id, user_id, opening_amount) VALUES (?,?,?)`,
        [f.empresaId, f.userId, 500.00]);
    return c.insertId;
}

/** Una preventa recien registrada: pedida, pagada a medias y todavia en camino. */
async function preventa(f, { total = 1500, pagado = 750 } = {}) {
    const [p] = await sql(
        `INSERT INTO pre_orders (empresa_id, order_number, client_number, client_name,
                                 title, total_price, deposit, total_paid, balance)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [f.empresaId, `PV-${String(++folio).padStart(4, '0')}`, 'BM0001', 'Ana Lopez',
            'Figura Guts 1/6', total, pagado, pagado, total - pagado]);
    return p.insertId;
}

// ── El reloj no arranca hasta que la mercancia llega ────────────────────────
test(G, 'una preventa nace sin fecha limite', async () => {
    // Es la diferencia con el apartado. Alli la mercancia esta en la tienda
    // desde el primer dia y el plazo arranca con el anticipo; aqui el pedido
    // viene en camino, y no se le puede pedir a nadie que recoja lo que el
    // proveedor todavia no ha mandado.
    const f = await seed();
    const id = await preventa(f);
    const [r] = await sql(`SELECT arrived_at, expires_at FROM pre_orders WHERE id = ?`, [id]);
    assertEqual(r[0].arrived_at, null);
    assertEqual(r[0].expires_at, null);
});

test(G, 'no se puede poner fecha limite sin marcar la llegada', async () => {
    // Un vencimiento sin llegada seria un reloj que arranco solo, y vencerle el
    // pedido a quien todavia espera es justo lo que no puede pasar.
    const f = await seed();
    const id = await preventa(f);
    await expectError(
        () => sql(`UPDATE pre_orders SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?`, [id]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'marcar la llegada es lo que pone el vencimiento', async () => {
    const f = await seed();
    const id = await preventa(f);
    await sql(`UPDATE pre_orders
                  SET arrived_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY)
                WHERE id = ?`, [id]);
    const [r] = await sql(`SELECT arrived_at, expires_at, dias_plazo FROM pre_orders WHERE id = ?`, [id]);
    assert(r[0].arrived_at !== null, 'la llegada tenia que quedar marcada');
    assert(r[0].expires_at !== null, 'el vencimiento tenia que calcularse');
    assertEqual(r[0].dias_plazo, 30);
});

test(G, 'el plazo por defecto de una preventa es de 30 dias', async () => {
    // Treinta y no quince: el apartado cuenta desde el anticipo y este desde la
    // llegada, que son dos momentos distintos del mismo trato.
    const f = await seed();
    const id = await preventa(f);
    const [r] = await sql(`SELECT dias_plazo FROM pre_orders WHERE id = ?`, [id]);
    assertEqual(r[0].dias_plazo, 30);
});

test(G, 'un plazo de cero dias no tiene sentido y la base lo rechaza', async () => {
    const f = await seed();
    const id = await preventa(f);
    await expectError(
        () => sql(`UPDATE pre_orders SET dias_plazo = 0 WHERE id = ?`, [id]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'vencer no es lo mismo que cancelar', async () => {
    // 'cancelled' es una decision de la tienda; 'expired' es que se acabo el
    // plazo. Mezclarlos borraria la diferencia entre dos conversaciones
    // distintas con el cliente.
    const f = await seed();
    const id = await preventa(f);
    await sql(`UPDATE pre_orders
                  SET arrived_at = NOW(), expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY),
                      status = 'expired', expired_at = NOW()
                WHERE id = ?`, [id]);
    const [r] = await sql(`SELECT status FROM pre_orders WHERE id = ?`, [id]);
    assertEqual(r[0].status, 'expired');
});

test(G, 'la consulta del job nocturno usa el indice de vencimiento', async () => {
    const f = await seed();
    await preventa(f);
    await assertUsesIndex(
        `SELECT id FROM pre_orders WHERE empresa_id = ? AND status = 'pending' AND expires_at < NOW()`,
        [f.empresaId], 'idx_vencimiento');
});

test(G, 'una preventa no reserva stock fisico', async () => {
    // Es lo que la separa del apartado. Alli la mercancia esta en la tienda y
    // se separa con `stock_reservado`; aqui no hay ni una pieza que separar, y
    // el CHECK (stock_reservado <= stock) rechazaria -- con razon -- reservar
    // sobre un stock de cero. Lo que compromete una preventa es
    // `preventa_reservada`, que cuenta piezas que todavia vienen en camino.
    const f = await seed();
    await sql(`UPDATE products SET stock = 0, estado = 'preventa', preventa_cantidad = 5
                WHERE id = ?`, [f.productId]);
    await sql(`INSERT INTO pre_orders (empresa_id, order_number, client_name, product_id,
                                       quantity, title, total_price, deposit, total_paid, balance)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [f.empresaId, 'PV-STOCK', 'Ana Lopez', f.productId, 2, 'Berserk Vol.1',
            1000.00, 500.00, 500.00, 500.00]);
    await sql(`UPDATE products SET preventa_reservada = preventa_reservada + 2 WHERE id = ?`,
        [f.productId]);

    const [r] = await sql(`SELECT stock, stock_reservado, preventa_cantidad,
                                  preventa_reservada, preventa_disponible
                             FROM products WHERE id = ?`, [f.productId]);
    assertEqual(r[0].stock, 0);
    assertEqual(r[0].stock_reservado, 0);
    assertEqual(r[0].preventa_reservada, 2);
    assertEqual(r[0].preventa_disponible, 3);
});

// ── El dinero: cada abono sabe en que turno de caja entro ───────────────────
test(G, 'el abono de una preventa guarda turno y cajero', async () => {
    // Sin esto, el dinero del cajon no tiene a quien atribuirse al cerrar.
    const f = await seed();
    const id = await preventa(f);
    const sesion = await turno(f);
    await sql(`INSERT INTO pre_order_payments (pre_order_id, amount, payment_number,
                                               payment_method, cash_session_id, created_by)
               VALUES (?,?,?,?,?,?)`, [id, 750.00, 1, 'cash', sesion, f.userId]);
    const [r] = await sql(`SELECT cash_session_id, created_by, payment_method
                             FROM pre_order_payments WHERE pre_order_id = ?`, [id]);
    assertEqual(r[0].cash_session_id, sesion);
    assertEqual(r[0].created_by, f.userId);
    assertEqual(r[0].payment_method, 'cash');
});

test(G, 'borrar un turno de caja no borra el abono', async () => {
    // El turno se puede depurar; el registro de que alguien pago, no.
    const f = await seed();
    const id = await preventa(f);
    const sesion = await turno(f);
    await sql(`INSERT INTO pre_order_payments (pre_order_id, amount, payment_number, cash_session_id)
               VALUES (?,?,?,?)`, [id, 750.00, 1, sesion]);
    await sql(`DELETE FROM cash_sessions WHERE id = ?`, [sesion]);
    const [r] = await sql(`SELECT cash_session_id FROM pre_order_payments WHERE pre_order_id = ?`, [id]);
    assertEqual(r.length, 1);
    assertEqual(r[0].cash_session_id, null);
});

test(G, 'borrar la preventa se lleva sus abonos', async () => {
    const f = await seed();
    const id = await preventa(f);
    await sql(`INSERT INTO pre_order_payments (pre_order_id, amount, payment_number)
               VALUES (?,?,?)`, [id, 750.00, 1]);
    await sql(`DELETE FROM pre_orders WHERE id = ?`, [id]);
    const [r] = await sql(`SELECT id FROM pre_order_payments WHERE pre_order_id = ?`, [id]);
    assertEqual(r.length, 0);
});

// ── El reporte que cuadra el cajon ──────────────────────────────────────────
test(G, 'el reporte de abonos une apartados y preventas en una consulta', async () => {
    // Es una copia de la consulta de TorlanPOS/backend/utils/abonos.js, que es
    // donde se arma de verdad. Se prueba aqui porque junta dos tablas que nadie
    // mas junta: si una de las dos cambia de columnas, el reporte se rompe en
    // silencio y nadie se entera hasta que alguien va a cerrar la caja.
    const f = await seed();
    const sesion = await turno(f);

    const [a] = await sql(
        `INSERT INTO anticipos (empresa_id, folio, customer_name, total_amount, paid_amount,
                                dias_plazo, expires_at, created_by)
         VALUES (?,?,?,?,?,15,DATE_ADD(NOW(), INTERVAL 15 DAY),?)`,
        [f.empresaId, 'AP-REPORTE', 'Ana Lopez', 189.00, 60.00, f.userId]);
    await sql(`INSERT INTO anticipo_payments (anticipo_id, amount, payment_method, cash_session_id, created_by)
               VALUES (?,?,?,?,?)`, [a.insertId, 60.00, 'cash', sesion, f.userId]);

    const pv = await preventa(f);
    await sql(`INSERT INTO pre_order_payments (pre_order_id, amount, payment_number,
                                               payment_method, cash_session_id, created_by)
               VALUES (?,?,?,?,?,?)`, [pv, 750.00, 1, 'cash', sesion, f.userId]);

    const [filas] = await sql(`
        SELECT * FROM (
            SELECT CONCAT('apartado-', ap.id) AS id, 'apartado' AS origen, ap.amount AS monto,
                   ap.payment_method AS metodo, ap.cash_session_id AS sesion_id,
                   ap.created_at AS fecha, a.folio AS referencia, a.customer_name AS cliente
              FROM anticipo_payments ap
              JOIN anticipos a ON a.id = ap.anticipo_id
              LEFT JOIN cash_sessions cs ON cs.id = ap.cash_session_id
             WHERE a.empresa_id = ? AND cs.id = ?
            UNION ALL
            SELECT CONCAT('preventa-', pp.id), 'preventa', pp.amount,
                   pp.payment_method, pp.cash_session_id,
                   pp.created_at, po.order_number, po.client_name
              FROM pre_order_payments pp
              JOIN pre_orders po ON po.id = pp.pre_order_id
              LEFT JOIN cash_sessions cs ON cs.id = pp.cash_session_id
             WHERE po.empresa_id = ? AND cs.id = ?
        ) abonos
        ORDER BY fecha DESC
    `, [f.empresaId, sesion, f.empresaId, sesion]);

    assertEqual(filas.length, 2);
    assertEqual(filas.map((r) => r.origen).sort().join(','), 'apartado,preventa');
    assertEqual(filas.reduce((t, r) => t + Number(r.monto), 0), 810);
});
