// Lista clientes registrados (email + estado de verificación)
const mysql = require('mysql2/promise');

(async () => {
    const c = await mysql.createConnection({
        host: '127.0.0.1',
        user: process.env.DB_USER || 'torlan_user',
        password: process.env.DB_PASSWORD || 'rUJJkcUfzloxoxzQVPH3MKK1',
        database: 'torlan_pos',
    });
    const [rows] = await c.query(
        'SELECT id, nombre, apellido, email, email_verified, created_at FROM clientes ORDER BY id'
    );
    console.table(rows.map(r => ({
        id: r.id,
        nombre: `${r.nombre || ''} ${r.apellido || ''}`.trim(),
        email: r.email,
        verificado: r.email_verified ? 'sí' : 'NO',
    })));
    await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
