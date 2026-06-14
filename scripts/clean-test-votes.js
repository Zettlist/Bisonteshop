// Borra los votos de prueba: ids guardados en test-votes-ids.json + fakes 900001+
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const EVENTO = 'mundial2026-mex-kor';
const IDS_FILE = path.join(__dirname, 'test-votes-ids.json');

(async () => {
    const c = await mysql.createConnection({
        host: '127.0.0.1',
        user: process.env.DB_USER || 'torlan_user',
        password: process.env.DB_PASSWORD || 'rUJJkcUfzloxoxzQVPH3MKK1',
        database: 'torlan_pos',
    });

    let total = 0;
    if (fs.existsSync(IDS_FILE)) {
        const ids = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
        if (ids.length) {
            const [r] = await c.query(
                'DELETE FROM event_votes WHERE evento = ? AND cliente_id IN (?)',
                [EVENTO, ids]
            );
            total += r.affectedRows;
        }
        fs.unlinkSync(IDS_FILE);
    }
    // Fakes por si quedó alguno de corridas anteriores
    const [r2] = await c.query(
        'DELETE FROM event_votes WHERE evento = ? AND cliente_id >= 900001',
        [EVENTO]
    );
    total += r2.affectedRows;

    const [rows] = await c.query('SELECT COUNT(*) AS n FROM event_votes WHERE evento = ?', [EVENTO]);
    console.log('borrados:', total, '| restantes:', rows[0].n);
    await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
