import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const getJwtSecretKey = () => new TextEncoder().encode(process.env.JWT_SECRET);

// Páginas que exigen sesión válida. Las APIs ya validan por su cuenta;
// esto es defensa en profundidad para evitar mostrar páginas privadas.
const PROTECTED_PATHS = ['/perfil'];

export async function middleware(request) {
    const { pathname } = request.nextUrl;

    const needsAuth = PROTECTED_PATHS.some(
        p => pathname === p || pathname.startsWith(`${p}/`)
    );
    if (!needsAuth) return NextResponse.next();

    const token = request.cookies.get('bisonte_session')?.value;
    // Ya no hay pagina /login: se entra por el modal de la barra. Se manda a la
    // home con ?login=1 para que el modal se abra solo.
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('login', '1');
    loginUrl.searchParams.set('redirect', pathname);

    if (!token) return NextResponse.redirect(loginUrl);

    try {
        await jwtVerify(token, getJwtSecretKey());
        return NextResponse.next();
    } catch {
        // Token inválido o expirado → a login y limpiar la cookie rota.
        const res = NextResponse.redirect(loginUrl);
        res.cookies.delete('bisonte_session');
        return res;
    }
}

export const config = {
    matcher: ['/perfil/:path*'],
};
