// Borra los pedidos de prueba creados por test-orders-envia.js
// Uso: node scripts/clean-test-orders.js  (requiere Cloud SQL proxy en 127.0.0.1:3306)
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const IDS_FILE = path.join(__dirname, 'test-orders-ids.json');

(async () => {
    if (!fs.existsSync(IDS_FILE)) { console.log('sin test-orders-ids.json — nada que limpiar'); return; }
    const ids = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
    if (!ids.length) { console.log('lista vacía'); return; }

    const c = await mysql.createConnection({
        host: '127.0.0.1',
        user: process.env.DB_USER || 'torlan_user',
        password: process.env.DB_PASSWORD,
        database: 'torlan_pos',
    });
    const [r1] = await c.query('DELETE FROM sale_items WHERE sale_id IN (?)', [ids]);
    const [r2] = await c.query('DELETE FROM bisonte_orders WHERE sale_id IN (?)', [ids]);
    const [r3] = await c.query('DELETE FROM sales WHERE id IN (?)', [ids]);
    console.log(`borrados — items: ${r1.affectedRows} | bisonte_orders: ${r2.affectedRows} | sales: ${r3.affectedRows} (ids: ${ids.join(', ')})`);
    fs.unlinkSync(IDS_FILE);
    await c.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
