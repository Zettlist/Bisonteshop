import { test, sql, expectError, assert, assertEqual, seed } from './harness.mjs';

// ── FIX 17 ─ unicidad del codigo de barras impuesta por la base ─────────────
test(17, 'dos productos no pueden compartir codigo de barras', async () => {
    const f = await seed();
    await sql(`UPDATE products SET barcode = '2001000000015' WHERE id = ?`, [f.productId]);
    await expectError(
        () => sql(`INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, barcode)
                   VALUES (?,?,?,?,?,?)`,
            [f.empresaId, 'Otro tomo', 90, 150, 5, '2001000000015']),
        'ER_DUP_ENTRY');
});

test(17, 'empresas distintas si pueden repetir el mismo codigo', async () => {
    const f1 = await seed();
    const f2 = await seed();
    await sql(`UPDATE products SET barcode = '2001000000022' WHERE id = ?`, [f1.productId]);
    const [r] = await sql(
        `INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, barcode)
         VALUES (?,?,?,?,?,?)`,
        [f2.empresaId, 'Mismo codigo, otra empresa', 90, 150, 5, '2001000000022']);
    assert(r.insertId > 0, 'la unicidad debe ser por empresa, no global');
});

test(17, 'varios productos sin codigo conviven (NULL no colisiona)', async () => {
    const f = await seed();   // el producto de la semilla ya nace sin codigo
    const [{ 0: base }] = await sql(
        `SELECT COUNT(*) n FROM products WHERE empresa_id = ? AND barcode IS NULL`, [f.empresaId]);
    for (const n of ['Sin codigo A', 'Sin codigo B', 'Sin codigo C']) {
        await sql(`INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, barcode)
                   VALUES (?,?,?,?,?,NULL)`, [f.empresaId, n, 10, 20, 1]);
    }
    const [r] = await sql(
        `SELECT COUNT(*) n FROM products WHERE empresa_id = ? AND barcode IS NULL`, [f.empresaId]);
    assertEqual(r[0].n, Number(base.n) + 3, 'NULL no cuenta para el UNIQUE');
});

test(17, 'el codigo SBIN tambien es unico por empresa', async () => {
    const f = await seed();
    await sql(`UPDATE products SET sbin_code = 'SB-001' WHERE id = ?`, [f.productId]);
    await expectError(
        () => sql(`INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, sbin_code)
                   VALUES (?,?,?,?,?,?)`, [f.empresaId, 'Duplicado SBIN', 90, 150, 5, 'SB-001']),
        'ER_DUP_ENTRY');
});

test(17, 'el indice unico cubre (empresa_id, barcode) en ese orden', async () => {
    // El escaner busca siempre acotando por empresa, asi que la columna guia
    // debe ser empresa_id. Se comprueba la estructura y no el plan: con un
    // UNIQUE completo MySQL resuelve por tabla constante y ni siquiera nombra
    // el indice en el EXPLAIN -- que es el mejor caso posible, no un fallo.
    const [k] = await sql(`SHOW KEYS FROM products WHERE Key_name = 'uniq_empresa_barcode'`);
    assertEqual(k.length, 2, 'debe ser un indice de dos columnas');
    assertEqual(k.find(r => r.Seq_in_index === 1).Column_name, 'empresa_id');
    assertEqual(k.find(r => r.Seq_in_index === 2).Column_name, 'barcode');
    assertEqual(k[0].Non_unique, 0, 'debe ser UNIQUE');
});

// ── FIX 18 ─ contador atomico en vez de COUNT(*) ────────────────────────────
// Mismo SQL que utils/barcodeGenerator.js. Las dos ramas fijan LAST_INSERT_ID:
// si la de INSERT no lo hiciera, devolveria el id de la sentencia anterior de
// la conexion en vez de 1.
const reservar = async (empresaId) => {
    await sql(`INSERT INTO barcode_sequences (empresa_id, next_seq) VALUES (?, LAST_INSERT_ID(1))
               ON DUPLICATE KEY UPDATE next_seq = LAST_INSERT_ID(next_seq + 1)`, [empresaId]);
    const [[r]] = await sql('SELECT LAST_INSERT_ID() AS seq');
    return Number(r.seq);
};

test(18, 'la secuencia avanza sin repetir', async () => {
    const f = await seed();
    const vistos = [];
    for (let i = 0; i < 5; i++) vistos.push(await reservar(f.empresaId));
    assertEqual(new Set(vistos).size, 5, 'las 5 reservas deben ser distintas');
    assertEqual(vistos[0], 1, 'la primera reserva es 1');
    assertEqual(vistos[4], 5);
});

test(18, 'borrar productos NO reutiliza numeros ya entregados', async () => {
    const f = await seed();
    for (let i = 0; i < 3; i++) await reservar(f.empresaId);
    // Se borra todo el catalogo de la empresa.
    await sql(`DELETE FROM products WHERE empresa_id = ?`, [f.empresaId]);
    const siguiente = await reservar(f.empresaId);
    // Con COUNT(*)+1 esto habria devuelto 1 y chocado con una etiqueta impresa.
    assertEqual(siguiente, 4, 'el contador no retrocede al borrar productos');
});

test(18, 'cada empresa lleva su propio contador', async () => {
    const f1 = await seed();
    const f2 = await seed();
    await reservar(f1.empresaId);
    await reservar(f1.empresaId);
    const primeraDeF2 = await reservar(f2.empresaId);
    assertEqual(primeraDeF2, 1, 'la empresa nueva arranca en 1');
});

test(18, 'el contador nace solo en la primera alta', async () => {
    const f = await seed();
    const [antes] = await sql(
        `SELECT COUNT(*) n FROM barcode_sequences WHERE empresa_id = ?`, [f.empresaId]);
    assertEqual(antes[0].n, 0, 'no existe fila hasta la primera reserva');
    await reservar(f.empresaId);
    const [despues] = await sql(
        `SELECT next_seq FROM barcode_sequences WHERE empresa_id = ?`, [f.empresaId]);
    assertEqual(despues[0].next_seq, 1);
});

test(18, 'borrar la empresa se lleva su contador', async () => {
    const f = await seed();
    await reservar(f.empresaId);
    await sql(`DELETE FROM empresas WHERE id = ?`, [f.empresaId]);
    const [r] = await sql(
        `SELECT COUNT(*) n FROM barcode_sequences WHERE empresa_id = ?`, [f.empresaId]);
    assertEqual(r[0].n, 0);
});
