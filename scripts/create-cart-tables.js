import fs from 'fs';
import mysql from 'mysql2/promise';

const env = fs.readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
    const [key, val] = line.split('=');
    if (key && val) acc[key.trim()] = val.trim();
    return acc;
}, {});

async function createCartTables() {
    try {
        const pool = mysql.createPool({
            host: env.DB_HOST,
            user: env.DB_USER,
            password: env.DB_PASSWORD,
            database: env.DB_NAME,
            port: env.DB_PORT,
        });

        const connection = await pool.getConnection();
        console.log("Connected. Creating cart related tables...");
        
        // Add store_credit to clientes if not exists
        try {
            await connection.query(`ALTER TABLE clientes ADD COLUMN store_credit DECIMAL(10,2) DEFAULT 0.00`);
            console.log("Added store_credit to clientes.");
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') {
                console.log("store_credit column may already exist or error:", e.message);
            }
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS carts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cliente_id INT NOT NULL,
                estado ENUM('activo', 'pagado', 'abandonado') DEFAULT 'activo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("Table 'carts' created successfully.");

        await connection.query(`
            CREATE TABLE IF NOT EXISTS cart_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cart_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                product_type ENUM('stock', 'preventa') NOT NULL,
                anticipo_percent DECIMAL(5,2) DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("Table 'cart_items' created successfully.");

        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_addresses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cliente_id INT NOT NULL,
                nombre_recibe VARCHAR(100) NOT NULL,
                calle VARCHAR(150) NOT NULL,
                numero VARCHAR(50) NOT NULL,
                colonia VARCHAR(100) NOT NULL,
                municipio VARCHAR(100) NOT NULL,
                estado VARCHAR(100) NOT NULL,
                cp VARCHAR(20) NOT NULL,
                is_default BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("Table 'user_addresses' created successfully.");
        
        connection.release();
        process.exit(0);
    } catch (err) {
        console.error("DB Error:", err.message);
        process.exit(1);
    }
}

createCartTables();
