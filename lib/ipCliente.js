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
 * escribe la infraestructura. `HOPS` dice cuantos escalones hay que descontar
 * desde el final para llegar a la IP real.
 *
 * MEDIDO contra produccion el 13/09/2026, golpeando las dos puertas y leyendo
 * la cabecera en los registros:
 *
 *   por bisontemanga.com (Firebase)   xff=[<ip real>]
 *   por la URL *.run.app (directa)    xff=[<ip real>]
 *   con la cabecera falsificada       xff=[<lo que mande yo>, <ip real>]
 *
 * O sea: la cadena no lleva ningun escalon de Google detras, y lo que manda el
 * cliente se queda DELANTE de su IP de verdad. La IP real es siempre el ULTIMO
 * elemento, por las dos puertas. Por eso HOPS vale cero.
 *
 * Y por eso el uno que tenia antes estaba mal: con la cabecera falsificada la
 * cadena pasa a tener dos elementos, descontar uno daba el primero — justo el
 * que escribe el atacante — y el freno seguia esquivandose. Un valor puesto a
 * ojo no vale aqui; hay que mirarlo.
 *
 * Si algun dia se mete un balanceador o un CDN delante, el numero cambia: cada
 * capa que reenvie añade un elemento al final. Se ajusta con
 * TRUSTED_PROXY_HOPS, sin desplegar codigo, y se vuelve a medir igual —
 * LOG_XFF=1 en Cloud Run, una peticion, leer la linea `[puerta]` del
 * middleware, apagarlo.
 *
 * Si el numero se queda corto, el freno agrupa a mas gente de la cuenta y
 * estorba; si se pasa, vuelve a contar lo que dice el cliente. Por eso los
 * frenos que pueden, ademas de la IP, llevan una segunda clave que NO se puede
 * falsificar: el correo al que se manda, la cuenta que pide el cambio. Esa es
 * la que de verdad protege una cuenta concreta.
 */

const HOPS = Math.max(0, Math.min(Number(process.env.TRUSTED_PROXY_HOPS ?? 0), 5));

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
