import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/mailer';
import { isValidEmail, isStrongPassword, isValidText, firstError, fechaNacimientoValida } from '@/lib/validate';
import { rateLimit } from '@/lib/rateLimit';
import { ipCliente } from '@/lib/ipCliente';

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

// `nacionalidad` se anadia aqui con ALTER TABLE en cada alta de cliente. Esta
// en db/schema.sql.

export async function POST(req) {
    try {
        // Alta de cuenta sin freno: cada llamada hashea una contraseña con
        // bcrypt (12 rondas, ~un cuarto de segundo de CPU cada una), recorre la
        // tabla buscando un codigo libre y MANDA UN CORREO. Las tres cosas se
        // pagan: el CPU es de la instancia de Cloud Run, y el correo sale de la
        // reputacion del dominio — un bucle apuntado aqui es un cañon de spam
        // firmado por bisontemanga.com.
        const ip = ipCliente(req);
        const { allowed, retryAfter } = rateLimit(`registro:${ip}`, 5, 10 * 60_000);
        if (!allowed) {
            return NextResponse.json(
                { success: false, error: `Demasiadas cuentas nuevas desde aquí. Espera ${retryAfter} segundos.` },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }

        const { nombre, apellido, fechaNacimiento, nacionalidad, email, password, telefono } = await req.json();

        // Basic server-side validation
        if (!nombre || !apellido || !fechaNacimiento || !email || !password) {
            return NextResponse.json(
                { success: false, error: 'Todos los campos son requeridos.' },
                { status: 400 }
            );
        }

        const valErr = firstError([
            [isValidText(nombre, { min: 1, max: 100 }), 'Nombre inválido.'],
            [isValidText(apellido, { min: 1, max: 100 }), 'Apellido inválido.'],
            [isValidEmail(String(email).toLowerCase()), 'Correo electrónico inválido.'],
            [isStrongPassword(password), 'La contraseña debe tener 8-128 caracteres, con al menos una letra y un número.'],
        ]);
        if (valErr) {
            return NextResponse.json({ success: false, error: valErr }, { status: 400 });
        }

        // La tienda es 18+. El corte vive en lib/validate.js porque el que
        // habia aqui se saltaba con la fecha escrita de otra forma: ver el
        // comentario de fechaNacimientoValida.
        const edadOk = fechaNacimientoValida(fechaNacimiento);
        if (!edadOk.ok) {
            return NextResponse.json({ success: false, error: edadOk.error }, { status: 400 });
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
            `INSERT INTO clientes (nombre, apellido, fecha_nac, email, password, client_code, empresa_id, telefono, nacionalidad, email_verified, verification_token, token_expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [nombre, apellido, edadOk.fecha, email.toLowerCase(), hashedPassword, clientCode, EMPRESA_ID, telefono || null, nacionalidad || null, token, expiresAt]
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
