import { NextResponse } from 'next/server';
import { priceCart, huellaCarrito } from '@/lib/pricing';
import { firmarEnvio, huellaDestino } from '@/lib/envioFirmado';
import { rateLimit } from '@/lib/rateLimit';
import { ipCliente } from '@/lib/ipCliente';
import pool from '@/lib/db';
import { medidasDelCarrito, armarPaquete } from '@/lib/paquete';

export const dynamic = 'force-dynamic';

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

function getStateCode(estado) {
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

export async function POST(request) {
  try {
    // Cada llamada dispara CUATRO peticiones a Envia, que es un servicio de
    // pago. Sin sesion y sin freno, esta ruta era el amplificador mas barato de
    // la tienda: un bucle desde una laptop se convierte en miles de
    // cotizaciones facturadas, y en que Envia nos corte por abuso justo cuando
    // un cliente de verdad quiere pagar. No se exige sesion a proposito — se
    // cotiza antes de entrar — asi que el freno va por IP.
    const ip = ipCliente(request);
    const { allowed, retryAfter } = rateLimit(`cotizar-envio:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: `Demasiadas cotizaciones seguidas. Espera ${retryAfter} segundos.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const { items, destination } = await request.json();

    if (!items?.length || !destination?.cp || !destination?.estado) {
      return NextResponse.json({ success: false, error: 'Datos insuficientes' }, { status: 400 });
    }

    const stateCode = getStateCode(destination.estado);
    // El paquete con lo que pesa y mide de verdad cada articulo. Si la base
    // falla (un permiso que se pierde, la conexion caida) se cae a la tabla
    // fija en vez de tumbar el checkout entero: cotizar mal cuesta margen,
    // no cotizar cuesta la venta. Queda en el log para que no pase en silencio.
    let pkg;
    try {
      pkg = armarPaquete(await medidasDelCarrito(pool, items));
    } catch (err) {
      console.error('[ShippingQuote] Sin medidas reales, se cotiza con la tabla fija:', err?.message || err);
      pkg = getPackaging(items);
    }

    const origin = ORIGIN;

    const dest = {
      name: destination.nombre_recibe || 'Cliente',
      phone: (destination.telefono || '0000000000').replace(/\D/g, '').slice(0, 10),
      street: `${destination.calle} ${destination.numero_exterior || ''}`.trim(),
      district: destination.colonia || '',
      city: destination.municipio || '',
      state: stateCode,
      country: 'MX',
      postalCode: String(destination.cp).trim(),
    };

    const results = await Promise.all(
      CARRIERS.map(c => rateCarrier(origin, dest, pkg, c))
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

    if (!unicos.length) {
      return NextResponse.json({ success: false, error: 'No hay opciones de paquetería disponibles para este destino.' }, { status: 200 });
    }

    // Cada opcion sale firmada. El `vale` es lo que /api/checkout acepta como
    // costo de envio; el `price` de al lado es solo para pintarlo en pantalla.
    //
    // La huella se calcula sobre `lines` y no sobre el `items` crudo para que
    // sea LA MISMA que compara /api/checkout: alli el carrito pasa por
    // priceCart antes de nada, y dos normalizaciones distintas del mismo
    // carrito darian huellas distintas y tumbarian pedidos buenos.
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

    return NextResponse.json({ success: true, carriers });
  } catch (err) {
    console.error('[ShippingQuote]', err);
    return NextResponse.json({ success: false, error: 'No pudimos cotizar el envío. Intenta de nuevo.' }, { status: 500 });
  }
}
