import { test, sql, expectError, assert, assertEqual, assertUsesIndex, seed } from './harness.mjs';

const G = 'APARTADOS';

/** Crea un apartado vigente con un renglon, y reserva el stock como lo hace el
 *  POS. Devuelve los ids para poder seguir tirando del hilo. */
async function apartado(f, { total = 189, pagado = 60, dias = 15, cantidad = 1 } = {}) {
    const [a] = await sql(
        `INSERT INTO anticipos (empresa_id, folio, cliente_id, customer_name, total_amount,
                                paid_amount, dias_plazo, expires_at, created_by)
         VALUES (?,?,?,?,?,?,?,DATE_ADD(NOW(), INTERVAL ? DAY),?)`,
        [f.empresaId, `AP-${String(++folio).padStart(6, '0')}`, f.clienteId, 'Ana Lopez',
            total, pagado, dias, dias, f.userId]);
    await sql(`INSERT INTO anticipo_items (anticipo_id, product_id, quantity, unit_price, subtotal)
               VALUES (?,?,?,?,?)`, [a.insertId, f.productId, cantidad, total, total * cantidad]);
    await sql(`UPDATE products SET stock_reservado = stock_reservado + ? WHERE id = ?`,
        [cantidad, f.productId]);
    return a.insertId;
}
let folio = 0;

// ── El anticipo es lo que justifica separar la mercancia ────────────────────
test(G, 'un apartado vigente sin anticipo lo rechaza la base', async () => {
    // Es la regla que pidio la tienda: el stock se separa cuando se pago algo.
    // Vivir solo en la ruta la dejaria fuera para cualquier otro que escriba.
    const f = await seed();
    await expectError(
        () => sql(`INSERT INTO anticipos (empresa_id, folio, customer_name, total_amount, paid_amount,
                                          expires_at, created_by)
                   VALUES (?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 15 DAY),?)`,
            [f.empresaId, 'AP-SIN-ANTICIPO', 'Ana Lopez', 189, 0, f.userId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'los apartados heredados si pueden tener anticipo cero', async () => {
    // Los que existian antes de este modulo. Se les deja pasar porque la
    // alternativa era inventarles un pago o cerrarlos sin avisar a nadie.
    const f = await seed();
    const [r] = await sql(
        `INSERT INTO anticipos (empresa_id, folio, customer_name, total_amount, paid_amount,
                                expires_at, revisar_manual, created_by)
         VALUES (?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 15 DAY),1,?)`,
        [f.empresaId, 'AP-HEREDADO', 'Ana Lopez', 189, 0, f.userId]);
    assert(r.insertId > 0, 'deberia aceptarse con revisar_manual = 1');
});

test(G, 'un apartado liquidado o cancelado no necesita anticipo', async () => {
    const f = await seed();
    const [r] = await sql(
        `INSERT INTO anticipos (empresa_id, folio, customer_name, total_amount, paid_amount,
                                expires_at, status, created_by)
         VALUES (?,?,?,?,?,NOW(),'cancelled',?)`,
        [f.empresaId, 'AP-CANCELADO', 'Ana Lopez', 189, 0, f.userId]);
    assert(r.insertId > 0, 'el reloj no corre para un apartado cerrado');
});

test(G, 'no se puede abonar mas que el total', async () => {
    const f = await seed();
    const id = await apartado(f, { total: 189, pagado: 60 });
    await expectError(
        () => sql(`UPDATE anticipos SET paid_amount = 200 WHERE id = ?`, [id]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'un abono no puede ser de cero pesos', async () => {
    const f = await seed();
    const id = await apartado(f);
    await expectError(
        () => sql(`INSERT INTO anticipo_payments (anticipo_id, amount) VALUES (?,0)`, [id]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

// ── Folio ───────────────────────────────────────────────────────────────────
test(G, 'el folio no se repite dentro de una empresa', async () => {
    const f = await seed();
    await sql(`INSERT INTO anticipos (empresa_id, folio, customer_name, total_amount, paid_amount,
                                      expires_at, created_by)
               VALUES (?,?,?,?,?,NOW(),?)`, [f.empresaId, 'AP-000001', 'Ana', 189, 50, f.userId]);
    await expectError(
        () => sql(`INSERT INTO anticipos (empresa_id, folio, customer_name, total_amount, paid_amount,
                                          expires_at, created_by)
                   VALUES (?,?,?,?,?,NOW(),?)`, [f.empresaId, 'AP-000001', 'Beto', 90, 50, f.userId]),
        'ER_DUP_ENTRY');
});

test(G, 'dos tiendas distintas si pueden tener el mismo folio', async () => {
    // Cada empresa lleva su propia numeracion; el folio se le dice al cliente
    // de esa tienda y no tiene por que ser unico en toda la base.
    const a = await seed();
    const b = await seed();
    for (const f of [a, b]) {
        await sql(`INSERT INTO anticipos (empresa_id, folio, customer_name, total_amount, paid_amount,
                                          expires_at, created_by)
                   VALUES (?,?,?,?,?,NOW(),?)`, [f.empresaId, 'AP-000042', 'Ana', 189, 50, f.userId]);
    }
    const [r] = await sql(`SELECT COUNT(*) n FROM anticipos WHERE folio = 'AP-000042'`);
    assertEqual(r[0].n, 2, 'una por tienda');
});

// ── El stock se separa, no desaparece ───────────────────────────────────────
test(G, 'apartar sube lo reservado y deja el stock fisico intacto', async () => {
    // El articulo sigue en la tienda mientras esta apartado. Bajar `stock`
    // haria que el conteo del mostrador nunca cuadrara.
    const f = await seed();                       // stock 10
    await apartado(f, { cantidad: 3 });
    const [r] = await sql(
        `SELECT stock, stock_reservado, stock_disponible FROM products WHERE id = ?`, [f.productId]);
    assertEqual(r[0].stock, 10, 'el stock fisico no se toca');
    assertEqual(r[0].stock_reservado, 3, 'lo comprometido sube');
    assertEqual(r[0].stock_disponible, 7, 'y el disponible baja solo');
});

test(G, 'no se puede apartar mas de lo que hay', async () => {
    // La sobreventa la rechaza la base, no un SELECT antes del UPDATE: entre
    // la consulta y la reserva cabe otra caja.
    const f = await seed();                       // stock 10
    await expectError(
        () => sql(`UPDATE products SET stock_reservado = stock_reservado + 11 WHERE id = ?`,
            [f.productId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'un renglon de apartado no puede ser de cero piezas', async () => {
    const f = await seed();
    const id = await apartado(f);
    await expectError(
        () => sql(`INSERT INTO anticipo_items (anticipo_id, product_id, quantity, unit_price, subtotal)
                   VALUES (?,?,0,189,0)`, [id, f.productId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

// ── Que sobrevive a que ─────────────────────────────────────────────────────
test(G, 'borrar el apartado se lleva sus renglones y sus abonos', async () => {
    const f = await seed();
    const id = await apartado(f);
    await sql(`INSERT INTO anticipo_payments (anticipo_id, amount) VALUES (?,50)`, [id]);
    await sql(`DELETE FROM anticipos WHERE id = ?`, [id]);
    const [items] = await sql(`SELECT COUNT(*) n FROM anticipo_items WHERE anticipo_id = ?`, [id]);
    const [abonos] = await sql(`SELECT COUNT(*) n FROM anticipo_payments WHERE anticipo_id = ?`, [id]);
    assertEqual(items[0].n, 0, 'los renglones caen con el apartado');
    assertEqual(abonos[0].n, 0, 'los abonos tambien');
});

test(G, 'borrar la cuenta del cliente no borra su apartado', async () => {
    // Hay dinero cobrado de por medio: el registro tiene que quedar aunque la
    // persona cierre su cuenta en la tienda web.
    const f = await seed();
    const id = await apartado(f);
    await sql(`DELETE FROM clientes WHERE id = ?`, [f.clienteId]);
    const [r] = await sql(`SELECT cliente_id, customer_name FROM anticipos WHERE id = ?`, [id]);
    assertEqual(r.length, 1, 'el apartado sigue ahi');
    assertEqual(r[0].cliente_id, null, 'sin cuenta, pero con el nombre que se capturo');
    assertEqual(r[0].customer_name, 'Ana Lopez');
});

test(G, 'no se puede apartar un producto que no existe', async () => {
    const f = await seed();
    const id = await apartado(f);
    await expectError(
        () => sql(`INSERT INTO anticipo_items (anticipo_id, product_id, quantity, unit_price, subtotal)
                   VALUES (?,999999,1,189,189)`, [id]),
        'ER_NO_REFERENCED_ROW_2');
});

// ── Las consultas que corren todos los dias ─────────────────────────────────
test(G, 'el panel de vencimientos usa indice, no escaneo', async () => {
    // Es la consulta del listado y la del job de las 3 de la manana, sobre el
    // historico completo de apartados de la tienda.
    const f = await seed();
    await apartado(f);
    await assertUsesIndex(
        `SELECT id FROM anticipos WHERE empresa_id = ? AND status = 'pending' AND expires_at < NOW()`,
        [f.empresaId], 'idx_vencimiento');
});

test(G, '«mis apartados» del cliente usa indice', async () => {
    const f = await seed();
    await apartado(f);
    await assertUsesIndex(
        `SELECT id FROM anticipos WHERE cliente_id = ? ORDER BY created_at DESC`,
        [f.clienteId], 'idx_cliente');
});

// ── El plazo ────────────────────────────────────────────────────────────────
test(G, 'el apartado no distingue tipos: la preventa es otro modulo', async () => {
    // Hubo una columna `tipo` con 'normal' y 'preventa'. Sobraba: un apartado
    // solo puede hacerse sobre mercancia que ya esta en la tienda, y lo que
    // viene en camino vive en pre_orders, con su propio reloj.
    const [cols] = await sql(`SHOW COLUMNS FROM anticipos LIKE 'tipo'`);
    assertEqual(cols.length, 0);
});

test(G, 'el plazo prometido se guarda en la fila', async () => {
    // Si manana la tienda cambia de politica, los apartados vivos conservan el
    // plazo con el que se vendieron.
    const f = await seed();
    const id = await apartado(f, { dias: 20 });
    const [r] = await sql(`SELECT dias_plazo FROM anticipos WHERE id = ?`, [id]);
    assertEqual(r[0].dias_plazo, 20);
});

test(G, 'un plazo de cero dias no tiene sentido y la base lo rechaza', async () => {
    const f = await seed();
    await expectError(
        () => sql(`INSERT INTO anticipos (empresa_id, folio, customer_name, total_amount, paid_amount,
                                          dias_plazo, expires_at, created_by)
                   VALUES (?,?,?,?,?,0,NOW(),?)`,
            [f.empresaId, 'AP-PLAZO-CERO', 'Ana', 189, 50, f.userId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

// ── El turno de caja en el que entro el dinero ──────────────────────────────
test(G, 'el abono de un apartado guarda el turno de caja', async () => {
    // El corte no suma los abonos, asi que este es el unico hilo que ata ese
    // dinero a un turno. Sin el, al cerrar la caja el sobrante no se puede
    // explicar.
    const f = await seed();
    const id = await apartado(f);
    const [c] = await sql(
        `INSERT INTO cash_sessions (empresa_id, user_id, opening_amount) VALUES (?,?,?)`,
        [f.empresaId, f.userId, 500.00]);
    await sql(`INSERT INTO anticipo_payments (anticipo_id, amount, payment_method, cash_session_id, created_by)
               VALUES (?,?,?,?,?)`, [id, 60.00, 'cash', c.insertId, f.userId]);
    const [r] = await sql(`SELECT cash_session_id FROM anticipo_payments WHERE anticipo_id = ?`, [id]);
    assertEqual(r[0].cash_session_id, c.insertId);
});

test(G, 'borrar un turno de caja no borra el abono', async () => {
    const f = await seed();
    const id = await apartado(f);
    const [c] = await sql(
        `INSERT INTO cash_sessions (empresa_id, user_id, opening_amount) VALUES (?,?,?)`,
        [f.empresaId, f.userId, 500.00]);
    await sql(`INSERT INTO anticipo_payments (anticipo_id, amount, cash_session_id)
               VALUES (?,?,?)`, [id, 60.00, c.insertId]);
    await sql(`DELETE FROM cash_sessions WHERE id = ?`, [c.insertId]);
    const [r] = await sql(`SELECT cash_session_id FROM anticipo_payments WHERE anticipo_id = ?`, [id]);
    assertEqual(r.length, 1);
    assertEqual(r[0].cash_session_id, null);
});
