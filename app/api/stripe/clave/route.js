import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * La llave PUBLICA de Stripe, la que el navegador necesita para pintar los
 * campos de la tarjeta.
 *
 * Existe porque la forma normal de Next -- una variable NEXT_PUBLIC_ -- se
 * resuelve cuando se CONSTRUYE la tienda, no cuando corre. Y la construccion
 * pasa en el servidor de Google, donde el archivo de configuracion local no
 * llega a proposito (lleva dentro las contrasenas de la base). Resultado: cada
 * publicacion se armaba sin llave y los campos de la tarjeta no funcionaban en
 * ningun sitio -- ni el carrito, ni la recarga de saldo, ni el apartado.
 *
 * Servida desde aqui, la llave se lee al arrancar el servidor, igual que la
 * llave secreta, y se configura una vez en el panel de Cloud Run.
 *
 * Es publica de verdad: viaja en el HTML de cualquier tienda que cobre con
 * Stripe y sola no autoriza ni un peso. La secreta NO sale nunca de aqui.
 */
export async function GET() {
    const clave = process.env.STRIPE_PUBLISHABLE_KEY
        // En una laptop de desarrollo la llave vive en el archivo local con el
        // nombre de siempre. Se acepta para no tener que apuntarla dos veces.
        || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    if (!clave) {
        console.error('[Stripe] Falta STRIPE_PUBLISHABLE_KEY: el navegador no puede cobrar.');
        return NextResponse.json({ error: 'Cobro no disponible.' }, { status: 503 });
    }

    return NextResponse.json({ clave });
}
