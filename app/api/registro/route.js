import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/mailer';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

// Generates a unique short client code like BS-4921
async function generateClientCode() {
    let code;
    let exists = true;
    while (exists) {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        code = `BS-${randomNum}`;
        const [rows] = await pool.query(
            'SELECT id FROM clientes WHERE client_code = ?', [code]
        );
        exists = rows.length > 0;
    }
    return code;
}

export async function POST(req) {
    try {
        const { nombre, apellido, fechaNacimiento, email, password, telefono } = await req.json();

        // Basic server-side validation
        if (!nombre || !apellido || !fechaNacimiento || !email || !password) {
            return NextResponse.json(
                { success: false, error: 'Todos los campos son requeridos.' },
                { status: 400 }
            );
        }

        // Validate age (must be 18+)
        const hoy = new Date();
        const nacimiento = new Date(fechaNacimiento);
        const edad = hoy.getFullYear() - nacimiento.getFullYear()
            - (hoy < new Date(hoy.getFullYear(), nacimiento.getMonth(), nacimiento.getDate()) ? 1 : 0);
        if (edad < 18) {
            return NextResponse.json(
                { success: false, error: 'Debes ser mayor de 18 años para registrarte.' },
                { status: 400 }
            );
        }

        // Check if email already registered
        const [existing] = await pool.query(
            'SELECT id FROM clientes WHERE email = ?', [email.toLowerCase()]
        );
        if (existing.length > 0) {
            return NextResponse.json(
                { success: false, error: 'Este correo electrónico ya está registrado.' },
                { status: 409 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Generate unique client code
        const clientCode = await generateClientCode();

        // Generate verification token (expires in 24 hours)
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h

        // Insert new user (unverified)
        await pool.query(
            `INSERT INTO clientes (nombre, apellido, fecha_nac, email, password, client_code, empresa_id, telefono, email_verified, verification_token, token_expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [nombre, apellido, fechaNacimiento, email.toLowerCase(), hashedPassword, clientCode, EMPRESA_ID, telefono || null, token, expiresAt]
        );

        // Send verification email (non-blocking — don't fail registration if email fails)
        try {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://bisontemanga.com';
            await sendVerificationEmail({ to: email.toLowerCase(), nombre, token, baseUrl });
        } catch (mailErr) {
            console.error('[Registro] Error enviando correo de verificación:', mailErr.message);
        }

        return NextResponse.json({
            success: true,
            message: '¡Cuenta creada! Revisa tu correo para verificar tu cuenta.',
            clientNumber: clientCode,
            requiresVerification: true,
        });

    } catch (error) {
        console.error('Error en registro:', error);
        return NextResponse.json(
            { success: false, error: 'Error del servidor. Intenta de nuevo más tarde.' },
            { status: 500 }
        );
    }
}
