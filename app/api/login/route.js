import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';

const getJwtSecretKey = () => {
    const secret = process.env.JWT_SECRET || 'bisonte_super_secret_key_123!';
    return new TextEncoder().encode(secret);
};

export async function POST(req) {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json(
                { success: false, error: 'Por favor, ingresa correo y contraseña.' },
                { status: 400 }
            );
        }

        // Search for user
        const [users] = await pool.query(
            'SELECT * FROM clientes WHERE email = ? LIMIT 1', [email.toLowerCase()]
        );

        if (users.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Usuario no encontrado.' },
                { status: 404 }
            );
        }

        const user = users[0];

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return NextResponse.json(
                { success: false, error: 'Contraseña incorrecta.' },
                { status: 401 }
            );
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
            client_code: user.client_code
        };

        const token = await new SignJWT(tokenPayload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d') // 1 week
            .sign(getJwtSecretKey());

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
