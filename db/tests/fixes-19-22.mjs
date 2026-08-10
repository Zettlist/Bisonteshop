import { test, sql, expectError, assert, assertEqual, assertUsesIndex, seed } from './harness.mjs';

// ── FIX 19 ─ un solo identificador de editor: isbn ──────────────────────────
test(19, 'la columna sbin_code ya no existe', async () => {
    const [cols] = await sql(`SHOW COLUMNS FROM products LIKE 'sbin_code'`);
    assertEqual(cols.length, 0, 'sbin_code debe haber desaparecido, no quedar vacia');
});

test(19, 'isbn acepta codigos internos largos, no solo ISBN-13', async () => {
    // Lo que vivia en sbin_code no siempre era un ISBN: doujinshi y mercancia
    // usaban codigos internos de mas de 20 caracteres, que era el ancho viejo.
    const f = await seed();
    const codigo = 'DJ-COMIKET-C103-KURO-0042';   // 25 caracteres
    await sql(`UPDATE products SET isbn = ? WHERE id = ?`, [codigo, f.productId]);
    const [r] = await sql(`SELECT isbn FROM products WHERE id = ?`, [f.productId]);
    assertEqual(r[0].isbn, codigo, 'no debe truncarse');
});

test(19, 'dos productos de la misma empresa no comparten ISBN', async () => {
    const f = await seed();
    await sql(`UPDATE products SET isbn = '9781506711980' WHERE id = ?`, [f.productId]);
    await expectError(
        () => sql(`INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, isbn)
                   VALUES (?,?,?,?,?,?)`, [f.empresaId, 'Reimpresion', 90, 150, 5, '9781506711980']),
        'ER_DUP_ENTRY');
});

test(19, 'varios productos sin ISBN conviven', async () => {
    // Figuras y mercancia no tienen ISBN. Si NULL colisionara consigo mismo,
    // la segunda figura del catalogo seria imposible de dar de alta.
    const f = await seed();
    for (const n of ['Figura Guts', 'Poster Berserk', 'Llavero Behelit']) {
        await sql(`INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, isbn)
                   VALUES (?,?,?,?,?,NULL)`, [f.empresaId, n, 10, 20, 1]);
    }
    const [r] = await sql(
        `SELECT COUNT(*) n FROM products WHERE empresa_id = ? AND isbn IS NULL`, [f.empresaId]);
    assertEqual(r[0].n, 4, 'el producto de la semilla mas los tres nuevos');
});

test(19, 'la busqueda por ISBN usa indice, no escaneo', async () => {
    // Es la consulta del escaner: se dispara en cada lectura del lector de
    // codigos, y sobre el catalogo completo un escaneo se nota en el mostrador.
    // Hace falta que la fila exista: sin ella MySQL corta con "no matching row
    // in const table" y no llega a nombrar ningun indice.
    const f = await seed();
    await sql(`UPDATE products SET isbn = '9788467952162' WHERE id = ?`, [f.productId]);
    await assertUsesIndex(
        `SELECT id FROM products WHERE empresa_id = ? AND isbn = ?`,
        [f.empresaId, '9788467952162'], 'uniq_empresa_isbn');
});

// ── FIX 20 ─ Regular / Adultos como raiz, impuesto por la base ──────────────
const cat = async (nombre, adulto) => {
    const [r] = await sql(`INSERT INTO categories (name, is_adult) VALUES (?,?)`, [nombre, adulto]);
    return r.insertId;
};
let c = 0;

test(20, 'la categoria "Adultos" ya no se puede dar de alta', async () => {
    // Era un valor de category, o sea el mismo corte codificado dos veces.
    await expectError(() => cat('Adultos', 1), 'ER_CHECK_CONSTRAINT_VIOLATED');
    await expectError(() => cat('ADULTOS', 1), 'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(20, 'un producto no puede estar en una categoria de la otra rama', async () => {
    const f = await seed();
    const shonen = await cat(`Shonen ${++c}`, 0);
    await expectError(
        () => sql(`INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, category_id, is_adult)
                   VALUES (?,?,?,?,?,?,1)`, [f.empresaId, 'Contradiccion', 90, 150, 5, shonen]),
        'ER_NO_REFERENCED_ROW_2');
});

test(20, 'tampoco al reves: categoria adulta con is_adult = 0', async () => {
    const f = await seed();
    const doujinshi = await cat(`Doujinshi ${++c}`, 1);
    await expectError(
        () => sql(`INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, category_id, is_adult)
                   VALUES (?,?,?,?,?,?,0)`, [f.empresaId, 'Fuga', 90, 150, 5, doujinshi]),
        'ER_NO_REFERENCED_ROW_2');
});

test(20, 'un UPDATE tampoco puede romper la coherencia', async () => {
    // La restriccion tiene que valer despues del alta: mover un producto de
    // rama sin mover su categoria es como se ensuciaba el catalogo.
    const f = await seed();
    const seinen = await cat(`Seinen ${++c}`, 0);
    await sql(`UPDATE products SET category_id = ?, is_adult = 0 WHERE id = ?`, [seinen, f.productId]);
    await expectError(
        () => sql(`UPDATE products SET is_adult = 1 WHERE id = ?`, [f.productId]),
        'ER_NO_REFERENCED_ROW_2');
});

test(20, 'un producto sin categoria puede ser de cualquier rama', async () => {
    // InnoDB no comprueba una foranea compuesta si alguna columna es NULL.
    // De eso depende que figuras y mercancia sigan pudiendo darse de alta.
    const f = await seed();
    const [a] = await sql(`INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, category_id, is_adult)
                           VALUES (?,?,?,?,?,NULL,1)`, [f.empresaId, 'Figura sin categoria', 200, 450, 2]);
    const [b] = await sql(`INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, category_id, is_adult)
                           VALUES (?,?,?,?,?,NULL,0)`, [f.empresaId, 'Poster sin categoria', 20, 60, 9]);
    assert(a.insertId > 0 && b.insertId > 0, 'sin categoria no hay rama que contradecir');
});

test(20, 'borrar una categoria con productos se rechaza', async () => {
    // ON DELETE SET NULL no cabe: anularia is_adult, que es NOT NULL. Que la
    // base lo impida obliga a reasignar, en vez de dejar productos sin rama.
    const f = await seed();
    const shojo = await cat(`Shojo ${++c}`, 0);
    await sql(`UPDATE products SET category_id = ?, is_adult = 0 WHERE id = ?`, [shojo, f.productId]);
    await expectError(() => sql(`DELETE FROM categories WHERE id = ?`, [shojo]), 'ER_ROW_IS_REFERENCED_2');
});

// ── FIX 21 ─ formatos de envio ──────────────────────────────────────────────
const formato = async (empresaId, nombre, l, w, h, g) => {
    const [r] = await sql(
        `INSERT INTO product_formats (empresa_id, name, length_cm, width_cm, height_cm, weight_g)
         VALUES (?,?,?,?,?,?)`, [empresaId, nombre, l, w, h, g]);
    return r.insertId;
};

test(21, 'un formato se comparte entre todos los tomos de la edicion', async () => {
    const f = await seed();
    const tanko = await formato(f.empresaId, 'Tankobon Panini', 18.0, 12.8, 1.5, 190);
    await sql(`UPDATE products SET format_id = ? WHERE id = ?`, [tanko, f.productId]);
    await sql(`INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, format_id)
               VALUES (?,?,?,?,?,?)`, [f.empresaId, 'Berserk Vol.2', 100, 189, 8, tanko]);
    const [r] = await sql(
        `SELECT p.name, pf.weight_g FROM products p JOIN product_formats pf ON pf.id = p.format_id
         WHERE p.empresa_id = ?`, [f.empresaId]);
    assertEqual(r.length, 2);
    assert(r.every(x => Number(x.weight_g) === 190), 'ambos tomos pesan lo mismo, medido una vez');
});

test(21, 'una medida en cero se rechaza', async () => {
    // Envia.com rechaza el paquete, pero el cero se guardaba y se propagaba a
    // toda la edicion: la cotizacion fallaba en el checkout, no en el alta.
    const f = await seed();
    await expectError(() => formato(f.empresaId, 'Sin peso', 18, 12.8, 1.5, 0), 'ER_CHECK_CONSTRAINT_VIOLATED');
    await expectError(() => formato(f.empresaId, 'Sin alto', 18, 12.8, 0, 190), 'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(21, 'el nombre del formato es unico dentro de la empresa', async () => {
    const f = await seed();
    await formato(f.empresaId, 'Kanzenban', 21.0, 14.8, 3.2, 480);
    await expectError(() => formato(f.empresaId, 'Kanzenban', 21.0, 14.8, 3.2, 500), 'ER_DUP_ENTRY');
});

test(21, 'dos empresas pueden llamar igual a sus formatos', async () => {
    const f1 = await seed();
    const f2 = await seed();
    await formato(f1.empresaId, 'Tankobon', 18.0, 12.8, 1.5, 190);
    const id = await formato(f2.empresaId, 'Tankobon', 18.2, 12.7, 1.8, 210);
    assert(id > 0, 'la unicidad es por empresa, no global');
});

test(21, 'borrar el formato deja el producto sin medidas, no lo borra', async () => {
    const f = await seed();
    const tanko = await formato(f.empresaId, 'Tankobon Ivrea', 18.2, 12.7, 1.8, 210);
    await sql(`UPDATE products SET format_id = ? WHERE id = ?`, [tanko, f.productId]);
    await sql(`DELETE FROM product_formats WHERE id = ?`, [tanko]);
    const [r] = await sql(`SELECT id, format_id FROM products WHERE id = ?`, [f.productId]);
    assertEqual(r.length, 1, 'el producto sobrevive');
    assertEqual(r[0].format_id, null, 'queda sin formato y se vuelve a elegir');
});

// ── FIX 22 ─ serie y tomo como datos ────────────────────────────────────────
test(22, 'el siguiente tomo sale de una consulta, no de leer el titulo', async () => {
    const f = await seed();
    await sql(`UPDATE products SET series = 'Berserk', volume = 1 WHERE id = ?`, [f.productId]);
    for (const v of [2, 3, 7]) {
        await sql(`INSERT INTO products (empresa_id, name, series, volume, cost_price, sale_price, stock)
                   VALUES (?,?,?,?,?,?,?)`, [f.empresaId, `Berserk, Vol. ${v}`, 'Berserk', v, 100, 189, 5]);
    }
    const [r] = await sql(
        `SELECT MAX(volume) ultimo FROM products WHERE empresa_id = ? AND series = ?`,
        [f.empresaId, 'Berserk']);
    assertEqual(r[0].ultimo, 7, 'el hueco del 4 al 6 no importa: se continua desde el ultimo');
});

test(22, 'la plantilla de la serie hereda editorial, categoria y proveedor', async () => {
    // Es lo que hace «continuar serie»: un solo SELECT del tomo mas reciente.
    const f = await seed();
    const [sup] = await sql(`INSERT INTO suppliers (empresa_id, name) VALUES (?,?)`, [f.empresaId, 'Panini MX']);
    const [pub] = await sql(`INSERT INTO publishers (name) VALUES (?)`, [`Panini ${f.empresaId}`]);
    await sql(
        `UPDATE products SET series='Vagabond', volume=3, publisher_id=?, supplier_id=?,
                             supplier_price=95.00, language='es' WHERE id = ?`,
        [pub.insertId, sup.insertId, f.productId]);
    const [r] = await sql(
        `SELECT publisher_id, supplier_id, supplier_price, language, sale_price, volume
         FROM products WHERE empresa_id = ? AND series = ? ORDER BY volume DESC LIMIT 1`,
        [f.empresaId, 'Vagabond']);
    assertEqual(r[0].supplier_id, sup.insertId);
    assertEqual(r[0].publisher_id, pub.insertId);
    assertEqual(r[0].language, 'es');
    assertEqual(r[0].volume, 3, 'la plantilla es el tomo mas alto, no el primero');
});

test(22, 'dos ediciones distintas pueden repetir serie y tomo', async () => {
    // Berserk Vol.1 de Panini y de Ivrea son productos distintos con el mismo
    // (serie, tomo). Un UNIQUE aqui habria bloqueado dar de alta la segunda.
    const f = await seed();
    await sql(`UPDATE products SET series='Berserk', volume=1 WHERE id = ?`, [f.productId]);
    const [r] = await sql(
        `INSERT INTO products (empresa_id, name, series, volume, cost_price, sale_price, stock)
         VALUES (?,?,?,?,?,?,?)`,
        [f.empresaId, 'Berserk Vol.1 (Ivrea)', 'Berserk', 1, 110, 210, 4]);
    assert(r.insertId > 0, 'la edicion la distingue el producto, no la serie');
});

test(22, 'lo que no es serie deja ambos campos vacios', async () => {
    const f = await seed();
    const [r] = await sql(
        `INSERT INTO products (empresa_id, name, series, volume, cost_price, sale_price, stock)
         VALUES (?,?,NULL,NULL,?,?,?)`, [f.empresaId, 'Figura Guts 1/7', 900, 1800, 1]);
    assert(r.insertId > 0);
    const [q] = await sql(
        `SELECT COUNT(*) n FROM products WHERE empresa_id = ? AND series IS NOT NULL`, [f.empresaId]);
    assertEqual(q[0].n, 0, 'una figura no entra en ninguna serie');
});

test(22, 'buscar los tomos de una serie usa indice', async () => {
    await assertUsesIndex(
        `SELECT id, volume FROM products WHERE empresa_id = ? AND series = ? ORDER BY volume DESC`,
        [1, 'Berserk'], 'idx_empresa_serie');
});
