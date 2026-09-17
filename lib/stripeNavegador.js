'use client';

import { loadStripe } from '@stripe/stripe-js';

/**
 * Stripe para el navegador, con la llave pedida al servidor.
 *
 * Una sola promesa para toda la sesion, y compartida entre las tres pantallas
 * que cobran: el carrito, la recarga de saldo y el apartado. Cada llamada a
 * `loadStripe` baja el script de Stripe otra vez, y abrir dos dialogos no tiene
 * por que costar dos descargas.
 *
 * Se crea al PEDIRLA y no al importar este archivo: si se creara arriba, cargar
 * el menu de la cuenta ya dispararia la peticion en alguien que solo iba a mirar
 * sus pedidos.
 *
 * Ver app/api/stripe/clave/route.js para por que la llave se pide y no se
 * escribe en el codigo.
 */
let promesa = null;

export function stripeDelNavegador() {
    // Durante el pintado en el servidor no hay navegador ni a quien preguntar,
    // y `fetch` con una ruta relativa falla. Se devuelve null: el formulario
    // aparece en cuanto la pagina vive en el navegador.
    if (typeof window === 'undefined') return null;

    if (!promesa) {
        promesa = fetch('/api/stripe/clave')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => (d?.clave ? loadStripe(d.clave) : null))
            .catch(() => null);
    }
    return promesa;
}
