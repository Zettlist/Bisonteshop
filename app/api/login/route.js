import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';
import { rateLimit, rateLimitReset } from '@/lib/rateLimit';
import { ipCliente } from '@/lib/ipCliente';
import { isValidEmail } from '@/lib/validate';

// Un hash real contra el que comparar cuando el correo no existe. Sin el, la
// respuesta a "correo desconocido" vuelve al instante y la de "contraseña mala"
// tarda lo que tarda bcrypt: el reloj distingue lo que el mensaje ya no dice.
// El valor no importa mientras sea un hash valido de 12 rondas — nunca coincide.
const HASH_SEÑUELO = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.eS7.PSSTeCFbtSPTMnBBW8LmuUuQzO6';

// Correo desconocido y contraseña mala contestan LO MISMO. Antes eran un 404
// "Usuario no encontrado" y un 401 "Contraseña incorrecta": eso convierte el
// login en un buscador de clientes — se prueban correos y el codigo de estado
// dice cuales tienen cuenta. Con una lista de correos filtrada de otro sitio,
// separa "personas que compran manga +18 aqui" del resto.
const CREDENCIALES_MALAS = { success: false, error: 'Correo o contraseña incorrectos.' };

const getJwtSecretKey = () => {
    const secret = process.env.JWT_SECRET;
    return new TextEncoder().encode(secret);
};

export async function POST(req) {
    try {
        const ip = ipCliente(req);
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json(
                { success: false, error: 'Por favor, ingresa correo y contraseña.' },
                { status: 400 }
            );
        }

        if (!isValidEmail(email.toLowerCase())) {
            return NextResponse.json(
                { success: false, error: 'Correo inválido.' },
                { status: 400 }
            );
        }

        // Dos frenos, y el segundo es el que importa.
        //
        // El de la IP frena al que prueba mil contraseñas desde un sitio, pero
        // la IP sale de una cabecera que el cliente escribe (ver lib/ipCliente)
        // y una botnet trae miles de verdad. El de la CUENTA no se esquiva de
        // ninguna manera: para atacar el correo de alguien hay que escribir ese
        // correo, y eso es lo que se cuenta. Diez intentos fallidos en cinco
        // minutos por cuenta corta el relleno de credenciales sin estorbar a
        // quien de verdad no se acuerda de la suya.
        const destino = email.toLowerCase();
        const limitKey = `login:${ip}`;
        const claveCuenta = `login-cuenta:${destino}`;
        for (const [clave, tope, ventana] of [[limitKey, 5, 60_000], [claveCuenta, 10, 5 * 60_000]]) {
            const { allowed, retryAfter } = rateLimit(clave, tope, ventana);
            if (!allowed) {
                return NextResponse.json(
                    { success: false, error: `Demasiados intentos. Espera ${retryAfter} segundos e intenta de nuevo.` },
                    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
                );
            }
        }

        // Search for user
        const [users] = await pool.query(
            'SELECT * FROM clientes WHERE email = ? LIMIT 1', [destino]
        );

        const user = users[0] || null;

        // La comparacion se hace SIEMPRE, exista o no la cuenta: es lo que
        // iguala el tiempo de respuesta de los dos casos.
        const isMatch = await bcrypt.compare(password, user ? user.password : HASH_SEÑUELO);

        if (!user || !isMatch) {
            return NextResponse.json(CREDENCIALES_MALAS, { status: 401 });
        }

        // Block unverified accounts
        if (!user.email_verified) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Verifica tu correo para activar tu cuenta.',
                    requiresVerification: true,
                    email: user.email,
                },
                { status: 403 }
            );
        }

        // Create JWT
        const tokenPayload = {
            id: user.id,
            nombre: user.nombre,
            apellido: user.apellido,
            email: user.email,
            client_code: user.client_code,
            avatar: user.avatar || null,
            telefono: user.telefono || null,
            contacto_preferido: user.contacto_preferido || 'email',
            fecha_nac: user.fecha_nac ? user.fecha_nac.toISOString().split('T')[0] : null,
            sv: user.session_version ?? 1,
        };

        const token = await new SignJWT(tokenPayload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d') // 1 week
            .sign(getJwtSecretKey());

        // Login exitoso: limpiar los dos contadores.
        rateLimitReset(limitKey);
        rateLimitReset(claveCuenta);

        // Create response and set cookie
        const response = NextResponse.json({
            success: true,
            user: tokenPayload
        });

        response.cookies.set({
            name: 'bisonte_session',
            value: token,
            httpOnly: true,
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7 // 1 week
        });

        return response;

    } catch (error) {
        console.error('Error en login:', error);
        return NextResponse.json(
            { success: false, error: 'Error del servidor. Intenta de nuevo más tarde.' },
            { status: 500 }
        );
    }
}
