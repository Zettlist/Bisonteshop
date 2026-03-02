import mysql from 'mysql2/promise';

// En Cloud Run usamos el socket Unix de Cloud SQL
// En desarrollo local usamos el proxy TCP (127.0.0.1)
const isProduction = process.env.NODE_ENV === 'production';
const CLOUD_SQL_CONNECTION_NAME = process.env.CLOUD_SQL_CONNECTION_NAME || 'pos-torlan:us-central1:torlan-mysql';

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
    };

const pool = mysql.createPool(poolConfig);

export default pool;
