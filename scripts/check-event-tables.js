// Verificación rápida: tablas de eventos y conteo de votos
const mysql = require('mysql2/promise');

(async () => {
    const c = await mysql.createConnection({
        host: '127.0.0.1',
        user: process.env.DB_USER || 'torlan_user',
        password: process.env.DB_PASSWORD || 'rUJJkcUfzloxoxzQVPH3MKK1',
        database: 'torlan_pos',
    });
    const [tables] = await c.query("SHOW TABLES LIKE 'event_%'");
    console.log('tablas:', JSON.stringify(tables));
    const [votes] = await c.query('SELECT opcion, COUNT(*) AS n FROM event_votes GROUP BY opcion');
    console.log('votos:', JSON.stringify(votes));
    await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
