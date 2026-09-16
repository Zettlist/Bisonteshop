// Cotiza carritos reales contra Envia con la tabla fija de antes y con las
// medidas reales de ahora, y enseña las dos lado a lado.
//
//   ENVIA_SANDBOX_TOKEN=... node scripts/probar-cotizacion.mjs
//
// ── Por que SOLO contra el sandbox ─────────────────────────────────────────
//
// La URL esta escrita a fuego y no se lee de ninguna variable. El archivo de
// credenciales dice que cotizar es gratis; el comentario de la ruta de
// cotizacion dice que un bucle se convierte en "cotizaciones facturadas". No
// se sabe cual de las dos es verdad, y cada carrito aqui son hasta ocho
// llamadas (cuatro paqueterias, dos paquetes). Un script de pruebas no deberia
// poder costar dinero por equivocarse de variable de entorno.
//
// El precio del sandbox no es el de produccion. Lo que esto demuestra es que
// Envia ACEPTA el paquete nuevo y que el precio se mueve con el peso; la
// cifra exacta hay que verla en produccion.
//
// La base se lee con la cuenta de la tienda (bisonte_app), la de verdad: asi
// la prueba tambien comprueba que el permiso sobre product_formats esta puesto.
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { medidasDelCarrito, armarPaquete } from '../lib/paquete.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENVIA_SANDBOX = 'https://api-test.envia.com';
const TOKEN = process.env.ENVIA_SANDBOX_TOKEN;
if (!TOKEN) {
    console.error('Falta ENVIA_SANDBOX_TOKEN (el token de PRUEBAS de Envia).');
    process.exit(1);
}

// La tabla fija que usaba la cotizacion, copiada tal cual de
// app/api/shipping/quote/route.js para poder compararla.
function tablaFija(items) {
    const total = items.reduce((s, i) => s + (i.quantity || 1), 0);
    if (total <= 1) return { length: 23, width: 32, height: 1, weight: 0.25 };
    if (total <= 3) return { length: 23, width: 32, height: 5, weight: 0.60 };
    return { length: 30, width: 40, height: 10, weight: 1.20 };
}

const env = Object.fromEntries(
    readFileSync(join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
);

const ORIGEN = {
    name: 'Bisonte Manga', phone: '8110000000', street: 'Delta 172',
    district: 'Viejo Roble', city: 'San Nicolás de los Garza', state: 'NL',
    country: 'MX', postalCode: '66418',
};
// Una avenida publica, no la direccion de nadie.
const DESTINO = {
    name: 'Prueba', phone: '5500000000', street: 'Paseo de la Reforma 222',
    district: 'Juárez', city: 'Cuauhtémoc', state: 'CX',
    country: 'MX', postalCode: '06600',
};
const PAQUETERIAS = ['fedex', 'estafeta', 'dhl', 'paquetexpress'];

async function masBarato(pkg) {
    const precios = [];
    for (const carrier of PAQUETERIAS) {
        try {
            const res = await fetch(`${ENVIA_SANDBOX}/ship/rate/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
                body: JSON.stringify({
                    origin: ORIGEN, destination: DESTINO,
                    packages: [{
                        type: 'box', content: 'Manga', amount: 1, declaredValue: 200,
                        lengthUnit: 'CM', weightUnit: 'KG', weight: pkg.weight,
                        dimensions: { length: pkg.length, width: pkg.width, height: pkg.height },
                    }],
                    shipment: { type: 1, carrier },
                }),
            });
            const data = await res.json();
            for (const s of data.data || []) {
                if (Number(s.totalPrice) > 0) precios.push({ carrier, precio: Number(s.totalPrice) });
            }
        } catch { /* una paqueteria caida no invalida la prueba */ }
    }
    precios.sort((a, b) => a.precio - b.precio);
    return precios[0] || null;
}

const CARRITOS = [
    ['1 Tankobon (Jojolands)',            [{ id: 24, quantity: 1 }]],
    ['1 Shonen Jump',                     [{ id: 12, quantity: 1 }]],
    ['1 Monthly Comic Alive',             [{ id: 16, quantity: 1 }]],
    ['4 Shonen Jump',                     [{ id: 12, quantity: 4 }]],
    ['3 Tankobon',                        [{ id: 24, quantity: 3 }]],
    ['2 Tankobon + 1 Ultra Jump',         [{ id: 24, quantity: 2 }, { id: 15, quantity: 1 }]],
    ['1 doujinshi B5 (sin peso)',         [{ id: 1, quantity: 1 }]],
    ['1 Blue Lock (medidas en JSON)',     [{ id: 23, quantity: 1 }]],
    ['1 Akane (0.3 cm de grosor)',        [{ id: 29, quantity: 1 }]],
    ['2 Comic Alive + 3 SJ + 5 Tankobon', [{ id: 16, quantity: 2 }, { id: 12, quantity: 3 }, { id: 24, quantity: 5 }]],
];

const db = await mysql.createConnection({
    host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
    password: env.DB_PASSWORD, database: env.DB_NAME,
});

const filas = [];
let i = 0;
for (const [nombre, items] of CARRITOS) {
    i++;
    const renglones = await medidasDelCarrito(db, items);
    const antes = tablaFija(items);
    const ahora = armarPaquete(renglones);
    const fuentes = [...new Set(renglones.map((r) => r.medidas.fuente))].join('+');

    const [pa, pn] = [await masBarato(antes), await masBarato(ahora)];
    filas.push({
        '#': i,
        carrito: nombre,
        fuente: fuentes,
        'antes kg': antes.weight,
        'ahora kg': ahora.weight,
        'ahora cm': `${ahora.length}x${ahora.width}x${ahora.height}`,
        'antes $': pa ? pa.precio.toFixed(2) : 'sin tarifa',
        'ahora $': pn ? `${pn.precio.toFixed(2)} ${pn.carrier}` : 'sin tarifa',
        'acepta': pn ? 'si' : 'NO',
    });
    process.stdout.write(`  cotizado ${i}/10\r`);
}
await db.end();

console.log('\n');
console.table(filas);
const aceptados = filas.filter((f) => f.acepta === 'si').length;
console.log(`\n  Envia acepto el paquete nuevo en ${aceptados} de ${filas.length} carritos.`);
console.log('  Precios del SANDBOX: sirven para ver la direccion, no la cifra de produccion.\n');
