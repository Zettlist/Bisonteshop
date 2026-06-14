// Inyecta votos de prueba usando clientes reales (para que el POS muestre nombre/email).
// Guarda los ids insertados en scripts/test-votes-ids.json para limpieza exacta.
// Limpiar después: node scripts/clean-test-votes.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const EVENTO = 'mundial2026-mex-kor';
const TOTAL = parseInt(process.argv[2]) || 12;
const IDS_FILE = path.join(__dirname, 'test-votes-ids.json');

(async () => {
    const c = await mysql.createConnection({
        host: '127.0.0.1',
        user: process.env.DB_USER || 'torlan_user',
        password: process.env.DB_PASSWORD || 'rUJJkcUfzloxoxzQVPH3MKK1',
        database: 'torlan_pos',
    });

    // Clientes reales que aún no han votado en este evento
    const [clientes] = await c.query(
        `SELECT id, nombre, email FROM clientes
         WHERE id NOT IN (SELECT cliente_id FROM event_votes WHERE evento = ?)
         ORDER BY id LIMIT ?`,
        [EVENTO, TOTAL]
    );

    const usados = [];
    for (const [i, cl] of clientes.entries()) {
        const opcion = Math.random() < 0.58 ? 'mexico' : 'corea';
        await c.query(
            'INSERT IGNORE INTO event_votes (evento, cliente_id, opcion) VALUES (?, ?, ?)',
            [EVENTO, cl.id, opcion]
        );
        usados.push(cl.id);
        console.log(`${i + 1}/${clientes.length}  ${cl.nombre || '(sin nombre)'} <${cl.email}> → ${opcion}`);
    }

    // Si no alcanzan los clientes reales, completar con ids falsos 900001+
    for (let i = clientes.length; i < TOTAL; i++) {
        const fakeId = 900001 + i;
        const opcion = Math.random() < 0.58 ? 'mexico' : 'corea';
        await c.query(
            'INSERT IGNORE INTO event_votes (evento, cliente_id, opcion) VALUES (?, ?, ?)',
            [EVENTO, fakeId, opcion]
        );
        usados.push(fakeId);
        console.log(`${i + 1}/${TOTAL}  (fake #${fakeId}) → ${opcion}`);
    }

    fs.writeFileSync(IDS_FILE, JSON.stringify(usados));
    const [rows] = await c.query(
        'SELECT opcion, COUNT(*) AS n FROM event_votes WHERE evento = ? GROUP BY opcion',
        [EVENTO]
    );
    console.log('\nconteos:', JSON.stringify(rows), `| ids guardados en ${IDS_FILE}`);
    await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
