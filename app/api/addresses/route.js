import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

const getJwtSecretKey = () => new TextEncoder().encode(process.env.JWT_SECRET);

async function getClienteId() {
    const cookieStore = await cookies();
    const token = cookieStore.get('bisonte_session')?.value;
    if (!token) return null;
    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey());
        return payload.id;
    } catch {
        return null;
    }
}

// GET — obtener dirección guardada del usuario
export async function GET() {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ address: null });

    const [rows] = await pool.query(
        'SELECT * FROM user_addresses WHERE cliente_id = ? ORDER BY is_default DESC LIMIT 1',
        [clienteId]
    );

    return NextResponse.json({ address: rows[0] || null });
}

// POST — guardar o actualizar dirección
export async function POST(request) {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

    const body = await request.json();
    const { nombre_recibe, telefono, calle, numero_exterior, numero_interior, colonia, cp, municipio, estado, entre_calles, referencias } = body;

    const numero = [numero_exterior, numero_interior].filter(Boolean).join(' Int. ');

    // Verificar si ya tiene dirección
    const [existing] = await pool.query(
        'SELECT id FROM user_addresses WHERE cliente_id = ? LIMIT 1',
        [clienteId]
    );

    if (existing.length > 0) {
        await pool.query(
            `UPDATE user_addresses SET
                nombre_recibe=?, calle=?, numero=?, colonia=?, municipio=?, estado=?, cp=?, is_default=1
             WHERE cliente_id=?`,
            [nombre_recibe, calle, numero, colonia, municipio, estado, cp, clienteId]
        );
    } else {
        await pool.query(
            `INSERT INTO user_addresses (cliente_id, nombre_recibe, calle, numero, colonia, municipio, estado, cp, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [clienteId, nombre_recibe, calle, numero, colonia, municipio, estado, cp]
        );
    }

    return NextResponse.json({ success: true });
}
