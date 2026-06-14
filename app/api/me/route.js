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

        if (!avatar && nombre === undefined && telefono === undefined) {
            return NextResponse.json({ success: false, error: 'Sin datos' }, { status: 400 });
        }

        // Ensure extra columns exist (IF NOT EXISTS not supported in older MySQL)
        const addCol = async (col, def) => {
            try { await pool.query(`ALTER TABLE clientes ADD COLUMN ${col} ${def}`); }
            catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        };
        await addCol('avatar', 'VARCHAR(500) NULL');
        await addCol('telefono', 'VARCHAR(30) NULL');
        await addCol('contacto_preferido', "VARCHAR(20) NULL DEFAULT 'email'");

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
