import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { isStrongPassword } from '@/lib/validate';
import { ipCliente } from '@/lib/ipCliente';

export const dynamic = 'force-dynamic';

const huella = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Mismo texto para token inexistente, caducado o ya usado. Los tres son «este
 *  enlace no sirve», y separarlos solo le diria a quien prueba tokens cual de
 *  ellos estuvo cerca. */
const ENLACE_MALO = 'Este enlace ya no sirve. Pide uno nuevo.';

/**
 * Comprueba si un enlace de recuperacion sigue vivo.
 *
 * La pagina lo llama al abrirse para no pedirle a alguien una contrasena nueva
 * dos veces y decirle solo al final que el enlace habia caducado.
 */
export async function GET(request) {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) {
        return NextResponse.json({ success: false, error: ENLACE_MALO }, { status: 400 });
    }

    const [filas] = await pool.query(
        `SELECT id FROM clientes
          WHERE reset_token_hash = ? AND reset_expires_at > NOW()
          LIMIT 1`,
        [huella(token)]
    );

    if (!filas.length) {
        return NextResponse.json({ success: false, error: ENLACE_MALO }, { status: 400 });
    }
    return NextResponse.json({ success: true });
}

/**
 * Pone la contrasena nueva.
 *
 * Tres cosas pasan a la vez y las tres importan:
 *
 *   1. Se borra el token. De un solo uso: el enlace del correo deja de valer en
 *      cuanto se usa, aunque el correo siga en la bandeja.
 *   2. Sube `session_version`, que cierra TODAS las sesiones abiertas de esa
 *      cuenta. Es el punto de esta pantalla: si alguien entro a la cuenta, este
 *      es el momento en que se le echa. Sin esto, recuperar la contrasena no
 *      recupera la cuenta.
 *   3. El correo queda verificado. Quien abre un enlace que solo llego a esa
 *      direccion ya demostro que la direccion es suya, y dejarlo sin verificar
 *      obligaria a repetir la misma prueba por otro camino.
 *
 * Van en una transaccion porque a medias son peores que sin hacer: un token
 * borrado con la contrasena vieja deja a la persona fuera y sin enlace.
 */
export async function POST(request) {
    const ip = ipCliente(request);
    const { allowed } = rateLimit(`recuperar-set:${ip}`, 10, 15 * 60_000);
    if (!allowed) {
        return NextResponse.json(
            { success: false, error: 'Demasiados intentos. Prueba en un rato.' },
            { status: 429 }
        );
    }

    let token, password;
    try {
        ({ token, password } = await request.json());
    } catch {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    if (!token) {
        return NextResponse.json({ success: false, error: ENLACE_MALO }, { status: 400 });
    }
    if (!isStrongPassword(password)) {
        return NextResponse.json(
            { success: false, error: 'La contraseña debe tener 8-128 caracteres, con al menos una letra y un número.' },
            { status: 400 }
        );
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // FOR UPDATE: dos peticiones con el mismo token a la vez no pueden
        // gastarlo las dos. La segunda espera y se encuentra la fila ya sin
        // token.
        const [filas] = await conn.query(
            `SELECT id, auth_provider FROM clientes
              WHERE reset_token_hash = ? AND reset_expires_at > NOW()
              LIMIT 1
              FOR UPDATE`,
            [huella(token)]
        );

        if (!filas.length) {
            await conn.rollback();
            return NextResponse.json({ success: false, error: ENLACE_MALO }, { status: 400 });
        }

        const cliente = filas[0];
        const hash = await bcrypt.hash(password, 12);

        await conn.query(
            `UPDATE clientes
                SET password = ?,
                    reset_token_hash = NULL,
                    reset_expires_at = NULL,
                    email_verified = 1,
                    verification_token = NULL,
                    token_expires_at = NULL,
                    session_version = COALESCE(session_version, 1) + 1
              WHERE id = ?`,
            [hash, cliente.id]
        );

        await conn.commit();

        // Una cuenta de Google que se pone contrasena pasa a tener las dos
        // puertas. `auth_provider` se queda como estaba: dice de donde salio la
        // cuenta, no como se entra hoy.
        console.log(`[Recuperar] Contraseña restablecida para el cliente ${cliente.id} (${cliente.auth_provider})`);
        return NextResponse.json({ success: true });
    } catch (error) {
        await conn.rollback();
        console.error('[Recuperar/confirmar]', error);
        return NextResponse.json(
            { success: false, error: 'No pudimos cambiar tu contraseña. Inténtalo de nuevo.' },
            { status: 500 }
        );
    } finally {
        conn.release();
    }
}
