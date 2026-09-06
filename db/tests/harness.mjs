// Arnes de pruebas del esquema. Arranca un MySQL 8 efimero, carga db/schema.sql
// y corre las aserciones contra una base real: los FK, CHECK y UNIQUE se
// verifican por comportamiento, no leyendo el DDL.
import { createDB } from 'mysql-memory-server';
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(__dirname, '..', 'schema.sql');

let db, conn;
const results = [];

export async function setup() {
    db = await createDB({ version: '8.0.x', dbName: 'torlan_pos' });
    conn = await mysql.createConnection({
        host: '127.0.0.1', port: db.port, user: db.username,
        database: db.dbName, multipleStatements: true,
    });
    await conn.query(readFileSync(SCHEMA, 'utf8'));
    return conn;
}

export async function teardown() {
    if (conn) await conn.end();
    if (db) await db.stop();
}

export const sql = (...args) => conn.query(...args);

/** Espera que la operacion falle con un codigo de error MySQL concreto. */
export async function expectError(fn, code) {
    try {
        await fn();
    } catch (e) {
        if (e.code === code) return;
        throw new Error(`esperaba ${code}, llego ${e.code}: ${e.message}`);
    }
    throw new Error(`esperaba ${code}, pero la operacion tuvo exito`);
}

export function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'asercion fallida');
}

export function assertEqual(actual, expected, msg) {
    if (String(actual) !== String(expected)) {
        throw new Error(`${msg || 'valores distintos'}: esperaba ${expected}, llego ${actual}`);
    }
}

/** Confirma que la consulta usa un indice y no un escaneo completo. */
export async function assertUsesIndex(query, params, indexName) {
    const [plan] = await conn.query(`EXPLAIN FORMAT=JSON ${query}`, params);
    const json = JSON.stringify(plan[0].EXPLAIN ?? plan[0]);
    assert(json.includes(indexName), `esperaba uso del indice ${indexName} en: ${query}`);
    assert(!json.includes('"access_type": "ALL"'), `escaneo completo de tabla en: ${query}`);
}

const tests = [];
export function test(fix, name, fn) { tests.push({ fix, name, fn }); }

export async function runAll() {
    let pass = 0, fail = 0;
    let currentFix = null;
    for (const t of tests) {
        if (t.fix !== currentFix) {
            currentFix = t.fix;
            // Etiqueta del grupo: "FIX 19" para las correcciones numeradas,
            // el nombre tal cual para una suite con etiqueta propia.
            const etiqueta = typeof t.fix === 'number' ? `FIX ${t.fix}` : t.fix;
            console.log(`\n  ${etiqueta}`);
        }
        try {
            await t.fn();
            console.log(`    ok    ${t.name}`);
            pass++;
        } catch (e) {
            console.log(`    FALLA ${t.name}\n            ${e.message}`);
            fail++;
            results.push({ fix: t.fix, name: t.name, error: e.message });
        }
    }
    console.log(`\n  ${pass} pasaron, ${fail} fallaron, ${tests.length} total`);
    return fail;
}

/** Fixtures base: empresa, staff, cliente y producto listos para usar.
 *  Los valores UNIQUE llevan sufijo incremental para que cada prueba sea aislada. */
let n = 0;
export async function seed() {
    const i = ++n;
    const [e] = await sql(`INSERT INTO empresas (nombre_empresa) VALUES (?)`, [`Bisonte Manga ${i}`]);
    const [u] = await sql(
        `INSERT INTO users (username, password_hash, empresa_id, role) VALUES (?,?,?,?)`,
        [`staff${i}`, 'x', e.insertId, 'employee']);
    const [c] = await sql(
        `INSERT INTO clientes (empresa_id, nombre, apellido, fecha_nac, email, password, client_code)
         VALUES (?,?,?,?,?,?,?)`,
        [e.insertId, 'Ana', 'Lopez', '1990-01-01', `ana${i}@test.mx`, 'hash', `BM${String(i).padStart(4, '0')}`]);
    const [p] = await sql(
        `INSERT INTO products (empresa_id, name, cost_price, sale_price, stock) VALUES (?,?,?,?,?)`,
        [e.insertId, 'Berserk Vol.1', 100.00, 189.00, 10]);
    return { empresaId: e.insertId, userId: u.insertId, clienteId: c.insertId, productId: p.insertId };
}

/** Crea una venta con su renglon. */
export async function makeSale({ empresaId, userId, productId }, origen = 'web') {
    const [s] = await sql(
        `INSERT INTO sales (empresa_id, user_id, origen, subtotal, total, payment_method)
         VALUES (?,?,?,?,?,?)`,
        [empresaId, userId, origen, 189.00, 189.00, 'card']);
    await sql(`INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?,?,?,?)`,
        [s.insertId, productId, 1, 189.00]);
    return s.insertId;
}
