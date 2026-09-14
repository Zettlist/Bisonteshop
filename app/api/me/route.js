import { SignJWT } from 'jose';
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

        if (!avatar && nombre === undefined && telefono === undefined && fecha_nac === undefined) {
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

        if (avatar) {
            await pool.query('UPDATE clientes SET avatar = ? WHERE id = ?', [avatar, payload.id]);
        } else {
            // Profile update
            await pool.query(
                'UPDATE clientes SET nombre = ?, apellido = ?, telefono = ?, fecha_nac = COALESCE(?, fecha_nac), contacto_preferido = ? WHERE id = ?',
                [
                    nombre ?? payload.nombre,
                    apellido ?? payload.apellido,
                    telefono ?? null,
                    fechaLimpia,
                    contacto_preferido ?? 'email',
                    payload.id,
                ]
            );
        }

        // Re-sign JWT with updated data — preservar sv para no invalidar la sesión.
        const newPayload = {
            id: payload.id,
            nombre: nombre ?? payload.nombre,
            apellido: apellido ?? payload.apellido,
            email: payload.email,
            client_code: payload.client_code,
            avatar: avatar ?? payload.avatar ?? null,
            telefono: avatar ? (payload.telefono ?? null) : (telefono ?? null),
            contacto_preferido: avatar ? (payload.contacto_preferido ?? 'email') : (contacto_preferido ?? 'email'),
            fecha_nac: avatar ? (payload.fecha_nac ?? null) : (fechaLimpia || payload.fecha_nac || null),
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

export async function DELETE() {
    try {
        const payload = await getSession();
        if (!payload?.id) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

        await pool.query('DELETE FROM clientes WHERE id = ?', [payload.id]);

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
