import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession } from '@/lib/auth';

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
        if (fecha_nac) {
            const nac = new Date(fecha_nac);
            if (Number.isNaN(nac.getTime())) {
                return NextResponse.json({ success: false, error: 'Fecha de nacimiento inválida.' }, { status: 400 });
            }
            const hoy = new Date();
            const edad = hoy.getFullYear() - nac.getFullYear()
                - (hoy < new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate()) ? 1 : 0);
            if (edad < 18) {
                return NextResponse.json(
                    { success: false, error: 'Debes ser mayor de 18 años para comprar.' },
                    { status: 400 }
                );
            }
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
                    fecha_nac || null,
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
            fecha_nac: avatar ? (payload.fecha_nac ?? null) : (fecha_nac || payload.fecha_nac || null),
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
