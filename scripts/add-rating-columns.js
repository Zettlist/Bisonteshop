/**
 * Agrega products.rating y products.rating_count a una base ya creada.
 *
 * schema.sql las declara, pero la base compartida con el POS ya existe y no se
 * recrea: sin este paso la ficha del producto consulta columnas que no estan y
 * el catalogo entero responde 500. El cambio es aditivo y ambas columnas son
 * opcionales, asi que el POS sigue insertando productos sin tocar nada.
 *
 * Idempotente. Uso: node scripts/add-rating-columns.js
 * (requiere el Cloud SQL proxy en 127.0.0.1:3306)
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Cargar .env.local (sin dotenv, igual que el resto de scripts)
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const [cols] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
            AND COLUMN_NAME IN ('rating', 'rating_count')`
    );
    const existentes = cols.map(c => c.COLUMN_NAME);

    if (!existentes.includes('rating')) {
        await conn.query('ALTER TABLE products ADD COLUMN rating DECIMAL(2,1) NULL AFTER group_name');
        console.log('+ products.rating');
    }
    if (!existentes.includes('rating_count')) {
        await conn.query('ALTER TABLE products ADD COLUMN rating_count INT NOT NULL DEFAULT 0 AFTER rating');
        console.log('+ products.rating_count');
    }

    const [chk] = await conn.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
            AND CONSTRAINT_NAME = 'chk_products_rating'`
    );
    if (!chk.length) {
        await conn.query(
            `ALTER TABLE products ADD CONSTRAINT chk_products_rating
             CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5))`
        );
        console.log('+ chk_products_rating');
    }

    console.log('listo');
    await conn.end();
})().catch(err => { console.error(err.message); process.exit(1); });
