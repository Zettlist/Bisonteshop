import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isValidText, isValidOptionalText, firstError, fechaNacimientoValida } from '@/lib/validate';

const getJwtSecretKey = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function GET() {
    const payload = await getSession();
    if (!payload) return NextResponse.json({ user: null });

    return NextResponse.json({
        user: {
            id: payload.id,
            nombre: payload.nombre,
            apellido: payload.apellido,
            email: payload.email,
            client_code: payload.client_code,
            avatar: payload.avatar || null,
            telefono: payload.telefono || null,
            contacto_preferido: payload.contacto_preferido || 'email',
            fecha_nac: payload.fecha_nac || null,
        }
    });
}

export async function PUT(req) {
    try {
        const payload = await getSession();
        if (!payload?.id) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

        const body = await req.json();
        const { avatar, nombre, apellido, telefono, fecha_nac, contacto_preferido } = body;

        if (!avatar && nombre === undefined && apellido === undefined && telefono === undefined
            && fecha_nac === undefined && contacto_preferido === undefined) {
            return NextResponse.json({ success: false, error: 'Sin datos' }, { status: 400 });
        }

        // La tienda es 18+: la fecha se valida aqui tambien, no solo en el alta.
        // Es la via por la que las cuentas de Google completan su perfil.
        // Mismo validador que /api/registro, para que no haya dos criterios.
        let fechaLimpia = null;
        if (fecha_nac) {
            const edadOk = fechaNacimientoValida(fecha_nac);
            if (!edadOk.ok) {
                return NextResponse.json({ success: false, error: edadOk.error }, { status: 400 });
            }
            fechaLimpia = edadOk.fecha;
        }

        // Lo demas tampoco venia mirado. Son columnas cortas (VARCHAR(30) el
        // telefono, VARCHAR(255) el avatar) y en modo estricto MySQL rechaza lo
        // que no cabe: un nombre de mil caracteres no corrompia nada, pero
        // salia por el catch como un 500 sin explicacion. Y `nombre` viaja
        // dentro del JWT y de ahi a los correos, asi que conviene que sea un
        // nombre.
        const valErr = firstError([
            [nombre === undefined || isValidText(nombre, { min: 1, max: 100 }), 'Nombre inválido.'],
            [apellido === undefined || isValidOptionalText(apellido, { max: 100 }), 'Apellido inválido.'],
            [isValidOptionalText(telefono, { max: 30 }), 'Teléfono inválido.'],
            [isValidOptionalText(avatar, { max: 255 }), 'Avatar inválido.'],
            [contacto_preferido === undefined || ['email', 'whatsapp', 'telefono', 'sms'].includes(contacto_preferido),
             'Medio de contacto inválido.'],
        ]);
        if (valErr) return NextResponse.json({ success: false, error: valErr }, { status: 400 });

        // El avatar es una URL que la pagina mete en un <img>. Se acota a
        // rutas propias y a https: un `javascript:` no se ejecuta desde un src
        // de imagen, pero tampoco hay razon para guardarlo.
        if (avatar && !/^(\/|https:\/\/)/.test(avatar)) {
            return NextResponse.json({ success: false, error: 'Avatar inválido.' }, { status: 400 });
        }

        // `avatar`, `telefono` y `contacto_preferido` se anadian aqui con ALTER
        // TABLE en cada guardado de perfil. Las tres estan en db/schema.sql.

        // Solo se escribe lo que llego. Antes el guardado del perfil escribia
        // las cinco columnas siempre, y lo que no venia en la peticion quedaba
        // en blanco: completar la fecha de nacimiento (lo unico que manda ese
        // aviso) BORRABA el telefono y reiniciaba el medio de contacto. El
        // `undefined` significa "no lo toques"; un texto vacio en telefono si
        // significa "quitalo".
        const cambios = {};
        if (avatar) cambios.avatar = avatar;
        if (nombre !== undefined) cambios.nombre = nombre;
        if (apellido !== undefined) cambios.apellido = apellido;
        if (telefono !== undefined) cambios.telefono = telefono || null;
        if (fechaLimpia) cambios.fecha_nac = fechaLimpia;
        if (contacto_preferido !== undefined) cambios.contacto_preferido = contacto_preferido;

        const columnas = Object.keys(cambios);
        if (columnas.length) {
            await pool.query(
                `UPDATE clientes SET ${columnas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
                [...columnas.map((c) => cambios[c]), payload.id]
            );
        }

        // La sesion nueva sale de la base, no de mezclar la peticion con la
        // sesion vieja: asi no puede quedar en el navegador un dato que la base
        // no tiene. Se conserva `sv` para no cerrar la sesion.
        const [[fila]] = await pool.query(
            `SELECT nombre, apellido, email, client_code, avatar, telefono, contacto_preferido, fecha_nac
               FROM clientes WHERE id = ? LIMIT 1`,
            [payload.id]
        );
        const newPayload = {
            id: payload.id,
            nombre: fila.nombre,
            apellido: fila.apellido,
            email: fila.email,
            client_code: fila.client_code,
            avatar: fila.avatar || null,
            telefono: fila.telefono || null,
            contacto_preferido: fila.contacto_preferido || 'email',
            fecha_nac: fila.fecha_nac ? new Date(fila.fecha_nac).toISOString().split('T')[0] : null,
            sv: payload.sv ?? 1,
        };

        const newToken = await new SignJWT(newPayload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(getJwtSecretKey());

        const response = NextResponse.json({ success: true, user: newPayload });
        response.cookies.set('bisonte_session', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
        });
        return response;
    } catch (e) {
        console.error('PUT /api/me error:', e);
        return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
    }
}

/**
 * Borrar la cuenta.
 *
 * Antes era un DELETE de la fila, y las llaves foraneas hacian el resto a
 * ciegas: el saldo de tienda desaparecia con la fila (dinero que el cliente
 * pago), los apartados pagados quedaban sin dueño y sin nadie que los viera, y
 * el registro de las recargas con tarjeta se borraba en cascada.
 *
 * Ahora:
 *
 *   1. No se borra mientras haya algo que devolver o entregar: saldo, un
 *      apartado vivo o un pedido en camino. Se dice cual, para que el cliente
 *      sepa que hacer.
 *   2. Cuando si se puede, la fila NO se borra: se le quitan los datos
 *      personales (nombre, correo, telefono, fecha de nacimiento, foto,
 *      direcciones, carrito, avisos, la liga con Google y con Stripe) y se
 *      conserva lo contable -- pedidos, recargas y movimientos de saldo --,
 *      que es lo que el aviso de privacidad promete guardar y lo que la ley
 *      obliga a conservar. Nadie puede volver a entrar a esa cuenta: el correo
 *      queda libre y la contraseña deja de existir.
 */
export async function DELETE() {
    try {
        const payload = await getSession();
        if (!payload?.id) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
        const clienteId = payload.id;

        const [[cuenta]] = await pool.query(
            'SELECT store_credit, stripe_customer_id FROM clientes WHERE id = ? LIMIT 1', [clienteId]
        );
        if (!cuenta) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

        const saldo = Number(cuenta.store_credit) || 0;
        if (saldo > 0) {
            return NextResponse.json({
                success: false,
                error: `Todavía tienes $${saldo.toFixed(2)} de saldo. Úsalo en una compra o escríbenos para devolvértelo antes de borrar tu cuenta.`,
            }, { status: 409 });
        }
        const [[apartados]] = await pool.query(
            "SELECT COUNT(*) AS n FROM anticipos WHERE cliente_id = ? AND status = 'pending'", [clienteId]
        );
        if (Number(apartados.n) > 0) {
            return NextResponse.json({
                success: false,
                error: 'Tienes un apartado activo. Liquídalo y pide su envío, o escríbenos, antes de borrar tu cuenta.',
            }, { status: 409 });
        }
        const [[enCurso]] = await pool.query(
            `SELECT COUNT(*) AS n FROM bisonte_orders
              WHERE cliente_id = ? AND estado IN ('pendiente', 'confirmado', 'envio', 'reclamo')`,
            [clienteId]
        );
        if (Number(enCurso.n) > 0) {
            return NextResponse.json({
                success: false,
                error: 'Tienes un pedido en curso. Cuando te llegue podrás borrar tu cuenta.',
            }, { status: 409 });
        }

        // Una contraseña que nadie conoce: la columna no admite vacio y la
        // cuenta no debe poder volver a abrirse.
        const claveMuerta = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM user_addresses WHERE cliente_id = ?', [clienteId]);
            await conn.query('DELETE FROM carts WHERE cliente_id = ?', [clienteId]);
            await conn.query('DELETE FROM user_notifications WHERE cliente_id = ?', [clienteId]);
            await conn.query(
                `UPDATE clientes
                    SET nombre = 'Cuenta', apellido = 'eliminada',
                        email = CONCAT('eliminada-', id, '@bisontemanga.invalid'),
                        password = ?, auth_provider = 'eliminada', google_sub = NULL,
                        telefono = NULL, nacionalidad = NULL, fecha_nac = NULL, avatar = NULL,
                        contacto_preferido = NULL, stripe_customer_id = NULL,
                        email_verified = 0, verification_token = NULL, token_expires_at = NULL,
                        reset_token_hash = NULL, reset_expires_at = NULL,
                        session_version = COALESCE(session_version, 1) + 1
                  WHERE id = ?`,
                [claveMuerta, clienteId]
            );
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        // Las tarjetas guardadas viven en Stripe, colgadas de su "customer".
        // Se borra para que no quede ahi un dato que ya no tiene dueño. Si
        // falla, la cuenta ya esta cerrada: queda en el log para hacerlo a mano.
        if (cuenta.stripe_customer_id) {
            try {
                const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
                await stripe.customers.del(cuenta.stripe_customer_id);
            } catch (err) {
                console.error(`[me/DELETE] Cuenta ${clienteId} cerrada, pero su cliente de Stripe sigue: ${err.message}`);
            }
        }

        const response = NextResponse.json({ success: true });
        response.cookies.set('bisonte_session', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/',
        });
        return response;
    } catch (e) {
        console.error('DELETE /api/me error:', e);
        return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
    }
}
