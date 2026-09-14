/**
 * La IP del cliente, para los frenos por ritmo.
 *
 * Todas las rutas hacian esto:
 *
 *     req.headers.get('x-forwarded-for')?.split(',')[0]
 *
 * y eso es justo la parte que el cliente escribe. `X-Forwarded-For` es una
 * lista que va creciendo por la DERECHA: cada proxy AÑADE al final la IP de
 * quien le hablo. Si la peticion llega ya con una cabecera puesta, Google no la
 * borra — la conserva y añade la suya detras. Asi que el primer elemento es lo
 * que dijo el navegador, no lo que vio nadie.
 *
 * Consecuencia: mandando `X-Forwarded-For: 1.2.3.4` distinto en cada peticion,
 * cada intento cae en un contador nuevo y TODOS los frenos por IP de la tienda
 * — el de fuerza bruta del login, el del formulario de contacto, el de altas —
 * dejaban de existir. No hay que ser nadie para hacerlo: es una cabecera.
 *
 * Lo unico de la lista en lo que se puede confiar es el final, porque ahi solo
 * escribe la infraestructura. `HOPS` dice cuantos escalones de esos hay entre
 * el cliente y nosotros; con Cloud Run directo es uno (la cabecera acaba en
 * `..., <ip real>, <frontend de Google>`), y con algo mas delante — Firebase
 * Hosting, un balanceador — es uno mas por cada capa.
 *
 * Se puede ajustar sin desplegar codigo con TRUSTED_PROXY_HOPS, y hace falta
 * hacerlo: la tienda tiene DOS entradas. Por el dominio publico la peticion
 * pasa por Firebase Hosting antes de llegar a Cloud Run (un escalon mas); por
 * la URL *.run.app llega directa (un escalon). El numero correcto no es el
 * mismo por los dos caminos.
 *
 * Para averiguarlo sin adivinar: poner LOG_XFF=1 en Cloud Run, cargar la tienda
 * una vez desde el dominio publico y leer la linea `[xff]` en los registros.
 * Dice la cadena entera y que IP se esta eligiendo; si la elegida no es la de
 * quien navega, TRUSTED_PROXY_HOPS sube de uno en uno hasta que coincida.
 * Despues se quita LOG_XFF.
 *
 * Si el numero se queda corto, el freno agrupa a mas gente de la cuenta y
 * estorba; si se pasa, vuelve a contar lo que dice el cliente. Por eso los
 * frenos que pueden, ademas de la IP, llevan una segunda clave que NO se puede
 * falsificar: el correo al que se manda, la cuenta que pide el cambio. Esa es
 * la que de verdad protege una cuenta concreta.
 */

const HOPS = Math.max(0, Math.min(Number(process.env.TRUSTED_PROXY_HOPS ?? 1), 5));

const DIAGNOSTICO = process.env.LOG_XFF === '1';

export function ipCliente(request) {
    const bruto = request.headers?.get?.('x-forwarded-for');
    if (bruto) {
        const partes = bruto.split(',').map(p => p.trim()).filter(Boolean);
        if (DIAGNOSTICO) {
            const i = partes.length - 1 - HOPS;
            console.log(`[xff] cadena=[${partes.join(' , ')}] saltos=${HOPS} elegida=${i >= 0 ? partes[i] : '(cadena entera)'}`);
        }
        // Contando desde el final: el ultimo lo escribio el proxy mas cercano,
        // el anterior el de antes, y asi. La IP real esta HOPS posiciones antes
        // del final.
        const i = partes.length - 1 - HOPS;
        if (i >= 0) return partes[i];
        // Menos escalones de los esperados: es una peticion que no vino por el
        // camino normal (una prueba local, un healthcheck). Se usa la cadena
        // entera como clave — agrupa, pero no deja el contador vacio.
        return partes.join('|');
    }
    return request.headers?.get?.('x-real-ip') || 'desconocida';
}
