/**
 * Comprueba la migracion 2026-09-14-rastreo-de-envios contra la base real.
 *
 *   node db/tests/rastreo-migracion.mjs
 *
 * No solo mira que las columnas existan: intenta HACER lo que cada cuenta
 * deberia y no deberia poder. Un GRANT mal escrito se ve igual de bien que uno
 * bueno hasta que alguien ejecuta la sentencia que no debia poder ejecutar.
 *
 * Escribe y borra una fila de prueba sobre un pedido ya marcado como prueba.
 * No toca ningun pedido real ni cambia el estado de nada.
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';

process.loadEnvFile('.env.local');

let ok = 0, mal = 0;
const bien = (n, d) => { ok++; console.log(`  \x1b[32mok\x1b[0m    ${n}${d ? '\n        ' + d : ''}`); };
const falla = (n, d) => { mal++; console.log(`  \x1b[31mFALLA\x1b[0m ${n}${d ? '\n        ' + d : ''}`); };
const prueba = (n, c, d) => c ? bien(n, d) : falla(n, d);

function claveDe(cuenta) {
    const t = readFileSync('db/.credenciales-TODAS.txt', 'utf8');
    const re = new RegExp('\\b' + cuenta + '\\b');
    const b = t.split(/^=+$/m).find(x => re.test(x) && /Contrasena:/.test(x));
    return b?.match(/Contrasena:\s*(\S+)/)?.[1] || null;
}

const conectar = (user, password) => mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user, password, database: process.env.DB_NAME,
});

const tienda = await conectar(process.env.DB_USER, process.env.DB_PASSWORD);
const q = async (c, sql, p = []) => (await c.query(sql, p))[0];

console.log('\n\x1b[1mLa forma de la tabla\x1b[0m\n');

const cols = await q(tienda, 'SHOW COLUMNS FROM shipment_events');
const nombres = cols.map(c => c.Field);
prueba('la tabla shipment_events existe',
    nombres.length > 0, `${nombres.length} columnas`);

prueba('guarda el estado de Envia sin interpretar',
    nombres.includes('envia_status_id') && nombres.includes('envia_status') && nombres.includes('crudo'),
    'envia_status_id, envia_status y crudo');

prueba('distingue cuando paso de cuando nos enteramos',
    nombres.includes('ocurrido_en') && nombres.includes('registrado_en'));

const faseCol = cols.find(c => c.Field === 'fase');
prueba('la fase incluye incidencia y devuelta',
    /incidencia/.test(faseCol.Type) && /devuelta/.test(faseCol.Type) && /informativo/.test(faseCol.Type),
    faseCol.Type.replace(/enum\(|\)/g, '').replace(/'/g, ''));

const origenCol = cols.find(c => c.Field === 'origen');
prueba('un evento simulado se puede distinguir de uno real',
    /simulador/.test(origenCol.Type), origenCol.Type.replace(/enum\(|\)/g, '').replace(/'/g, ''));

console.log('\n\x1b[1mEl pedido\x1b[0m\n');

const colsPedido = (await q(tienda, 'SHOW COLUMNS FROM bisonte_orders'));
const envio = colsPedido.find(c => c.Field === 'shipping_status');
prueba('el estado de envio ya no es un interruptor de dos posiciones',
    ['recolectada', 'en_transito', 'en_reparto', 'entregada', 'incidencia', 'devuelta']
        .every(v => envio.Type.includes(v)),
    envio.Type.replace(/enum\(|\)/g, '').replace(/'/g, ''));

prueba('conserva los dos valores viejos, para no romper filas existentes',
    envio.Type.includes('en_espera') && envio.Type.includes('despachado'));

prueba('existe la marca de prueba y la fecha de ultima consulta',
    colsPedido.some(c => c.Field === 'es_prueba') &&
    colsPedido.some(c => c.Field === 'rastreo_consultado_en'));

const marcados = await q(tienda, 'SELECT COUNT(*) n, SUM(es_prueba = 1) prueba FROM bisonte_orders');
prueba('los pedidos que ya existian quedaron marcados como prueba',
    marcados[0].n === Number(marcados[0].prueba),
    `${marcados[0].prueba} de ${marcados[0].n}`);

console.log('\n\x1b[1mLo que cada cuenta puede hacer de verdad\x1b[0m\n');

const pedido = (await q(tienda, 'SELECT id FROM bisonte_orders WHERE es_prueba = 1 ORDER BY id DESC LIMIT 1'))[0];

const pos = await conectar('pos_app', claveDe('pos_app'));
let idInsertado = null;
try {
    const r = await q(pos,
        `INSERT INTO shipment_events
            (bisonte_order_id, tracking_number, envia_status_id, envia_status, fase, descripcion, ocurrido_en, origen)
         VALUES (?, 'PRUEBA-MIGRACION', 1, 'Created', 'creada', 'fila de prueba del test de migracion', NOW(), 'simulador')`,
        [pedido.id]);
    idInsertado = r.insertId;
    bien('pos_app puede registrar un evento', `pedido #${pedido.id}`);
} catch (e) {
    falla('pos_app puede registrar un evento', e.code);
}

try {
    await q(pos, 'UPDATE shipment_events SET descripcion = ? WHERE id = ?', ['reescrito', idInsertado]);
    falla('pos_app NO puede reescribir un evento', 'lo reescribio: el historial es editable');
} catch (e) {
    prueba('pos_app NO puede reescribir un evento',
        e.code === 'ER_TABLEACCESS_DENIED_ERROR', e.code);
}

try {
    await q(pos, 'DELETE FROM shipment_events WHERE id = ?', [idInsertado]);
    falla('pos_app NO puede borrar un evento', 'lo borro');
} catch (e) {
    prueba('pos_app NO puede borrar un evento',
        e.code === 'ER_TABLEACCESS_DENIED_ERROR', e.code);
}

const leidos = await q(tienda, 'SELECT id, fase FROM shipment_events WHERE id = ?', [idInsertado]);
prueba('bisonte_app puede leer el recorrido', leidos.length === 1, `fase "${leidos[0]?.fase}"`);

try {
    await q(tienda,
        `INSERT INTO shipment_events (bisonte_order_id, envia_status_id, fase, ocurrido_en)
         VALUES (?, 1, 'creada', NOW())`, [pedido.id]);
    falla('bisonte_app NO puede escribir eventos', 'escribio uno');
} catch (e) {
    prueba('bisonte_app NO puede escribir eventos',
        e.code === 'ER_TABLEACCESS_DENIED_ERROR', e.code);
}

console.log('\n\x1b[1mQue preguntar dos veces no duplique\x1b[0m\n');

try {
    await q(pos,
        `INSERT INTO shipment_events
            (bisonte_order_id, tracking_number, envia_status_id, envia_status, fase, ocurrido_en, origen)
         SELECT bisonte_order_id, tracking_number, envia_status_id, envia_status, fase, ocurrido_en, origen
           FROM shipment_events WHERE id = ?`, [idInsertado]);
    falla('el mismo evento dos veces se rechaza', 'entro duplicado');
} catch (e) {
    prueba('el mismo evento dos veces se rechaza',
        e.code === 'ER_DUP_ENTRY', `${e.code} — el consultor puede repreguntar sin ensuciar`);
}

// Limpieza: con root, que es quien puede borrar de esta tabla.
//
// Se comprueba que se fueron LAS FILAS DE ESTA PRUEBA, no que la tabla quede
// vacia: el simulador de envios deja eventos a proposito para poder mirar la
// pantalla, y una prueba que exige una tabla vacia esta exigiendo que nadie
// mas use la base.
const root = await conectar('root', claveDe('root'));
await q(root, 'DELETE FROM shipment_events WHERE tracking_number = ?', ['PRUEBA-MIGRACION']);
const mias = await q(tienda, 'SELECT COUNT(*) n FROM shipment_events WHERE tracking_number = ?', ['PRUEBA-MIGRACION']);
const total = await q(tienda, "SELECT COUNT(*) n, SUM(origen = 'simulador') sim FROM shipment_events");
prueba('esta prueba no deja rastro',
    mias[0].n === 0,
    `quedan ${total[0].n} evento(s) en la tabla, ${total[0].sim || 0} del simulador — ninguno de esta prueba`);

await Promise.all([tienda.end(), pos.end(), root.end()]);
console.log(`\n  \x1b[1m${ok} pasan, ${mal} fallan\x1b[0m\n`);
process.exit(mal ? 1 : 0);
