import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Utilidad de setup: requiere la clave interna (no es de uso público).
export async function GET(request) {
    const key = request.headers.get('x-admin-key');
    if (!key || key !== process.env.CAPTURE_API_KEY) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                nombre       VARCHAR(100) NOT NULL,
                apellido     VARCHAR(100) NOT NULL,
                fecha_nac    DATE NOT NULL,
                email        VARCHAR(255) NOT NULL UNIQUE,
                password     VARCHAR(255) NOT NULL,
                client_code  VARCHAR(20)  NOT NULL UNIQUE,
                empresa_id   INT NOT NULL,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        return NextResponse.json({ success: true, message: 'Tabla clientes creada o ya existía.' });
    } catch (error) {
        console.error('Error creando tabla clientes:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
