import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Endpoint administrativo: requiere la clave interna (no es de uso público).
export async function GET(request) {
    const key = request.headers.get('x-admin-key');
    if (!key || key !== process.env.CAPTURE_API_KEY) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    try {
        const [rows] = await pool.query("SELECT id, nombre_empresa FROM empresas ORDER BY id");
        return NextResponse.json({ empresas: rows });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
