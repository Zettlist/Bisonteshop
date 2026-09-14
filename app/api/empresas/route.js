import pool from '@/lib/db';
import { NextResponse } from 'next/server';
import { claveApiValida } from '@/lib/claveApi';

export const dynamic = 'force-dynamic';

// Endpoint administrativo: requiere la clave interna (no es de uso público).
export async function GET(request) {
    const key = request.headers.get('x-admin-key');
    if (!claveApiValida(key)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    try {
        const [rows] = await pool.query("SELECT id, nombre_empresa FROM empresas ORDER BY id");
        return NextResponse.json({ empresas: rows });
    } catch (error) {
        console.error('[Empresas]', error);
        return NextResponse.json({ error: 'Error del servidor.' }, { status: 500 });
    }
}
