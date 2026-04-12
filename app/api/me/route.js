import { jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const getJwtSecretKey = () => {
    const secret = process.env.JWT_SECRET || 'bisonte_super_secret_key_123!';
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
