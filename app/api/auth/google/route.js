import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';

// ─────────────────────────────────────────────────────────────────────────────
// Entrar / registrarse con Google.
//
// El navegador obtiene un ID token de Google (Google Identity Services) y lo
// manda aqui. Este endpoint lo VERIFICA contra las llaves publicas de Google
// antes de creer nada: firma, emisor, audiencia (nuestro client id), caducidad
// y que el correo venga verificado. Nombre y correo se toman del token, nunca
// del cuerpo de la peticion — el cliente puede mentir, el token firmado no.
//
// Con eso se emite la MISMA cookie de sesion que /api/login, asi el resto de la
// app (middleware, /api/me, store) no cambia en nada.
// ─────────────────────────────────────────────────────────────────────────────

const EMPRESA_ID = process.env.EMPRESA_ID || 122;
const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const getJwtSecretKey = () => new TextEncoder().encode(process.env.JWT_SECRET);

// `auth_provider` y `google_sub` dicen de donde salio la cuenta y permiten
// ligarla por el sub de Google (el correo puede cambiar de dueño en un dominio
// corporativo; el sub no). Y `fecha_nac` es nullable porque Google no la
// comparte: la cuenta nace sin ella y el cliente la completa despues.
//
// Las tres cosas las hacia un ensureGoogleCols() con ALTER TABLE en cada login.
// Estan en db/schema.sql y en db/migrations/2026-09-07-login-google.sql.

async function generateClientCode() {
    let code;
    let exists = true;
    while (exists) {
        code = `BS-${Math.floor(1000 + Math.random() * 9000)}`;
        const [rows] = await pool.query('SELECT id FROM clientes WHERE client_code = ?', [code]);
        exists = rows.length > 0;
    }
    return code;
}

function sesionDe(user) {
    return {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        client_code: user.client_code,
        avatar: user.avatar || null,
        telefono: user.telefono || null,
        contacto_preferido: user.contacto_preferido || 'email',
        fecha_nac: user.fecha_nac
            ? (user.fecha_nac instanceof Date ? user.fecha_nac.toISOString().split('T')[0] : String(user.fecha_nac))
            : null,
        sv: user.session_version ?? 1,
    };
}

async function responderConSesion(user) {
    const payload = sesionDe(user);
    const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(getJwtSecretKey());

    const res = NextResponse.json({ success: true, user: payload });
    res.cookies.set({
        name: 'bisonte_session',
        value: token,
        httpOnly: true,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7,
    });
    return res;
}

export async function POST(req) {
    try {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId || !process.env.JWT_SECRET) {
            return NextResponse.json(
                { success: false, error: 'El acceso con Google no está configurado.' },
                { status: 503 }
            );
        }

        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || req.headers.get('x-real-ip') || 'unknown';
        const { allowed, retryAfter } = rateLimit(`google:${ip}`, 10, 60_000);
        if (!allowed) {
            return NextResponse.json(
                { success: false, error: `Demasiados intentos. Espera ${retryAfter} segundos.` },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }

        const { credential } = await req.json();
        if (!credential) {
            return NextResponse.json({ success: false, error: 'Falta el token de Google.' }, { status: 400 });
        }

        // ── Verificacion del ID token ────────────────────────────────────────
        let claims;
        try {
            const { payload } = await jwtVerify(credential, JWKS, {
                issuer: GOOGLE_ISS,
                audience: clientId,
            });
            claims = payload;
        } catch {
            return NextResponse.json(
                { success: false, error: 'No pudimos validar tu cuenta de Google.' },
                { status: 401 }
            );
        }

        // Sin correo verificado no se liga nada: seria la via para apropiarse de
        // una cuenta existente registrando ese correo en otro proveedor.
        if (!claims.email || claims.email_verified !== true) {
            return NextResponse.json(
                { success: false, error: 'Tu correo de Google no está verificado.' },
                { status: 403 }
            );
        }


        const email = String(claims.email).toLowerCase();
        const sub = String(claims.sub);

        // ── Cuenta existente: entra y queda ligada al sub ────────────────────
        const [existentes] = await pool.query(
            'SELECT * FROM clientes WHERE google_sub = ? OR email = ? LIMIT 1', [sub, email]
        );

        if (existentes.length > 0) {
            const user = existentes[0];
            await pool.query(
                `UPDATE clientes
                    SET google_sub = ?,
                        email_verified = 1,
                        avatar = COALESCE(avatar, ?)
                  WHERE id = ?`,
                [sub, claims.picture || null, user.id]
            );
            return responderConSesion({ ...user, email_verified: 1, avatar: user.avatar || claims.picture || null });
        }

        // ── Cuenta nueva ────────────────────────────────────────────────────
        // Se crea de inmediato, SIN fecha de nacimiento: Google no la da y no
        // vale la pena frenar el alta por eso. Queda pendiente de completar y
        // hasta entonces la cuenta no puede comprar (lo corta /api/checkout).
        // La columna password es NOT NULL y esta cuenta no usa contraseña: se
        // guarda el hash de un valor aleatorio que nadie conoce, para que no
        // exista ninguna contraseña que pueda abrirla.
        const passwordInservible = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
        const clientCode = await generateClientCode();

        const [ins] = await pool.query(
            `INSERT INTO clientes
                (empresa_id, nombre, apellido, fecha_nac, email, password, client_code,
                 avatar, email_verified, auth_provider, google_sub)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1, 'google', ?)`,
            [
                EMPRESA_ID,
                (claims.given_name || 'Cliente').slice(0, 100),
                (claims.family_name || '-').slice(0, 100),
                email,
                passwordInservible,
                clientCode,
                claims.picture || null,
                sub,
            ]
        );

        const [creado] = await pool.query('SELECT * FROM clientes WHERE id = ?', [ins.insertId]);
        return responderConSesion(creado[0]);

    } catch (error) {
        console.error('Error en acceso con Google:', error);
        return NextResponse.json(
            { success: false, error: 'Error del servidor. Intenta de nuevo más tarde.' },
            { status: 500 }
        );
    }
}
