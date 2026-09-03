/**
 * Capa fina sobre gtag (GA4).
 *
 * Todo pasa por aqui en vez de llamar a `window.gtag` suelto por el codigo, por
 * dos razones: si el visitante rechazo las cookies el script no existe y una
 * llamada directa reventaria la pagina, y asi el dia que se cambie de
 * herramienta se toca un archivo y no veinte.
 *
 * Ninguna funcion de aqui lanza. Medir nunca puede tumbar una compra.
 */

export const CLAVE_CONSENTIMIENTO = 'cookies_accepted';
export const EVENTO_CONSENTIMIENTO = 'bisonte:consentimiento';

/** Solo se mide a quien acepto explicitamente. Sin respuesta = no. */
export function hayConsentimiento() {
    if (typeof window === 'undefined') return false;
    try {
        return localStorage.getItem(CLAVE_CONSENTIMIENTO) === '1';
    } catch {
        // Safari en privado puede negar el acceso a localStorage.
        return false;
    }
}

/** Avisa a <Analytics /> del cambio sin recargar la pagina. */
export function avisarConsentimiento(acepto) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMIENTO, { detail: { acepto } }));
}

function enviar(nombre, params = {}) {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    try {
        window.gtag('event', nombre, params);
    } catch (err) {
        console.warn('[analytics]', err.message);
    }
}

/**
 * Producto de la tienda → item de GA4.
 * El precio va siempre en MXN: es la moneda del cobro. El selector de divisa
 * solo cambia lo que se muestra, y mezclar ambas falsearia los importes.
 */
function aItem(producto, cantidad) {
    return {
        item_id: String(producto.id),
        item_name: producto.title || producto.name || 'Sin título',
        item_category: producto.category || undefined,
        item_brand: producto.publisher || undefined,
        price: Number(producto.price) || 0,
        quantity: cantidad ?? producto.quantity ?? 1,
    };
}

const sumar = (items) => items.reduce((t, i) => t + (i.price * i.quantity), 0);

export function verProducto(producto) {
    if (!producto) return;
    const item = aItem(producto, 1);
    enviar('view_item', { currency: 'MXN', value: item.price, items: [item] });
}

export function agregarAlCarrito(producto, cantidad = 1) {
    if (!producto) return;
    const item = aItem(producto, cantidad);
    enviar('add_to_cart', { currency: 'MXN', value: item.price * item.quantity, items: [item] });
}

export function quitarDelCarrito(producto, cantidad = 1) {
    if (!producto) return;
    const item = aItem(producto, cantidad);
    enviar('remove_from_cart', { currency: 'MXN', value: item.price * item.quantity, items: [item] });
}

export function iniciarCheckout(productos = []) {
    if (!productos.length) return;
    const items = productos.map(p => aItem(p));
    enviar('begin_checkout', { currency: 'MXN', value: sumar(items), items });
}

/**
 * @param {object} datos { pedidoId, total, envio, descuento, productos }
 * `pedidoId` es el sale_id: es lo que permite casar un pedido de GA con la
 * venta real en la base cuando los numeros no cuadren.
 */
export function compra({ pedidoId, total, envio = 0, descuento = 0, productos = [] }) {
    enviar('purchase', {
        transaction_id: String(pedidoId ?? ''),
        currency: 'MXN',
        value: Number(total) || 0,
        shipping: Number(envio) || 0,
        // GA4 espera el descuento como positivo.
        coupon: undefined,
        items: productos.map(p => aItem(p)),
        ...(descuento ? { discount: Math.abs(Number(descuento)) } : {}),
    });
}

export function busqueda(termino) {
    if (!termino?.trim()) return;
    enviar('search', { search_term: termino.trim() });
}

/** Vista de pagina manual: en una SPA el script solo cuenta la primera carga. */
export function vistaDePagina(ruta) {
    enviar('page_view', { page_path: ruta, page_location: window.location.href, page_title: document.title });
}
