import { test, sql, expectError, assert, assertEqual, seed, makeSale } from './harness.mjs';

// ── FIX 1 ─ las 16 columnas del pedido web salen de sales ───────────────────
const COLS_WEB = ['web_status', 'web_process_type', 'stock_deducted', 'tracking_number',
    'envia_label_data', 'envia_quote_data', 'shipping_method', 'shipping_address_json',
    'shipping_status', 'claim_status', 'claim_notes', 'claim_type',
    'delivered_at', 'shipped_at', 'refund_id', 'cliente_id'];

test(1, 'sales ya no tiene ninguna de las 16 columnas del pedido web', async () => {
    const [cols] = await sql(`SHOW COLUMNS FROM sales`);
    const names = cols.map(c => c.Field);
    for (const c of COLS_WEB) assert(!names.includes(c), `sales todavia carga ${c}`);
});

test(1, 'las 16 viven ahora en bisonte_orders', async () => {
    const [cols] = await sql(`SHOW COLUMNS FROM bisonte_orders`);
    const names = cols.map(c => c.Field);
    // web_status y cliente_id se renombraron a estado y cliente_id; el resto igual.
    for (const c of COLS_WEB.filter(x => x !== 'web_status' && x !== 'web_process_type')) {
        assert(names.includes(c), `bisonte_orders deberia tener ${c}`);
    }
    assert(names.includes('estado'), 'falta estado (antes web_status)');
    assert(names.includes('process_type'), 'falta process_type (antes web_process_type)');
});

test(1, 'venta de mostrador no genera pedido web', async () => {
    const f = await seed();
    const saleId = await makeSale(f, 'pos');
    const [r] = await sql(`SELECT COUNT(*) n FROM bisonte_orders WHERE sale_id = ?`, [saleId]);
    assertEqual(r[0].n, 0, 'una venta en efectivo no debe generar pedido web');
});

test(1, 'venta web guarda envio y reclamo en la misma fila', async () => {
    const f = await seed();
    const saleId = await makeSale(f, 'web');
    await sql(
        `INSERT INTO bisonte_orders (sale_id, payment_intent_id, estado, tracking_number, claim_status)
         VALUES (?,?,?,?,?)`,
        [saleId, 'pi_envio', 'envio', 'EN123456MX', 'abierto']);
    const [r] = await sql(
        `SELECT estado, tracking_number, claim_status FROM bisonte_orders WHERE sale_id = ?`, [saleId]);
    assertEqual(r[0].estado, 'envio');
    assertEqual(r[0].tracking_number, 'EN123456MX');
    assertEqual(r[0].claim_status, 'abierto');
});

test(1, 'un pedido web por venta (UNIQUE sale_id)', async () => {
    const f = await seed();
    const saleId = await makeSale(f);
    await sql(`INSERT INTO bisonte_orders (sale_id, payment_intent_id) VALUES (?,?)`, [saleId, 'pi_u1']);
    await expectError(
        () => sql(`INSERT INTO bisonte_orders (sale_id, payment_intent_id) VALUES (?,?)`, [saleId, 'pi_u2']),
        'ER_DUP_ENTRY');
});

// ── FIX 2 ─ foreign keys reales en bisonte_orders ───────────────────────────
test(2, 'pedido con sale_id inexistente es rechazado', async () => {
    await expectError(
        () => sql(`INSERT INTO bisonte_orders (sale_id, payment_intent_id) VALUES (999999, 'pi_x')`),
        'ER_NO_REFERENCED_ROW_2');
});

test(2, 'pedido con cliente_id inexistente es rechazado', async () => {
    const f = await seed();
    const saleId = await makeSale(f);
    await expectError(
        () => sql(`INSERT INTO bisonte_orders (sale_id, cliente_id, payment_intent_id) VALUES (?, 999999, 'pi_y')`,
            [saleId]),
        'ER_NO_REFERENCED_ROW_2');
});

test(2, 'pedido valido se inserta', async () => {
    const f = await seed();
    const saleId = await makeSale(f);
    const [r] = await sql(
        `INSERT INTO bisonte_orders (sale_id, cliente_id, payment_intent_id) VALUES (?,?,?)`,
        [saleId, f.clienteId, 'pi_ok_1']);
    assert(r.insertId > 0, 'el pedido valido debio insertarse');
});

test(2, 'borrar la venta arrastra el pedido (CASCADE)', async () => {
    const f = await seed();
    const saleId = await makeSale(f);
    await sql(`INSERT INTO bisonte_orders (sale_id, payment_intent_id) VALUES (?,?)`, [saleId, 'pi_casc']);
    await sql(`DELETE FROM sales WHERE id = ?`, [saleId]);
    const [r] = await sql(`SELECT COUNT(*) n FROM bisonte_orders WHERE sale_id = ?`, [saleId]);
    assertEqual(r[0].n, 0, 'el pedido debio borrarse con la venta');
});

test(2, 'borrar cliente deja el pedido pero sin dueno (SET NULL)', async () => {
    const f = await seed();
    const saleId = await makeSale(f);
    await sql(`INSERT INTO bisonte_orders (sale_id, cliente_id, payment_intent_id) VALUES (?,?,?)`,
        [saleId, f.clienteId, 'pi_setnull']);
    await sql(`DELETE FROM clientes WHERE id = ?`, [f.clienteId]);
    const [r] = await sql(`SELECT cliente_id FROM bisonte_orders WHERE payment_intent_id = 'pi_setnull'`);
    assertEqual(r.length, 1, 'el pedido debe sobrevivir para conservar el historial contable');
    assert(r[0].cliente_id === null, 'cliente_id debio quedar NULL');
});

// ── FIX 3 ─ payment_intent_id como llave de idempotencia ────────────────────
test(3, 'webhook duplicado de Stripe es rechazado por la base', async () => {
    const f = await seed();
    const s1 = await makeSale(f);
    const s2 = await makeSale(f);
    await sql(`INSERT INTO bisonte_orders (sale_id, payment_intent_id) VALUES (?,?)`, [s1, 'pi_dup']);
    await expectError(
        () => sql(`INSERT INTO bisonte_orders (sale_id, payment_intent_id) VALUES (?,?)`, [s2, 'pi_dup']),
        'ER_DUP_ENTRY');
});

test(3, 'INSERT IGNORE hace el reintento idempotente', async () => {
    const f = await seed();
    const s1 = await makeSale(f);
    await sql(`INSERT INTO bisonte_orders (sale_id, payment_intent_id) VALUES (?,?)`, [s1, 'pi_idem']);
    const [r] = await sql(`INSERT IGNORE INTO bisonte_orders (sale_id, payment_intent_id) VALUES (?,?)`,
        [s1, 'pi_idem']);
    assertEqual(r.affectedRows, 0, 'el reintento no debe crear un segundo pedido');
    const [c] = await sql(`SELECT COUNT(*) n FROM bisonte_orders WHERE payment_intent_id = 'pi_idem'`);
    assertEqual(c[0].n, 1);
});

test(3, 'payment_intent distintos conviven', async () => {
    const f = await seed();
    const s1 = await makeSale(f);
    const s2 = await makeSale(f);
    await sql(`INSERT INTO bisonte_orders (sale_id, payment_intent_id) VALUES (?,?)`, [s1, 'pi_a']);
    await sql(`INSERT INTO bisonte_orders (sale_id, payment_intent_id) VALUES (?,?)`, [s2, 'pi_b']);
    const [c] = await sql(
        `SELECT COUNT(*) n FROM bisonte_orders WHERE payment_intent_id IN ('pi_a','pi_b')`);
    assertEqual(c[0].n, 2, 'dos payment_intent distintos deben convivir');
});

test(3, 'la busqueda por payment_intent_id usa el indice unico', async () => {
    const [plan] = await sql(
        `EXPLAIN FORMAT=JSON SELECT id FROM bisonte_orders WHERE payment_intent_id = 'pi_a'`);
    const json = JSON.stringify(plan[0].EXPLAIN ?? plan[0]);
    assert(json.includes('uniq_payment_intent'), 'debio usar uniq_payment_intent');
});

test(3, 'payment_intent_id es obligatorio', async () => {
    const f = await seed();
    const saleId = await makeSale(f);
    await expectError(
        () => sql(`INSERT INTO bisonte_orders (sale_id, payment_intent_id) VALUES (?, NULL)`, [saleId]),
        'ER_BAD_NULL_ERROR');
});

// ── FIX 4 ─ renglones normalizados en sale_items, sin items_json ────────────
test(4, 'bisonte_orders ya no tiene items_json', async () => {
    const [cols] = await sql(`SHOW COLUMNS FROM bisonte_orders`);
    assert(!cols.map(c => c.Field).includes('items_json'), 'items_json sigue presente');
});

test(4, 'se pueden sumar unidades vendidas por web sin parsear JSON', async () => {
    const f = await seed();
    const saleId = await makeSale(f, 'web');       // 1 unidad
    await sql(`UPDATE sale_items SET quantity = 3 WHERE sale_id = ?`, [saleId]);
    const [r] = await sql(
        `SELECT SUM(si.quantity) total
           FROM sale_items si JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = ? AND s.origen = 'web'`, [f.productId]);
    assertEqual(r[0].total, 3, 'la agregacion debe salir de SQL, no de JSON.parse');
});

test(4, 'origen separa venta de mostrador de venta web', async () => {
    const f = await seed();
    await makeSale(f, 'pos');
    await makeSale(f, 'web');
    await makeSale(f, 'web');
    const [r] = await sql(
        `SELECT origen, COUNT(*) n FROM sales WHERE empresa_id = ? GROUP BY origen ORDER BY origen`,
        [f.empresaId]);
    assertEqual(r[0].origen, 'pos'); assertEqual(r[0].n, 1);
    assertEqual(r[1].origen, 'web'); assertEqual(r[1].n, 2);
});

test(4, 'renglon con producto inexistente es rechazado', async () => {
    const f = await seed();
    const saleId = await makeSale(f);
    await expectError(
        () => sql(`INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, 999999, 1, 10)`,
            [saleId]),
        'ER_NO_REFERENCED_ROW_2');
});

test(4, 'cantidad cero o negativa es rechazada', async () => {
    const f = await seed();
    const saleId = await makeSale(f);
    await expectError(
        () => sql(`INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?,?,0,10)`,
            [saleId, f.productId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

// ── FIX 5 ─ un renglon por producto en el carrito ───────────────────────────
async function makeCart(f) {
    const [c] = await sql(`INSERT INTO carts (cliente_id) VALUES (?)`, [f.clienteId]);
    return c.insertId;
}

test(5, 'el mismo producto no entra dos veces al carrito', async () => {
    const f = await seed();
    const cartId = await makeCart(f);
    await sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,1)`, [cartId, f.productId]);
    await expectError(
        () => sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,1)`, [cartId, f.productId]),
        'ER_DUP_ENTRY');
});

test(5, 'agregar de nuevo suma cantidad en vez de duplicar', async () => {
    const f = await seed();
    const cartId = await makeCart(f);
    const q = `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,?)
               ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`;
    await sql(q, [cartId, f.productId, 2]);
    await sql(q, [cartId, f.productId, 3]);
    const [r] = await sql(`SELECT COUNT(*) n, SUM(quantity) q FROM cart_items WHERE cart_id = ?`, [cartId]);
    assertEqual(r[0].n, 1, 'debe quedar un solo renglon');
    assertEqual(r[0].q, 5, 'las cantidades debieron sumarse');
});

test(5, 'productos distintos si conviven en el carrito', async () => {
    const f = await seed();
    const cartId = await makeCart(f);
    const [p2] = await sql(
        `INSERT INTO products (empresa_id, name, cost_price, sale_price, stock) VALUES (?,?,?,?,?)`,
        [f.empresaId, 'Vagabond Vol.1', 90, 175, 5]);
    await sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,1)`, [cartId, f.productId]);
    await sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,1)`, [cartId, p2.insertId]);
    const [r] = await sql(`SELECT COUNT(*) n FROM cart_items WHERE cart_id = ?`, [cartId]);
    assertEqual(r[0].n, 2);
});

test(5, 'el mismo producto en carritos distintos es valido', async () => {
    const f = await seed();
    const c1 = await makeCart(f);
    const c2 = await makeCart(f);
    await sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,1)`, [c1, f.productId]);
    await sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,1)`, [c2, f.productId]);
    const [r] = await sql(`SELECT COUNT(*) n FROM cart_items WHERE product_id = ?`, [f.productId]);
    assertEqual(r[0].n, 2);
});

test(5, 'cantidad cero en el carrito es rechazada', async () => {
    const f = await seed();
    const cartId = await makeCart(f);
    await expectError(
        () => sql(`INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,0)`, [cartId, f.productId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});
