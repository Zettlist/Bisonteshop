import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { bumpSessionVersion } from '@/lib/auth';

const getJwtSecretKey = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function POST(request) {
    // Revocación real: subir session_version invalida el token aunque alguien lo haya copiado.
    const token = request.cookies.get('bisonte_session')?.value;
    if (token) {
        try {
            const { payload } = await jwtVerify(token, getJwtSecretKey());
            if (payload?.id) await bumpSessionVersion(payload.id);
        } catch {
            // token inválido/expirado: nada que revocar
        }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set({
        name: 'bisonte_session',
        value: '',
        httpOnly: true,
        path: '/',
        maxAge: 0,
    });
    return response;
}
