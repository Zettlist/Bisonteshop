import { jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

const getJwtSecretKey = () => {
    const secret = process.env.JWT_SECRET;
    return new TextEncoder().encode(secret);
};

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('bisonte_session')?.value;

        if (!token) {
            return NextResponse.json({ user: null });
        }

        const { payload } = await jwtVerify(token, getJwtSecretKey());

        // Return the user data from the JWT payload
        return NextResponse.json({
            user: {
                id: payload.id,
                nombre: payload.nombre,
                apellido: payload.apellido,
                email: payload.email,
                client_code: payload.client_code,
                avatar: payload.avatar || null,
            }
        });
    } catch {
        // Token invalid or expired
        return NextResponse.json({ user: null });
    }
}

export async function DELETE() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('bisonte_session')?.value;
        if (!token) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

        const { payload } = await jwtVerify(token, getJwtSecretKey());
        if (!payload?.id) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 });

        // Delete user from DB
        await pool.query('DELETE FROM clientes WHERE id = ?', [payload.id]);

        // Clear session cookie
        const response = NextResponse.json({ success: true });
        response.cookies.set('bisonte_session', '', {
            httpOnly: true,
            secure: true,
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
