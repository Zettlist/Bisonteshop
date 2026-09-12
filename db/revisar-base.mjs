/**
 * Compara la base VIVA contra db/schema.sql y revisa el cuadre del saldo.
 *
 *   node db/revisar-base.mjs
 *
 * Existe porque el esquema de esta tienda no se migra en el arranque: se aplica
 * a mano (ver README). Eso deja siempre la misma duda antes de desplegar --
 * "¿la base de alla tiene lo que este repo cree que tiene?" -- y contestarla a
 * ojo con SHOW CREATE TABLE no escala a 49 tablas.
 *
 * Solo lee. No escribe una sola fila, y de `clientes` no saca mas que cuentas:
 * ahi hay datos personales que no tienen por que pasar por una consola.
 *
 * Necesita el tunel levantado:
 *   cloud-sql-proxy --gcloud-auth --port=3307 torlan-web:us-central1:torlan-mysql
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(join(AQUI, '..', '.env.local'));

const esquema = readFileSync(join(AQUI, 'schema.sql'), 'utf8');

const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

console.log(`Base: ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`);

let problemas = 0;
const mal = (m) => { console.log(`  ✗ ${m}`); problemas++; };
const bien = (m) => console.log(`  ✓ ${m}`);
const q = async (sql, p = []) => (await conn.query(sql, p))[0];

// ── 1. Las tablas ────────────────────────────────────────────────────────────
console.log('TABLAS');

// Parseo deliberadamente tonto: schema.sql es el unico que se lee y esta
// escrito a mano con un formato constante. Un parser de SQL de verdad seria
// mas fragil que esto y mucho mas largo.
const declaradas = [...esquema.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)].map(m => m[1]);
const vivas = (await q('SHOW TABLES')).map(r => Object.values(r)[0]);

const faltan = declaradas.filter(t => !vivas.includes(t));
const sobran = vivas.filter(t => !declaradas.includes(t));

if (faltan.length) mal(`faltan en la base: ${faltan.join(', ')}`);
if (sobran.length) mal(`estan en la base pero no en schema.sql: ${sobran.join(', ')}`);
if (!faltan.length && !sobran.length) bien(`las ${declaradas.length} tablas de schema.sql estan, y no sobra ninguna`);

// ── 2. Las columnas ──────────────────────────────────────────────────────────
console.log('\nCOLUMNAS');
const cols = await q(
    `SELECT TABLE_NAME t, COLUMN_NAME c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()`);
const vivasPorTabla = new Map();
for (const { t, c } of cols) {
    if (!vivasPorTabla.has(t)) vivasPorTabla.set(t, new Set());
    vivasPorTabla.get(t).add(c);
}

let columnasMal = 0;
for (const tabla of declaradas) {
    if (!vivas.includes(tabla)) continue;
    // El cuerpo de la tabla: de su CREATE al `) ENGINE`.
    const cuerpo = esquema.match(
        new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${tabla}\\s*\\(([\\s\\S]*?)\\n\\)\\s*ENGINE`, 'i'));
    if (!cuerpo) continue;
    const declaradasCol = cuerpo[1].split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('--') && !/^(PRIMARY|UNIQUE|INDEX|KEY|CONSTRAINT|FOREIGN|CHECK|FULLTEXT)\b/i.test(l))
        // El segundo token TIENE que ser un tipo. Sin esa condicion, las lineas
        // de continuacion de una columna partida en dos ("NOT NULL DEFAULT ...",
        // "REFERENCES ...") pasaban por nombres de columna y la revision
        // inventaba tres columnas que faltaban y no existian.
        .map(l => l.match(/^`?(\w+)`?\s+(?:INT|BIGINT|SMALLINT|MEDIUMINT|TINYINT|DECIMAL|FLOAT|DOUBLE|VARCHAR|CHAR|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT|ENUM|SET|DATE|DATETIME|TIMESTAMP|TIME|YEAR|JSON|BLOB|BOOLEAN|BIT)\b/i))
        .filter(Boolean).map(m => m[1]);

    const ausentes = declaradasCol.filter(c => !vivasPorTabla.get(tabla)?.has(c));
    if (ausentes.length) { mal(`${tabla}: faltan columnas ${ausentes.join(', ')}`); columnasMal++; }
}
if (!columnasMal) bien('ninguna tabla viva se quedo sin columnas de schema.sql');

// ── 3. Lo que trajo la migracion del credito ─────────────────────────────────
console.log('\nCREDITO — ESTRUCTURA');
const credito = await q(
    `SELECT COLUMN_NAME c, COLUMN_TYPE t, IS_NULLABLE n, COLUMN_DEFAULT d
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bisonte_orders'
        AND COLUMN_NAME = 'credito_aplicado'`);
if (!credito.length) mal('bisonte_orders.credito_aplicado NO existe: falta la migracion 2026-09-11');
else {
    const c = credito[0];
    if (c.t !== 'decimal(10,2)' || c.n !== 'NO' || Number(c.d) !== 0)
        mal(`credito_aplicado con forma rara: ${c.t} null=${c.n} default=${c.d}`);
    else bien('bisonte_orders.credito_aplicado — decimal(10,2) NOT NULL DEFAULT 0');
}

const checks = await q(
    `SELECT CONSTRAINT_NAME n FROM information_schema.CHECK_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME IN ('chk_bo_credito','chk_ct_amount')`);
const nombres = checks.map(r => r.n);
for (const c of ['chk_bo_credito', 'chk_ct_amount']) {
    nombres.includes(c) ? bien(`CHECK ${c}`) : mal(`falta el CHECK ${c}`);
}

const indices = await q(
    `SELECT TABLE_NAME t, INDEX_NAME i, NON_UNIQUE u FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND INDEX_NAME IN ('uniq_ct_payment_intent','idx_ct_cliente_created','idx_cliente_created')
      GROUP BY t, i, u`);
const uniq = indices.find(r => r.i === 'uniq_ct_payment_intent');
if (!uniq) mal('falta el UNIQUE de credit_topups.payment_intent_id — se podria acreditar dos veces el mismo cobro');
else if (Number(uniq.u) !== 0) mal('uniq_ct_payment_intent existe pero NO es unico');
else bien('UNIQUE credit_topups.payment_intent_id — lo que impide acreditar dos veces');
indices.find(r => r.t === 'credit_topups' && r.i === 'idx_ct_cliente_created')
    ? bien('indice de recargas por cliente') : mal('falta idx_ct_cliente_created');
indices.find(r => r.t === 'credit_history' && r.i === 'idx_cliente_created')
    ? bien('indice del historial por cliente') : mal('falta idx_cliente_created en credit_history');

// ── 4. El cuadre del dinero ──────────────────────────────────────────────────
console.log('\nCREDITO — CUADRE');

const [negativos] = await q('SELECT COUNT(*) n FROM clientes WHERE store_credit < 0');
Number(negativos.n) === 0 ? bien('ningun cliente con saldo negativo')
    : mal(`${negativos.n} cliente(s) con saldo NEGATIVO`);

// La prueba de fuego: el saldo tiene que ser la suma de sus movimientos. Si
// algun camino mueve store_credit sin anotar el movimiento, sale aqui.
const descuadres = await q(
    `SELECT c.id, c.store_credit saldo, COALESCE(SUM(h.amount),0) historial
       FROM clientes c
       LEFT JOIN credit_history h ON h.cliente_id = c.id
      GROUP BY c.id, c.store_credit
     HAVING ABS(c.store_credit - COALESCE(SUM(h.amount),0)) > 0.005`);
if (descuadres.length) {
    mal(`${descuadres.length} cliente(s) con el saldo distinto de su historial:`);
    for (const d of descuadres.slice(0, 10)) {
        console.log(`      cliente ${d.id}: saldo ${d.saldo}, movimientos ${d.historial}`);
    }
} else bien('en todos los clientes, el saldo es exactamente la suma de su historial');

// Una recarga acreditada tiene que tener su movimiento. Al reves seria dinero
// cobrado sin abonar.
const [sinMov] = await q(
    `SELECT COUNT(*) n FROM credit_topups t
      WHERE NOT EXISTS (SELECT 1 FROM credit_history h
                         WHERE h.cliente_id = t.cliente_id AND h.amount = t.amount
                           AND h.created_at BETWEEN t.created_at - INTERVAL 5 SECOND
                                                AND t.created_at + INTERVAL 5 SECOND)`);
Number(sinMov.n) === 0 ? bien('toda recarga cobrada tiene su movimiento en el historial')
    : mal(`${sinMov.n} recarga(s) cobradas SIN movimiento: alguien acredito por fuera de /api/credit/confirm`);

// Un pedido cerrado no puede quedarse el saldo.
const sinDevolver = await q(
    `SELECT o.sale_id, o.pago_estado, o.credito_aplicado, o.cliente_id
       FROM bisonte_orders o
      WHERE o.pago_estado IN ('cancelado','reembolsado') AND o.credito_aplicado > 0
        -- Sin cliente no hay a quien devolverle: la cuenta se borro y la
        -- cascada se llevo su historial, pero el pedido sobrevive con
        -- cliente_id en NULL (ON DELETE SET NULL). No es un descuadre.
        AND o.cliente_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM credit_history h
                         WHERE h.cliente_id = o.cliente_id AND h.amount = o.credito_aplicado
                           AND h.description LIKE CONCAT('Saldo devuelto: pedido #', o.sale_id, '%'))`);
sinDevolver.length === 0 ? bien('ningun pedido cancelado o reembolsado se quedo con el saldo')
    : mal(`${sinDevolver.length} pedido(s) cerrados sin devolver el saldo: ${sinDevolver.map(o => '#' + o.sale_id).join(', ')}`);

// Los pedidos pagados enteros con saldo llevan referencia propia, no un pi_.
const [saldoOrders] = await q(
    `SELECT COUNT(*) n FROM bisonte_orders WHERE payment_intent_id LIKE 'saldo\\_%'`);
const [piMalos] = await q(
    `SELECT COUNT(*) n FROM bisonte_orders
      WHERE payment_intent_id NOT LIKE 'pi\\_%' AND payment_intent_id NOT LIKE 'saldo\\_%'`);
console.log(`  · ${saldoOrders.n} pedido(s) pagados enteros con saldo`);
Number(piMalos.n) === 0 ? bien('toda referencia de pago es un pi_ de Stripe o un saldo_ propio')
    : mal(`${piMalos.n} pedido(s) con una referencia de pago que no es ni pi_ ni saldo_`);

// ── 5. Retrato ───────────────────────────────────────────────────────────────
console.log('\nESTADO');
const [r] = await q(
    `SELECT (SELECT COUNT(*) FROM clientes) clientes,
            (SELECT COUNT(*) FROM clientes WHERE store_credit > 0) con_saldo,
            (SELECT ROUND(COALESCE(SUM(store_credit),0),2) FROM clientes) saldo_total,
            (SELECT COUNT(*) FROM credit_topups) recargas,
            (SELECT COUNT(*) FROM credit_history) movimientos,
            (SELECT COUNT(*) FROM bisonte_orders) pedidos,
            (SELECT COUNT(*) FROM products) productos`);
for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(14)} ${v}`);

console.log(`\n${problemas === 0 ? '  Todo donde debe estar.' : `  ${problemas} problema(s) que mirar.`}`);
await conn.end();
process.exit(problemas ? 1 : 0);
