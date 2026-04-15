import pool from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/verificar?token=xxxx
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.json({ success: false, error: 'Token no proporcionado.' }, { status: 400 });
    }

    try {
        const [rows] = await pool.query(
            `SELECT id, email_verified, token_expires_at FROM clientes WHERE verification_token = ? LIMIT 1`,
            [token]
        );

        if (rows.length === 0) {
            return NextResponse.json({ success: false, error: 'Token inválido o ya fue utilizado.' }, { status: 400 });
        }

        const cliente = rows[0];

        // Already verified
        if (cliente.email_verified) {
            return NextResponse.json({ success: true, alreadyVerified: true });
        }

        // Check expiry
        if (new Date() > new Date(cliente.token_expires_at)) {
            return NextResponse.json({ success: false, error: 'El enlace de verificación ha expirado. Solicita uno nuevo.', expired: true }, { status: 400 });
        }

        // Mark as verified
        await pool.query(
            `UPDATE clientes SET email_verified = 1, verification_token = NULL, token_expires_at = NULL WHERE id = ?`,
            [cliente.id]
        );

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[Verificar] Error:', error);
        return NextResponse.json({ success: false, error: 'Error del servidor.' }, { status: 500 });
    }
}
