import { priceCart, huellaCarrito } from '@/lib/pricing';
import { firmarEnvio, huellaDestino } from '@/lib/envioFirmado';
import pool from '@/lib/db';
import { medidasDelCarrito, armarPaquete } from '@/lib/paquete';

// ─────────────────────────────────────────────────────────────────────────────
// Cuanto cuesta mandar un paquete, preguntado a Envia y firmado por nosotros.
//
// Esto vivia dentro de /api/shipping/quote. Se saco aqui cuando el envio dejo
// de ser solo del carrito: un apartado ya pagado tambien se manda, y el precio
// tiene que salir de la MISMA cuenta -- el mismo empaque, las mismas
// paqueterias y, sobre todo, el mismo vale firmado. Dos copias de esto serian
// dos formas de cotizar el mismo paquete, y la que se quedara atras cobraria
// de menos.
//
// Quien llama decide quien puede pedir una cotizacion (sesion, freno por IP) y
// que mercancia se cotiza. Aqui solo se pone precio a una caja.
// ─────────────────────────────────────────────────────────────────────────────

// Producción: ENVIA_API_URL=https://api.envia.com (con token de producción).
// Sin la variable, usa el sandbox de pruebas.
const ENVIA_URL = process.env.ENVIA_API_URL || 'https://api-test.envia.com';

// Dirección de origen (bodega) configurable por entorno
const ORIGIN = {
    name: process.env.SHIP_ORIGIN_NAME || 'Bisonte Manga',
    phone: process.env.SHIP_ORIGIN_PHONE || '8110000000',
    street: process.env.SHIP_ORIGIN_STREET || 'Delta 172',
    district: process.env.SHIP_ORIGIN_DISTRICT || 'Viejo Roble',
    city: process.env.SHIP_ORIGIN_CITY || 'San Nicolás de los Garza',
    state: process.env.SHIP_ORIGIN_STATE || 'NL',
    country: 'MX',
    postalCode: process.env.SHIP_ORIGIN_CP || '66418',
};

// Paqueterías a cotizar (coma-separadas en env para activar/desactivar sin deploy de código)
const CARRIERS = (process.env.ENVIA_CARRIERS || 'fedex,estafeta,dhl,paquetexpress')
    .split(',').map(c => c.trim()).filter(Boolean);

const STATE_CODES = {
    'Aguascalientes': 'AG', 'Baja California': 'BC', 'Baja California Sur': 'BS',
    'Campeche': 'CM', 'Chiapas': 'CS', 'Chihuahua': 'CH',
    'Ciudad de México': 'CX',
    'Coahuila': 'CO', 'Colima': 'CL', 'Durango': 'DG', 'Guanajuato': 'GT',
    'Guerrero': 'GR', 'Hidalgo': 'HG', 'Jalisco': 'JA',
    'Estado de México': 'EM',
    'Michoacán': 'MC', 'Morelos': 'MO', 'Nayarit': 'NA',
    'Nuevo León': 'NL',
    'Oaxaca': 'OA', 'Puebla': 'PU',
    'Querétaro': 'QT', 'Quintana Roo': 'QR',
    'San Luis Potosí': 'SL', 'Sinaloa': 'SI', 'Sonora': 'SO', 'Tabasco': 'TB',
    'Tamaulipas': 'TM', 'Tlaxcala': 'TL', 'Veracruz': 'VE',
    'Yucatán': 'YU', 'Zacatecas': 'ZA',
};

export function getStateCode(estado) {
    const s = (estado || '').trim().normalize('NFC');
    const direct = STATE_CODES[s];
    if (direct) return direct;
    // fallback: case-insensitive normalized lookup
    const sLower = s.toLowerCase();
    for (const [k, v] of Object.entries(STATE_CODES)) {
        if (k.normalize('NFC').toLowerCase() === sLower) return v;
    }
    return s.length <= 3 ? s : 'CX'; // if already a short code, use it; else default
}

// La tabla fija de antes. Ya no es como se cotiza (ver lib/paquete.mjs): queda
// solo como red, si la base no contesta. Con ella se cotiza mal, pero se
// cotiza -- y sin cotizacion nadie puede terminar una compra.
function getPackaging(items) {
    const total = items.reduce((s, i) => s + (i.quantity || 1), 0);
    if (total <= 1) return { length: 23, width: 32, height: 1, weight: 0.25 };
    if (total <= 3) return { length: 23, width: 32, height: 5, weight: 0.60 };
    return { length: 30, width: 40, height: 10, weight: 1.20 };
}

async function rateCarrier(origin, destination, pkg, carrier) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`${ENVIA_URL}/ship/rate/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.ENVIA_BEARER_TOKEN}`,
            },
            body: JSON.stringify({
                origin,
                destination,
                packages: [{
                    type: 'box',
                    content: 'Manga',
                    amount: 1,
                    declaredValue: 200,
                    lengthUnit: 'CM',
                    weightUnit: 'KG',
                    weight: pkg.weight,
                    dimensions: { length: pkg.length, width: pkg.width, height: pkg.height },
                }],
                shipment: { type: 1, carrier },
            }),
            signal: controller.signal,
            cache: 'no-store',
        });
        clearTimeout(timer);
        const data = await res.json();
        if (!data.data?.length) {
            return [];
        }
        // Devuelve TODOS los servicios de la paquetería (ground, express, priority…),
        // ordenados por precio. Antes solo regresaba el más barato → 1 sola opción.
        return [...data.data].sort((a, b) => a.totalPrice - b.totalPrice);
    } catch (err) {
        console.error(`[rateCarrier:${carrier}] Error:`, err?.message || String(err));
        return [];
    }
}

// Máximo de servicios por paquetería (evita listas eternas si una devuelve 6+)
const MAX_PER_CARRIER = 3;

/**
 * Las opciones de envio para una mercancia y un destino, cada una con su vale.
 *
 * @param items       [{id, quantity}] — la mercancia que va en la caja. La pone
 *                    el servidor, no el navegador: de ella depende el tamaño
 *                    del paquete y por tanto el precio.
 * @param destination la direccion de entrega ({cp, estado, calle, ...}).
 * @returns {Promise<{carriers: Array}>} vacio si ninguna paqueteria contesta.
 */
export async function cotizarEnvio({ items, destination }) {
    const stateCode = getStateCode(destination.estado);

    // El paquete con lo que pesa y mide de verdad cada articulo. Si la base
    // falla (un permiso que se pierde, la conexion caida) se cae a la tabla
    // fija en vez de tumbar el checkout entero: cotizar mal cuesta margen,
    // no cotizar cuesta la venta. Queda en el log para que no pase en silencio.
    let pkg;
    try {
        pkg = armarPaquete(await medidasDelCarrito(pool, items));
    } catch (err) {
        console.error('[CotizarEnvio] Sin medidas reales, se cotiza con la tabla fija:', err?.message || err);
        pkg = getPackaging(items);
    }

    const dest = {
        name: destination.nombre_recibe || 'Cliente',
        phone: (destination.telefono || '0000000000').replace(/\D/g, '').slice(0, 10),
        street: `${destination.calle} ${destination.numero_exterior || destination.numero_ext || ''}`.trim(),
        district: destination.colonia || '',
        city: destination.municipio || '',
        state: stateCode,
        country: 'MX',
        postalCode: String(destination.cp).trim(),
    };

    const results = await Promise.all(
        CARRIERS.map(c => rateCarrier(ORIGIN, dest, pkg, c))
    );

    // results = array de arrays (servicios por paquetería). Cap por paquetería,
    // luego junta todo y ordena por precio.
    const valid = results
        .flatMap(servicios => (servicios || []).slice(0, MAX_PER_CARRIER))
        .sort((a, b) => a.totalPrice - b.totalPrice);

    // Dedup por paquetería+servicio (Envía a veces repite)
    const seen = new Set();
    const unicos = valid.filter(c => {
        const k = `${c.carrier}-${c.service}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    if (!unicos.length) return { carriers: [] };

    // Cada opcion sale firmada. El `vale` es lo que acepta como costo de envio
    // quien cobra (el checkout, o el envio de un apartado); el `price` de al
    // lado es solo para pintarlo en pantalla.
    //
    // La huella se calcula sobre `lines` y no sobre el `items` crudo para que
    // sea LA MISMA que comparan esas rutas: alli el carrito pasa por priceCart
    // antes de nada, y dos normalizaciones distintas del mismo carrito darian
    // huellas distintas y tumbarian pedidos buenos.
    const { lines } = await priceCart(items);
    const itemsHash = huellaCarrito(lines);
    const destino = huellaDestino(destination);

    const carriers = await Promise.all(unicos.map(async c => {
        const price = Math.ceil(c.totalPrice);
        return {
            type: 'envia',
            carrier: c.carrier,
            service: c.service,
            name: c.carrier.charAt(0).toUpperCase() + c.carrier.slice(1),
            price,
            deliveryEstimate: c.deliveryEstimate || null,
            raw: c,
            pkg,
            vale: await firmarEnvio({ precio: price, carrier: c.carrier, service: c.service, itemsHash, destino }),
        };
    }));

    return { carriers };
}
