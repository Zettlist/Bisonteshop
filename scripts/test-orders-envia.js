// Crea 5 pedidos de prueba (sales + sale_items + bisonte_orders) con cotización
// real de Envia sandbox y genera la guía con la MISMA lógica del POS
// (generateEnviaLabel de pos torlan/backend/routes/webOrders.js).
// Ids creados quedan en scripts/test-orders-ids.json para limpiarlos después.
// Uso: node scripts/test-orders-envia.js  (requiere Cloud SQL proxy en 127.0.0.1:3306)
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ENVIA = 'https://api-test.envia.com';
const TOKEN = process.env.ENVIA_BEARER_TOKEN;
const EMPRESA_ID = 122;
const USER_ID = 21;       // primer user de la empresa (mismo fallback que checkout/confirm)
const PRODUCT_ID = 7529;  // producto real con precio 450.00
const PRODUCT_PRICE = 450;

const ORIGIN = {
    name: 'Bisonte Manga', phone: '8110000000', street: 'Delta', number: '172',
    district: 'Viejo Roble', city: 'San Nicolás de los Garza', state: 'NL',
    country: 'MX', postalCode: '66418',
};

// 5 destinos variados, carrier forzado para cubrir los 3 que funcionan en sandbox
const TESTS = [
    { carrier: 'estafeta', addr: { nombre_recibe: 'TEST Pedido 1', telefono: '5511111111', calle: 'Av. Insurgentes Sur', numero_exterior: '300', colonia: 'Roma Norte', cp: '06700', municipio: 'Cuauhtémoc', estado: 'Ciudad de México' } },
    { carrier: 'fedex',    addr: { nombre_recibe: 'TEST Pedido 2', telefono: '3322222222', calle: 'Av. Juárez', numero_exterior: '120', colonia: 'Centro', cp: '44100', municipio: 'Guadalajara', estado: 'Jalisco' } },
    { carrier: 'dhl',      addr: { nombre_recibe: 'TEST Pedido 3', telefono: '9993333333', calle: 'Calle 60', numero_exterior: '450', colonia: 'Centro', cp: '97000', municipio: 'Mérida', estado: 'Yucatán' } },
    { carrier: 'estafeta', addr: { nombre_recibe: 'TEST Pedido 4', telefono: '2224444444', calle: '5 de Mayo', numero_exterior: '88', colonia: 'Centro', cp: '72000', municipio: 'Puebla', estado: 'Puebla' } },
    { carrier: 'fedex',    addr: { nombre_recibe: 'TEST Pedido 5', telefono: '8155555555', calle: 'Av. Universidad', numero_exterior: '601', colonia: 'Anáhuac', cp: '66450', municipio: 'San Nicolás de los Garza', estado: 'Nuevo León' } },
];

const STATE_CODES = {
    'Aguascalientes': 'AG', 'Baja California': 'BC', 'Baja California Sur': 'BS',
    'Campeche': 'CM', 'Chiapas': 'CS', 'Chihuahua': 'CH', 'Ciudad de México': 'CX',
    'Coahuila': 'CO', 'Colima': 'CL', 'Durango': 'DG', 'Guanajuato': 'GT',
    'Guerrero': 'GR', 'Hidalgo': 'HG', 'Jalisco': 'JA', 'Estado de México': 'EM',
    'Michoacán': 'MC', 'Morelos': 'MO', 'Nayarit': 'NA', 'Nuevo León': 'NL',
    'Oaxaca': 'OA', 'Puebla': 'PU', 'Querétaro': 'QT', 'Quintana Roo': 'QR',
    'San Luis Potosí': 'SL', 'Sinaloa': 'SI', 'Sonora': 'SO', 'Tabasco': 'TB',
    'Tamaulipas': 'TM', 'Tlaxcala': 'TL', 'Veracruz': 'VE', 'Yucatán': 'YU',
    'Zacatecas': 'ZA',
};

const PKG = { length: 23, width: 32, height: 1, weight: 0.25 };
const packages = [{
    type: 'box', content: 'Manga', amount: 1, declaredValue: 200,
    lengthUnit: 'CM', weightUnit: 'KG', weight: PKG.weight,
    dimensions: { length: PKG.length, width: PKG.width, height: PKG.height },
}];

async function enviaPost(pathName, body) {
    const res = await fetch(`${ENVIA}${pathName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { parseError: text.slice(0, 200) }; }
}

// Réplica exacta de generateEnviaLabel del POS (payload de guía)
async function generarGuia(quote, address) {
    const rawSt = (address.estado || '').trim().normalize('NFC').toLowerCase();
    let stateCode = 'CX';
    for (const [k, v] of Object.entries(STATE_CODES)) {
        if (k.normalize('NFC').toLowerCase() === rawSt) { stateCode = v; break; }
    }
    const branchCode = quote.raw?.branches?.[0]?.branch_code || 'MTY04';
    const body = {
        origin: { ...ORIGIN, branchCode },
        destination: {
            name: address.nombre_recibe || 'Cliente',
            phone: (address.telefono || '0000000000').replace(/\D/g, '').slice(0, 10),
            street: address.calle || '',
            number: address.numero_exterior || 'S/N',
            district: address.colonia || '',
            city: address.municipio || '',
            state: stateCode,
            country: 'MX',
            postalCode: String(address.cp || '').trim(),
        },
        packages,
        shipment: { type: 1, carrier: quote.carrier, service: quote.service },
        settings: { printFormat: 'PDF', printSize: 'PAPER_7X4.75' },
    };
    const data = await enviaPost('/ship/generate/', body);
    if (data.error || !data.data) throw new Error(JSON.stringify(data.error || data).slice(0, 200));
    const label = Array.isArray(data.data) ? data.data[0] : data.data;
    return { label, tracking: label.trackingNumber || label.tracking_number || label.guia || '' };
}

(async () => {
    if (!TOKEN) throw new Error('ENVIA_BEARER_TOKEN no configurado');
    const c = await mysql.createConnection({
        host: '127.0.0.1',
        user: process.env.DB_USER || 'torlan_user',
        password: process.env.DB_PASSWORD,
        database: 'torlan_pos',
    });

    const creados = [];
    for (const [i, t] of TESTS.entries()) {
        const n = i + 1;
        try {
            // 1. Cotizar (mismo flujo que /api/shipping/quote)
            const stateCode = Object.entries(STATE_CODES).find(([k]) => k === t.addr.estado)?.[1] || 'CX';
            const dest = {
                name: t.addr.nombre_recibe, phone: t.addr.telefono,
                street: `${t.addr.calle} ${t.addr.numero_exterior}`,
                district: t.addr.colonia, city: t.addr.municipio,
                state: stateCode, country: 'MX', postalCode: t.addr.cp,
            };
            const rate = await enviaPost('/ship/rate/', { origin: ORIGIN, destination: dest, packages, shipment: { type: 1, carrier: t.carrier } });
            if (!rate.data?.length) { console.log(`#${n} ${t.carrier} → SIN COTIZACIÓN:`, JSON.stringify(rate).slice(0, 150)); continue; }
            const best = [...rate.data].sort((a, b) => a.totalPrice - b.totalPrice)[0];
            const quote = {
                type: 'envia', carrier: best.carrier, service: best.service,
                name: best.carrier, price: Math.ceil(best.totalPrice),
                deliveryEstimate: best.deliveryEstimate || null, raw: best, pkg: PKG,
            };

            // 2. Insertar pedido como lo hace checkout/confirm (pendiente)
            const subtotal = PRODUCT_PRICE;
            const total = subtotal + quote.price;
            const [saleRes] = await c.query(
                `INSERT INTO sales (empresa_id, user_id, cliente_id, subtotal, discount, surcharge, total, payment_method, web_status, shipping_method, envia_quote_data, shipping_address_json, created_at)
                 VALUES (?, ?, NULL, ?, 0, ?, ?, 'card', 'pendiente', 'envia', ?, ?, NOW())`,
                [EMPRESA_ID, USER_ID, subtotal, quote.price, total, JSON.stringify(quote), JSON.stringify(t.addr)]
            );
            const saleId = saleRes.insertId;
            await c.query(`INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, 1, ?)`, [saleId, PRODUCT_ID, PRODUCT_PRICE]);
            await c.query(
                `INSERT INTO bisonte_orders (sale_id, payment_intent_id, status, cliente_id, items_json) VALUES (?, ?, 'pending', NULL, ?)`,
                [saleId, `TEST-${saleId}`, JSON.stringify([{ id: PRODUCT_ID, quantity: 1, price: PRODUCT_PRICE, title: 'TEST manga' }])]
            );

            // 3. Generar guía (lógica POS) y guardar como lo hace el POS
            const { label, tracking } = await generarGuia(quote, t.addr);
            await c.query(`UPDATE sales SET envia_label_data = ?, tracking_number = ? WHERE id = ?`, [JSON.stringify(label), tracking, saleId]);

            creados.push(saleId);
            console.log(`#${n} pedido ${saleId} → ${best.carrier}/${best.service} $${quote.price} → guía OK, tracking: ${tracking}`);
        } catch (e) {
            console.log(`#${n} ${t.carrier} → FALLA:`, e.message);
        }
    }

    fs.writeFileSync(path.join(__dirname, 'test-orders-ids.json'), JSON.stringify(creados));
    console.log('\nids guardados en scripts/test-orders-ids.json:', creados.join(', '));

    // 4. Verificación final: lo que verá el POS
    if (creados.length) {
        const [rows] = await c.query(
            `SELECT id, web_status, tracking_number, JSON_EXTRACT(envia_quote_data, '$.carrier') AS carrier,
                    CHAR_LENGTH(envia_label_data) AS label_bytes
             FROM sales WHERE id IN (?)`, [creados]
        );
        console.table(rows);
    }
    await c.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
