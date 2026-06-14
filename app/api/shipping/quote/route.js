import { NextResponse } from 'next/server';

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
    const { items, destination } = await request.json();

    if (!items?.length || !destination?.cp || !destination?.estado) {
      return NextResponse.json({ success: false, error: 'Datos insuficientes' }, { status: 400 });
    }

    const stateCode = getStateCode(destination.estado);
    const pkg = getPackaging(items);

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

    const carriers = unicos.map(c => ({
      type: 'envia',
      carrier: c.carrier,
      service: c.service,
      name: c.carrier.charAt(0).toUpperCase() + c.carrier.slice(1),
      price: Math.ceil(c.totalPrice),
      deliveryEstimate: c.deliveryEstimate || null,
      raw: c,
      pkg,
    }));

    return NextResponse.json({ success: true, carriers });
  } catch (err) {
    console.error('[ShippingQuote]', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
