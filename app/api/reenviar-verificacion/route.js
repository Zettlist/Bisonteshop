import pool from '@/lib/db';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/mailer';

// POST /api/reenviar-verificacion
// Body: { email }
export async function POST(req) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ success: false, error: 'Correo requerido.' }, { status: 400 });
        }

        const [rows] = await pool.query(
            `SELECT id, nombre, email, email_verified FROM clientes WHERE email = ? LIMIT 1`,
            [email.toLowerCase()]
        );

        if (rows.length === 0) {
            // Don't reveal if email exists or not
            return NextResponse.json({ success: true });
        }

        const cliente = rows[0];

        if (cliente.email_verified) {
            return NextResponse.json({ success: true, alreadyVerified: true });
        }

        // Generate new token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h

        await pool.query(
            `UPDATE clientes SET verification_token = ?, token_expires_at = ? WHERE id = ?`,
            [token, expiresAt, cliente.id]
        );

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://bisontemanga.com';
        await sendVerificationEmail({ to: cliente.email, nombre: cliente.nombre, token, baseUrl });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[ReenviarVerificacion] Error:', error);
        return NextResponse.json({ success: false, error: 'Error del servidor.' }, { status: 500 });
    }
}
