import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const [rows] = await pool.query("SELECT id, nombre_empresa FROM empresas ORDER BY id");
        return NextResponse.json({ empresas: rows });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
