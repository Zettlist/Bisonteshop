import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import pool from '@/lib/db';
import { getSession, bumpSessionVersion } from '@/lib/auth';
import { isStrongPassword } from '@/lib/validate';

const getJwtSecretKey = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function POST(req) {
    try {
        const session = await getSession();
        if (!session?.id) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

        const { currentPassword, newPassword } = await req.json();

        if (!currentPassword || !newPassword)
            return NextResponse.json({ success: false, error: 'Campos requeridos' }, { status: 400 });

        if (!isStrongPassword(newPassword))
            return NextResponse.json({ success: false, error: 'La nueva contraseña debe tener 8-128 caracteres, con al menos una letra y un número.' }, { status: 400 });

        // Get current hashed password
        const [rows] = await pool.query('SELECT password FROM clientes WHERE id = ? LIMIT 1', [session.id]);
        if (!rows.length) return NextResponse.json({ success: false, error: 'Usuario no encontrado' }, { status: 404 });

        const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
        if (!isMatch)
            return NextResponse.json({ success: false, error: 'Contraseña actual incorrecta' }, { status: 400 });

        const hashed = await bcrypt.hash(newPassword, 12);
        await pool.query('UPDATE clientes SET password = ? WHERE id = ?', [hashed, session.id]);

        // Cambiar contraseña cierra todas las demás sesiones (sube session_version)...
        await bumpSessionVersion(session.id);
        const [[fresh]] = await pool.query('SELECT session_version FROM clientes WHERE id = ?', [session.id]);
        const newSv = fresh?.session_version ?? 1;

        // ...pero re-emite la cookie de ESTE dispositivo para no expulsar a quien hizo el cambio.
        const { iat, exp, ...rest } = session;
        const newToken = await new SignJWT({ ...rest, sv: newSv })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d')
            .sign(getJwtSecretKey());

        const response = NextResponse.json({ success: true });
        response.cookies.set({
            name: 'bisonte_session',
            value: newToken,
            httpOnly: true,
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7,
        });
        return response;
    } catch (e) {
        console.error('change-password error:', e);
        return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
    }
}
