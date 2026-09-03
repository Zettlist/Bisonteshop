import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const getJwtSecretKey = () => new TextEncoder().encode(process.env.JWT_SECRET);

// Páginas que exigen sesión válida. Las APIs ya validan por su cuenta;
// esto es defensa en profundidad para evitar mostrar páginas privadas.
const PROTECTED_PATHS = ['/perfil'];

// ── Modo mantenimiento (tienda "en construcción") ───────────────────────────
//
// Se prende con MAINTENANCE_MODE=1 en el entorno de Cloud Run (toggle sin
// redeploy de código: solo se cambia la variable). Con el modo activo el
// público ve una página de construcción y TODAS las /api responden 503, así
// nadie puede pedir ni pagar mientras trabajamos.
//
// El equipo entra con un pase secreto: visitar cualquier URL con ?pase=TOKEN
// (TOKEN = MAINTENANCE_BYPASS) deja una cookie de 30 días y desbloquea la
// navegación normal para ese navegador.
const MAINTENANCE = process.env.MAINTENANCE_MODE === '1';
const BYPASS = process.env.MAINTENANCE_BYPASS || '';

function maintenanceHtml() {
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bisonte Manga — En construcción</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0a0a0a; color: #f5f5f5;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    text-align: center; padding: 2rem;
  }
  .box { max-width: 30rem; }
  .mark { font-size: 3rem; font-weight: 800; letter-spacing: .04em; }
  .mark span { color: #e63946; }
  h1 { font-size: 1.5rem; margin: 1.2rem 0 .6rem; }
  p { color: #b5b5b5; line-height: 1.6; margin: 0; }
  .bar { margin-top: 1.8rem; height: 4px; border-radius: 4px;
    background: linear-gradient(90deg,#e63946,#0a0a0a); opacity:.7; }
</style>
</head>
<body>
  <div class="box">
    <div class="mark">BISONTE<span>.</span></div>
    <h1>Estamos en construcción 🛠️</h1>
    <p>La tienda está en mantenimiento por unos momentos. Vuelve pronto para tus mangas, figuras y accesorios.</p>
    <div class="bar"></div>
  </div>
</body>
</html>`;
}

export async function middleware(request) {
    const { pathname, searchParams } = request.nextUrl;

    // ── Gate de mantenimiento ───────────────────────────────────────────────
    if (MAINTENANCE) {
        const pase = searchParams.get('pase');
        const cookiePase = request.cookies.get('bisonte_pase')?.value;
        const autorizado = BYPASS && (pase === BYPASS || cookiePase === BYPASS);

        // Pase por query: fija cookie y limpia la URL para no dejar el token a la vista.
        if (pase && BYPASS && pase === BYPASS) {
            const clean = new URL(request.url);
            clean.searchParams.delete('pase');
            const res = NextResponse.redirect(clean);
            res.cookies.set('bisonte_pase', BYPASS, {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                path: '/',
                maxAge: 60 * 60 * 24 * 30,
            });
            return res;
        }

        if (!autorizado) {
            if (pathname.startsWith('/api/')) {
                return NextResponse.json(
                    { error: 'Tienda en mantenimiento. Vuelve pronto.' },
                    { status: 503, headers: { 'Retry-After': '3600' } }
                );
            }
            return new NextResponse(maintenanceHtml(), {
                status: 503,
                headers: {
                    'content-type': 'text/html; charset=utf-8',
                    'Retry-After': '3600',
                    'Cache-Control': 'no-store',
                },
            });
        }
        // autorizado → cae al flujo normal de abajo
    }

    // ── Auth de páginas privadas (/perfil) ──────────────────────────────────
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
    // Corre en todo salvo estáticos de Next, para poder mostrar la página de
    // mantenimiento y bloquear /api. (El favicon/icon quedan fuera para que la
    // pestaña muestre ícono aún en mantenimiento.)
    matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png).*)'],
};
