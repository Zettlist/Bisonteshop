import fs from 'fs';
import mysql from 'mysql2/promise';

const env = fs.readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) acc[key.trim()] = rest.join('=').trim();
    return acc;
}, {});

async function run() {
    const pool = mysql.createPool({
        host: env.DB_HOST,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        port: env.DB_PORT || 3306,
    });

    const conn = await pool.getConnection();
    console.log('Conectado. Creando tabla bisonte_orders...');

    await conn.query(`
        CREATE TABLE IF NOT EXISTS bisonte_orders (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            sale_id           INT NOT NULL,
            payment_intent_id VARCHAR(255) NOT NULL,
            status            ENUM('pending','captured','cancelled') DEFAULT 'pending',
            cliente_id        INT DEFAULT NULL,
            items_json        TEXT,
            created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_sale_id (sale_id),
            INDEX idx_status  (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✓ Tabla bisonte_orders creada (o ya existía).');
    conn.release();
    process.exit(0);
}

run().catch(err => { console.error(err.message); process.exit(1); });
