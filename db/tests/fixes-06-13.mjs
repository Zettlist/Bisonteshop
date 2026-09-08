import { test, sql, expectError, assert, assertEqual, assertUsesIndex, seed, makeSale } from './harness.mjs';

// ── FIX 6 ─ una sola fuente de verdad de precio ─────────────────────────────
test(6, 'products ya no tiene la columna ambigua price', async () => {
    const [cols] = await sql(`SHOW COLUMNS FROM products`);
    assert(!cols.map(c => c.Field).includes('price'), 'price sigue conviviendo con sale_price');
});

test(6, 'cost_price y sale_price siguen existiendo', async () => {
    const [cols] = await sql(`SHOW COLUMNS FROM products`);
    const names = cols.map(c => c.Field);
    assert(names.includes('cost_price'), 'falta cost_price');
    assert(names.includes('sale_price'), 'falta sale_price');
});

test(6, 'el margen se calcula sin ambiguedad', async () => {
    const f = await seed();
    const [r] = await sql(`SELECT sale_price - cost_price AS margen FROM products WHERE id = ?`, [f.productId]);
    assertEqual(r[0].margen, '89.00');
});

test(6, 'escribir en price falla en vez de pasar desapercibido', async () => {
    const f = await seed();
    await expectError(
        () => sql(`UPDATE products SET price = 1 WHERE id = ?`, [f.productId]),
        'ER_BAD_FIELD_ERROR');
});

test(6, 'stock negativo es rechazado', async () => {
    const f = await seed();
    await expectError(
        () => sql(`UPDATE products SET stock = -1 WHERE id = ?`, [f.productId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

// ── FIX 7 ─ proveedores como filas, no como columnas ────────────────────────
test(7, 'products ya no tiene columnas con nombre de persona', async () => {
    const [cols] = await sql(`SHOW COLUMNS FROM products`);
    const names = cols.map(c => c.Field);
    assert(!names.includes('damian'), 'sigue existiendo products.damian');
    assert(!names.includes('bernat'), 'sigue existiendo products.bernat');
});

test(7, 'un proveedor nuevo no requiere ALTER TABLE', async () => {
    const f = await seed();
    const [s] = await sql(`INSERT INTO suppliers (empresa_id, name) VALUES (?,?)`, [f.empresaId, 'Panini']);
    await sql(`UPDATE products SET supplier_id = ?, supplier_price = ? WHERE id = ?`,
        [s.insertId, 120.00, f.productId]);
    const [r] = await sql(
        `SELECT sp.name, p.supplier_price
           FROM products p JOIN suppliers sp ON sp.id = p.supplier_id
          WHERE p.id = ?`, [f.productId]);
    assertEqual(r[0].name, 'Panini');
    assertEqual(r[0].supplier_price, '120.00');
});

test(7, 'la deuda con el proveedor sale del precio historico, no del actual', async () => {
    const f = await seed();
    const [s] = await sql(`INSERT INTO suppliers (empresa_id, name) VALUES (?,?)`, [f.empresaId, 'Kamite']);
    await sql(`UPDATE products SET supplier_id = ?, supplier_price = 100 WHERE id = ?`,
        [s.insertId, f.productId]);
    const saleId = await makeSale(f, 'pos');
    await sql(`UPDATE sale_items SET quantity = 3, supplier_price_at_sale = 100 WHERE sale_id = ?`, [saleId]);
    // El proveedor sube su precio despues de la venta.
    await sql(`UPDATE products SET supplier_price = 140 WHERE id = ?`, [f.productId]);
    const [r] = await sql(
        `SELECT SUM(si.quantity * si.supplier_price_at_sale) deuda
           FROM sale_items si WHERE si.sale_id = ?`, [saleId]);
    assertEqual(r[0].deuda, '300.00', 'la deuda debe quedar fijada al precio de la venta');
});

test(7, 'borrar el proveedor no borra sus productos', async () => {
    const f = await seed();
    const [s] = await sql(`INSERT INTO suppliers (empresa_id, name) VALUES (?,?)`, [f.empresaId, 'Ivrea']);
    await sql(`UPDATE products SET supplier_id = ? WHERE id = ?`, [s.insertId, f.productId]);
    await sql(`DELETE FROM suppliers WHERE id = ?`, [s.insertId]);
    const [r] = await sql(`SELECT id, supplier_id FROM products WHERE id = ?`, [f.productId]);
    assertEqual(r.length, 1, 'el producto debe sobrevivir');
    assert(r[0].supplier_id === null, 'supplier_id debio quedar NULL');
});

test(7, 'un proveedor inexistente es rechazado', async () => {
    const f = await seed();
    await expectError(
        () => sql(`UPDATE products SET supplier_id = 999999 WHERE id = ?`, [f.productId]),
        'ER_NO_REFERENCED_ROW_2');
});

test(7, 'categoria y editorial estan normalizadas', async () => {
    const f = await seed();
    const [c] = await sql(`INSERT INTO categories (name) VALUES ('Shonen')`);
    const [p] = await sql(`INSERT INTO publishers (name) VALUES ('Panini Manga')`);
    await sql(`UPDATE products SET category_id = ?, publisher_id = ? WHERE id = ?`,
        [c.insertId, p.insertId, f.productId]);
    const [r] = await sql(`
        SELECT c.name AS categoria, pb.name AS editorial
          FROM products pr
          JOIN categories c  ON c.id  = pr.category_id
          JOIN publishers pb ON pb.id = pr.publisher_id
         WHERE pr.id = ?`, [f.productId]);
    assertEqual(r[0].categoria, 'Shonen');
    assertEqual(r[0].editorial, 'Panini Manga');
});

// ── FIX 8 ─ integridad referencial del carrito ──────────────────────────────
test(8, 'no se puede agregar un producto inexistente al carrito', async () => {
    const f = await seed();
    const [c] = await sql(`INSERT INTO carts (cliente_id) VALUES (?)`, [f.clienteId]);
    await expectError(
        () => sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, 999999, 1)`, [c.insertId]),
        'ER_NO_REFERENCED_ROW_2');
});

test(8, 'no se puede crear un carrito de un cliente inexistente', async () => {
    await expectError(
        () => sql(`INSERT INTO carts (cliente_id) VALUES (999999)`),
        'ER_NO_REFERENCED_ROW_2');
});

test(8, 'borrar el producto limpia los carritos', async () => {
    const f = await seed();
    const [c] = await sql(`INSERT INTO carts (cliente_id) VALUES (?)`, [f.clienteId]);
    await sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,1)`, [c.insertId, f.productId]);
    await sql(`DELETE FROM products WHERE id = ?`, [f.productId]);
    const [r] = await sql(`SELECT COUNT(*) n FROM cart_items WHERE cart_id = ?`, [c.insertId]);
    assertEqual(r[0].n, 0, 'el renglon huerfano debio desaparecer');
});

test(8, 'borrar el carrito arrastra sus renglones', async () => {
    const f = await seed();
    const [c] = await sql(`INSERT INTO carts (cliente_id) VALUES (?)`, [f.clienteId]);
    await sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,1)`, [c.insertId, f.productId]);
    await sql(`DELETE FROM carts WHERE id = ?`, [c.insertId]);
    const [r] = await sql(`SELECT COUNT(*) n FROM cart_items WHERE cart_id = ?`, [c.insertId]);
    assertEqual(r[0].n, 0);
});

test(8, 'borrar el cliente arrastra carrito y renglones', async () => {
    const f = await seed();
    const [c] = await sql(`INSERT INTO carts (cliente_id) VALUES (?)`, [f.clienteId]);
    await sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,1)`, [c.insertId, f.productId]);
    await sql(`DELETE FROM clientes WHERE id = ?`, [f.clienteId]);
    const [r] = await sql(`SELECT COUNT(*) n FROM cart_items WHERE cart_id = ?`, [c.insertId]);
    assertEqual(r[0].n, 0);
});

// ── FIX 9 ─ is_demo en vez del numero magico cliente_id >= 900001 ───────────
test(9, 'event_votes tiene la bandera is_demo', async () => {
    const [cols] = await sql(`SHOW COLUMNS FROM event_votes`);
    assert(cols.map(c => c.Field).includes('is_demo'), 'falta is_demo');
});

test(9, 'los votos reales se cuentan sin depender del rango de id', async () => {
    await sql(`INSERT INTO event_votes (evento, cliente_id, opcion, is_demo) VALUES
        ('mundial2026', 5001, 'mexico', 0),
        ('mundial2026', 5002, 'brasil', 0),
        ('mundial2026', 900001, 'mexico', 1)`);
    const [r] = await sql(
        `SELECT COUNT(*) n FROM event_votes WHERE evento = 'mundial2026' AND is_demo = 0`);
    assertEqual(r[0].n, 2, 'el voto demo no debe contarse');
});

test(9, 'un cliente con id alto puede votar de verdad', async () => {
    await sql(`INSERT INTO event_votes (evento, cliente_id, opcion, is_demo) VALUES ('copa', 900500, 'mexico', 0)`);
    const [r] = await sql(`SELECT COUNT(*) n FROM event_votes WHERE evento = 'copa' AND is_demo = 0`);
    assertEqual(r[0].n, 1, 'el rango de id ya no debe determinar si el voto es real');
});

test(9, 'los votos demo se borran sin tocar los reales', async () => {
    await sql(`INSERT INTO event_votes (evento, cliente_id, opcion, is_demo) VALUES
        ('liga', 1, 'a', 0), ('liga', 2, 'b', 1), ('liga', 3, 'c', 1)`);
    await sql(`DELETE FROM event_votes WHERE evento = 'liga' AND is_demo = 1`);
    const [r] = await sql(`SELECT COUNT(*) n FROM event_votes WHERE evento = 'liga'`);
    assertEqual(r[0].n, 1);
});

test(9, 'un cliente vota una sola vez por evento', async () => {
    await sql(`INSERT INTO event_votes (evento, cliente_id, opcion) VALUES ('final', 77, 'mexico')`);
    await expectError(
        () => sql(`INSERT INTO event_votes (evento, cliente_id, opcion) VALUES ('final', 77, 'brasil')`),
        'ER_DUP_ENTRY');
});

// ── FIX 10 ─ indices en las 4 busquedas reales de clientes ──────────────────
test(10, 'login por email usa indice', async () => {
    await assertUsesIndex(`SELECT id FROM clientes WHERE email = ?`, ['ana1@test.mx'], 'uniq_email');
});

test(10, 'busqueda por client_code usa indice', async () => {
    await assertUsesIndex(`SELECT id FROM clientes WHERE client_code = ?`, ['BM0001'], 'uniq_client_code');
});

test(10, 'verificacion de correo por token usa indice', async () => {
    await assertUsesIndex(
        `SELECT id FROM clientes WHERE verification_token = ?`, ['tok123'], 'idx_verification_token');
});

test(10, 'busqueda por stripe_customer_id usa indice', async () => {
    await assertUsesIndex(
        `SELECT id FROM clientes WHERE stripe_customer_id = ?`, ['cus_123'], 'idx_stripe_customer');
});

test(10, 'no puede haber dos cuentas con el mismo correo', async () => {
    const f = await seed();
    const [r] = await sql(`SELECT email FROM clientes WHERE id = ?`, [f.clienteId]);
    await expectError(
        () => sql(`INSERT INTO clientes (empresa_id, nombre, apellido, fecha_nac, email, password, client_code)
                   VALUES (?,?,?,?,?,?,?)`,
            [f.empresaId, 'Otro', 'User', '1991-01-01', r[0].email, 'h', 'BMZZZZ']),
        'ER_DUP_ENTRY');
});

// ── FIX 11 ─ indices compuestos para los listados paginados ─────────────────
test(11, 'el historial de saldo evita filesort', async () => {
    await assertUsesIndex(
        `SELECT id, amount FROM credit_history WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 50`,
        [1], 'idx_cliente_created');
});

test(11, 'las notificaciones evitan filesort', async () => {
    await assertUsesIndex(
        `SELECT id, title FROM user_notifications WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 50`,
        [1], 'idx_cliente_created');
});

test(11, 'las notificaciones sin leer usan su indice', async () => {
    await assertUsesIndex(
        `SELECT id FROM user_notifications WHERE cliente_id = ? AND read_at IS NULL`, [1], 'idx_cliente');
});

test(11, 'el saldo a favor nunca queda negativo', async () => {
    const f = await seed();
    await sql(`UPDATE clientes SET store_credit = 50.00 WHERE id = ?`, [f.clienteId]);
    await sql(`UPDATE clientes SET store_credit = GREATEST(0, store_credit - 80.00) WHERE id = ?`, [f.clienteId]);
    const [r] = await sql(`SELECT store_credit FROM clientes WHERE id = ?`, [f.clienteId]);
    assertEqual(r[0].store_credit, '0.00');
});

test(11, 'la misma notificacion no se duplica por reintento', async () => {
    const f = await seed();
    const q = `INSERT IGNORE INTO user_notifications (cliente_id, type, title, ref_id) VALUES (?,?,?,?)`;
    await sql(q, [f.clienteId, 'order_pendiente', 'Pedido recibido #1', 'order-1']);
    const [r] = await sql(q, [f.clienteId, 'order_pendiente', 'Pedido recibido #1', 'order-1']);
    assertEqual(r.affectedRows, 0, 'el reintento no debe crear una segunda notificacion');
});

// ── FIX 12 ─ event_results con llave que valida el upsert ───────────────────
test(12, 'evento es la llave primaria', async () => {
    const [cols] = await sql(`SHOW KEYS FROM event_results WHERE Key_name = 'PRIMARY'`);
    assertEqual(cols[0].Column_name, 'evento');
});

test(12, 'publicar el resultado dos veces actualiza en vez de duplicar', async () => {
    const q = `INSERT INTO event_results (evento, ganador, codigo) VALUES (?,?,?)
               ON DUPLICATE KEY UPDATE ganador = VALUES(ganador), codigo = VALUES(codigo)`;
    await sql(q, ['mundial2026', 'mexico', 'CAMPEON10']);
    await sql(q, ['mundial2026', 'brasil', 'CAMPEON20']);
    const [r] = await sql(`SELECT ganador, codigo FROM event_results WHERE evento = 'mundial2026'`);
    assertEqual(r.length, 1, 'no debe haber dos resultados del mismo evento');
    assertEqual(r[0].ganador, 'brasil');
    assertEqual(r[0].codigo, 'CAMPEON20');
});

test(12, 'eventos distintos coexisten', async () => {
    await sql(`INSERT INTO event_results (evento, ganador) VALUES ('copa2027', 'argentina')`);
    const [r] = await sql(`SELECT COUNT(*) n FROM event_results`);
    assert(Number(r[0].n) >= 2, 'debe haber al menos dos eventos');
});

test(12, 'el upsert refresca updated_at', async () => {
    await sql(`INSERT INTO event_results (evento, ganador) VALUES ('liga2026', 'tigres')`);
    const [a] = await sql(`SELECT updated_at FROM event_results WHERE evento = 'liga2026'`);
    await sql(`UPDATE event_results SET ganador = 'rayados' WHERE evento = 'liga2026'`);
    const [b] = await sql(`SELECT ganador, updated_at FROM event_results WHERE evento = 'liga2026'`);
    assertEqual(b[0].ganador, 'rayados');
    assert(b[0].updated_at >= a[0].updated_at, 'updated_at debio avanzar');
});

test(12, 'el ganador es obligatorio', async () => {
    await expectError(
        () => sql(`INSERT INTO event_results (evento, ganador) VALUES ('vacio', NULL)`),
        'ER_BAD_NULL_ERROR');
});

// ── FIX 13 ─ el esquema completo vive en schema.sql, no en las rutas ────────
const ESPERADAS = [
    'empresas', 'users', 'features', 'user_features', 'suppliers', 'categories', 'publishers',
    'product_formats', 'products',
    'cash_sessions', 'sales', 'sale_items', 'sales_goals', 'business_settings', 'global_changes_log',
    'anticipos', 'anticipo_items', 'clientes', 'user_addresses', 'carts', 'cart_items',
    'bisonte_orders', 'integration_outbox', 'coupons', 'coupon_redemptions', 'credit_history',
    'user_notifications', 'tags', 'product_tags', 'event_votes', 'event_results',
    'pre_orders', 'pre_order_batches', 'pre_order_payments',
    'store_credits', 'store_credit_uses', 'barcode_sequences',
    'product_reviews', 'erp_pedidos',
    'apartado_sequences', 'anticipo_payments',
    // Cotizaciones. Las creaba a mano migrate_cotizaciones.js, un script que ya
    // iba por la version 10 a base de ALTER, mientras este archivo se llamaba a
    // si mismo la unica fuente de verdad y no las nombraba.
    'cotizaciones', 'cotizacion_items', 'cotizacion_proveedores',
    'cotizacion_proveedor_conceptos', 'cotizacion_folios',
    // El pedido que nace de aceptarle la propuesta a un proveedor: es lo que
    // convierte una lista de precios en productos en preventa.
    'cotizacion_pedidos', 'cotizacion_pedido_items',
];

test(13, 'schema.sql crea todas las tablas de una sola pasada', async () => {
    const [rows] = await sql(`SHOW TABLES`);
    const found = rows.map(r => Object.values(r)[0]);
    for (const t of ESPERADAS) assert(found.includes(t), `falta la tabla ${t}`);
    assertEqual(found.length, ESPERADAS.length, 'la cuenta de tablas no coincide');
});

test(13, 'ninguna tabla que la app creaba en runtime queda pendiente', async () => {
    const [rows] = await sql(`SHOW TABLES`);
    const found = rows.map(r => Object.values(r)[0]);
    for (const t of ['user_notifications', 'user_addresses', 'credit_history',
        'event_votes', 'event_results', 'coupon_redemptions', 'clientes']) {
        assert(found.includes(t), `${t} deberia existir sin que la ruta la cree`);
    }
});

test(13, 'todas las tablas son InnoDB con utf8mb4', async () => {
    const [rows] = await sql(
        `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE()`);
    for (const r of rows) {
        assertEqual(r.ENGINE, 'InnoDB', `${r.TABLE_NAME} no es InnoDB`);
        assert(String(r.TABLE_COLLATION).startsWith('utf8mb4'), `${r.TABLE_NAME} no es utf8mb4`);
    }
});

test(13, 'el esquema es idempotente: cargarlo dos veces no falla', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    await sql(readFileSync(join(here, '..', 'schema.sql'), 'utf8'));
    const [rows] = await sql(`SHOW TABLES`);
    assertEqual(rows.length, ESPERADAS.length, 'la segunda carga altero el numero de tablas');
});

test(13, 'las tablas del POS y de la tienda estan enlazadas por empresa_id', async () => {
    const [rows] = await sql(
        `SELECT TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'empresas'`);
    const conFk = rows.map(r => r.TABLE_NAME);
    for (const t of ['products', 'sales', 'clientes', 'suppliers']) {
        assert(conFk.includes(t), `${t} deberia referenciar empresas`);
    }
});
