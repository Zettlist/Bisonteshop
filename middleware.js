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


// ── Content-Security-Policy ─────────────────────────────────────────────────
//
// Es la lista de invitados de la pagina: el navegador solo ejecuta scripts de
// los origenes que aparecen aqui. Es la ultima defensa si alguien consigue
// colar codigo en la tienda -- por el nombre de un producto, una opinion, una
// URL manipulada.
//
// Vive en el middleware y no en next.config.js porque cada respuesta lleva su
// propio `nonce`, un numero al azar que solo vale para esa visita. Antes la
// cabecera decia `'unsafe-inline'`, que significa "ejecuta tambien cualquier
// script escrito dentro del HTML" -- y un script inyectado por un atacante es
// EXACTAMENTE eso. La lista tenia una puerta que dejaba pasar justo a quien
// venia a bloquear. Con el nonce, un script inline solo corre si lleva el
// numero de esta respuesta, que el atacante no puede adivinar.
//
// Detalle del estandar que hace que esto funcione: en cuanto script-src lleva
// un nonce, los navegadores IGNORAN `'unsafe-inline'` aunque siga escrito. Aqui
// se ha quitado igualmente, para que la cabecera diga lo que hace.
//
// `'unsafe-eval'` se queda SOLO en desarrollo: lo necesita el recargado en
// caliente de Next. En produccion no hace falta y no esta.
//
// `style-src` conserva `'unsafe-inline'` a proposito. Next y el widget de
// Google inyectan estilos sueltos, y quitarlo dejaria la tienda sin maquetar.
// Un estilo inyectado puede afear o tapar cosas; no puede leer una sesion ni
// llamar a un servidor, que es de lo que va todo lo de arriba.
const DEV = process.env.NODE_ENV !== 'production';

function construirCsp(nonce) {
    return [
        "default-src 'self'",
        // accounts.google.com estaba SIN declarar y el boton de "Entrar con
        // Google" carga su script de ahi: la CSP lo bloqueaba en silencio. No
        // se notaba porque el boton solo se pinta si hay client id configurado.
        `script-src 'self' 'nonce-${nonce}'${DEV ? " 'unsafe-eval'" : ''} https://js.stripe.com https://m.stripe.network https://www.googletagmanager.com https://accounts.google.com`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' https://api.stripe.com https://m.stripe.network https://open.er-api.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://accounts.google.com",
        // El de Google entra por lo mismo: su boton se dibuja en un iframe suyo.
        "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://accounts.google.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
    ].join('; ');
}

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

// ── Las dos puertas ─────────────────────────────────────────────────────────
//
// A la tienda se llega por dos sitios: bisontemanga.com, que pasa por Firebase
// Hosting, y la URL *.run.app del servicio, que llega directa a Cloud Run.
//
// Cerrar la segunda desde la configuracion de Cloud Run no se puede: se probo
// poner el ingress en `internal-and-cloud-load-balancing` y Firebase dejo de
// alcanzar el servicio — su reescritura viaja por la misma puerta publica que
// cualquiera. Asi que la puerta se cierra aqui, mirando el `Host` con el que
// llega la peticion: Firebase reenvia el dominio original, y quien va directo
// al servicio trae el `run.app`.
//
// Importa por dos motivos. Uno, que por ese camino no se aplican las cabeceras
// de firebase.json (los `no-store`). Y dos, que son distinto numero de saltos,
// asi que la IP del cliente esta en otra posicion de x-forwarded-for y los
// frenos por ritmo se calibran mal para uno de los dos.
//
// Se enciende con SOLO_DOMINIO_PUBLICO=1, y viene apagado: primero hay que
// confirmar con LOG_XFF que el `Host` es el que se supone. Encenderlo antes de
// comprobarlo puede dejar la tienda contestando 404 a todo el mundo.
const SOLO_DOMINIO_PUBLICO = process.env.SOLO_DOMINIO_PUBLICO === '1';
const DIAGNOSTICO = process.env.LOG_XFF === '1';

export async function middleware(request) {
    const { pathname, searchParams } = request.nextUrl;

    // Diagnostico temporal. Con LOG_XFF=1 cada peticion deja una linea con la
    // cadena de x-forwarded-for entera y el host: es lo que dice que valor debe
    // llevar TRUSTED_PROXY_HOPS y si el bloqueo por dominio va a funcionar. Se
    // apaga en cuanto se lean las dos lineas (una por cada puerta).
    if (DIAGNOSTICO) {
        console.log('[puerta] host=%s xfh=%s xff=[%s] ruta=%s',
            request.headers.get('host'),
            request.headers.get('x-forwarded-host') || '(ninguno)',
            request.headers.get('x-forwarded-for') || '(ninguno)',
            pathname);
    }

    // El webhook de Stripe se comprueba mas abajo y no pasa por aqui: Stripe
    // llama a la URL que tenga configurada, y hoy es la del servicio.
    if (SOLO_DOMINIO_PUBLICO && pathname !== '/api/stripe/webhook') {
        const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase();
        if (host.endsWith('.run.app')) {
            return new NextResponse(null, { status: 404 });
        }
    }

    // Un nonce por respuesta. Viaja en dos sitios: en la cabecera de la
    // respuesta (para el navegador) y en una cabecera de la PETICION, que es de
    // donde Next lo saca para ponerselo a sus propios scripts.
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const csp = construirCsp(nonce);
    const cabecerasPeticion = new Headers(request.headers);
    cabecerasPeticion.set('x-nonce', nonce);
    cabecerasPeticion.set('Content-Security-Policy', csp);
    const seguir = () => {
        const res = NextResponse.next({ request: { headers: cabecerasPeticion } });
        res.headers.set('Content-Security-Policy', csp);
        return res;
    };

    // El webhook de Stripe NO pasa por el gate de mantenimiento. Es una llamada
    // de servidor a servidor con su propia firma, no una visita a la tienda: si
    // le contestamos 503, Stripe reintenta un rato y acaba rindiendose, y con
    // ello se pierden los abonos de saldo que esta ruta existe para rescatar.
    if (pathname === '/api/stripe/webhook') return NextResponse.next();   // sin CSP: no es una pagina

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
                    'Content-Security-Policy': csp,
                },
            });
        }
        // autorizado → cae al flujo normal de abajo
    }

    // ── Auth de páginas privadas (/perfil) ──────────────────────────────────
    const needsAuth = PROTECTED_PATHS.some(
        p => pathname === p || pathname.startsWith(`${p}/`)
    );
    if (!needsAuth) return seguir();

    const token = request.cookies.get('bisonte_session')?.value;
    // Ya no hay pagina /login: se entra por el modal de la barra. Se manda a la
    // home con ?login=1 para que el modal se abra solo.
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('login', '1');
    loginUrl.searchParams.set('redirect', pathname);

    if (!token) return NextResponse.redirect(loginUrl);

    try {
        await jwtVerify(token, getJwtSecretKey());
        return seguir();
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
