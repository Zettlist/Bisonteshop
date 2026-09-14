import mysql from 'mysql2/promise';

// En Cloud Run usamos el socket Unix de Cloud SQL
// En desarrollo local usamos el proxy TCP (127.0.0.1)
const isProduction = process.env.NODE_ENV === 'production';
// Hay dos instancias con el mismo nombre, una por proyecto. La de torlan-web es
// la que usa el POS: es donde se dan de alta los productos y donde vive el
// inventario real. La de torlan-pro quedo con el catalogo congelado de agosto,
// asi que caer ahi por defecto era servir una tienda vacia sin un solo error.
const CLOUD_SQL_CONNECTION_NAME = process.env.CLOUD_SQL_CONNECTION_NAME || 'torlan-web:us-central1:torlan-mysql';

// Lo que sigue va explicito aunque coincida con el valor por defecto de mysql2:
// es el amplificador de cualquier inyeccion, y un valor por defecto es algo que
// cambia sin que nadie lo lea. Con `multipleStatements` encendido, un solo
// hueco convierte "colar una condicion en un WHERE" en "colar un DROP TABLE
// detras de un punto y coma". Apagado, el peor caso sigue siendo malo pero
// cabe dentro de una sola consulta.
const SIN_MULTIPLES_SENTENCIAS = { multipleStatements: false };

const poolConfig = isProduction
    ? {
        // Cloud Run: conexión via socket Unix
        socketPath: `/cloudsql/${CLOUD_SQL_CONNECTION_NAME}`,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        charset: 'utf8mb4',
        ...SIN_MULTIPLES_SENTENCIAS,
    }
    : {
        // Local: Cloud SQL Proxy via TCP
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4',
        ...SIN_MULTIPLES_SENTENCIAS,
    };

const pool = mysql.createPool(poolConfig);

export default pool;
