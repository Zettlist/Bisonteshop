/**
 * Crea product_reviews sobre una base ya existente.
 *
 * Hasta ahora `products.rating` y `products.rating_count` eran un promedio sin
 * nadie detras: las unicas notas del catalogo estaban escritas a mano en
 * lib/demo.js y ningun cliente tenia donde poner la suya. Esta tabla es la que
 * faltaba; el promedio de products pasa a ser lo que sale de aqui.
 *
 * No se toca el POS: la tabla es solo de la tienda y las dos columnas de
 * products siguen donde estaban, asi que el alta de productos no cambia.
 *
 * Idempotente. Uso: node scripts/add-product-reviews.js
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

    await conn.query(`
        CREATE TABLE IF NOT EXISTS product_reviews (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            product_id  INT NOT NULL,
            cliente_id  INT NOT NULL,
            rating      TINYINT NOT NULL,
            -- Hoy la tienda solo pide estrellas. La columna se crea desde el
            -- principio para que agregar el comentario despues no obligue a
            -- migrar una tabla que ya tendra opiniones dentro.
            comentario  TEXT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            CONSTRAINT fk_reviews_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
            CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
            -- Una opinion por persona y producto: se cambia, no se acumula.
            UNIQUE KEY uniq_review (product_id, cliente_id),
            INDEX idx_product (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('+ product_reviews');

    // Los promedios se ponen al dia con la tabla nueva, pero solo en las filas
    // que ya traian algo escrito: un promedio a mano que ninguna opinion
    // sostiene es una nota inventada de cara al cliente. Las que estan en NULL
    // no se tocan, asi este script no pasa por encima de los productos que el
    // POS da de alta. Los de prueba de lib/demo.js tampoco: no estan en la
    // tabla, sus notas viven en el archivo.
    const [r] = await conn.query(`
        UPDATE products p
           SET p.rating       = (SELECT ROUND(AVG(v.rating), 1) FROM product_reviews v WHERE v.product_id = p.id),
               p.rating_count = (SELECT COUNT(*)                FROM product_reviews v WHERE v.product_id = p.id)
         WHERE p.rating IS NOT NULL OR p.rating_count <> 0
    `);
    console.log(`= promedios puestos al dia (${r.affectedRows} productos con nota previa)`);

    console.log('listo');
    await conn.end();
})().catch(err => { console.error(err.message); process.exit(1); });
