import pool from '@/lib/db';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/mailer';
import { rateLimit } from '@/lib/rateLimit';
import { ipCliente } from '@/lib/ipCliente';
import { isValidEmail } from '@/lib/validate';

// POST /api/reenviar-verificacion
// Body: { email }
export async function POST(req) {
    try {
        const { email } = await req.json();

        if (!email || !isValidEmail(String(email).toLowerCase())) {
            return NextResponse.json({ success: false, error: 'Correo requerido.' }, { status: 400 });
        }

        // Dos frenos, porque hay dos abusos distintos.
        //
        // El de la IP corta al que manda mil peticiones desde un sitio. El del
        // CORREO corta lo que ese no ve: reenviar es "manda un correo a la
        // direccion que yo diga", asi que sin limite por destinatario, mil
        // maquinas distintas llenan el buzon de una persona con correos que
        // salen de nuestro dominio — y de paso queman la reputacion del
        // remitente. Tres al dia por direccion es de sobra para quien de verdad
        // no encuentra el suyo.
        const ip = ipCliente(req);
        const destino = String(email).toLowerCase();
        for (const [clave, tope, ventana] of [
            [`reenviar-ip:${ip}`, 5, 10 * 60_000],
            [`reenviar-correo:${destino}`, 3, 24 * 60 * 60_000],
        ]) {
            const { allowed, retryAfter } = rateLimit(clave, tope, ventana);
            if (!allowed) {
                return NextResponse.json(
                    { success: false, error: `Ya enviamos el correo. Espera ${retryAfter} segundos y revisa tu bandeja (y el spam).` },
                    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
                );
            }
        }

        const [rows] = await pool.query(
            `SELECT id, nombre, email, email_verified FROM clientes WHERE email = ? LIMIT 1`,
            [destino]
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
