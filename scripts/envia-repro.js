// Repro: genera guía Envia.com con los datos reales del último pedido sin guía.
// Uso: node scripts/envia-repro.js  (requiere Cloud SQL proxy en 127.0.0.1:3306)
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Cargar .env.local (sin dotenv)
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const STATE_CODES_ENVIA = {
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

(async () => {
    const c = await mysql.createConnection({
        host: '127.0.0.1',
        user: process.env.DB_USER || 'torlan_user',
        password: process.env.DB_PASSWORD,
        database: 'torlan_pos',
    });
    const [rows] = await c.query(
        `SELECT id, web_status, envia_quote_data, shipping_address_json, tracking_number
         FROM sales WHERE shipping_method='envia' AND (envia_label_data IS NULL OR envia_label_data='')
         ORDER BY id DESC LIMIT 3`
    );
    await c.end();
    if (!rows.length) { console.log('sin pedidos envia sin guía'); return; }
    for (const r of rows) console.log('candidato:', r.id, r.web_status);
    const order = rows[0];
    const quote = typeof order.envia_quote_data === 'string' ? JSON.parse(order.envia_quote_data) : (order.envia_quote_data || {});
    const address = typeof order.shipping_address_json === 'string' ? JSON.parse(order.shipping_address_json) : (order.shipping_address_json || {});
    console.log('\n--- pedido #' + order.id);
    console.log('quote keys:', Object.keys(quote));
    console.log('carrier:', quote.carrier, '| service:', quote.service, '| raw.service:', quote.raw && quote.raw.service);
    console.log('pkg:', JSON.stringify(quote.pkg));
    console.log('raw.branches:', JSON.stringify(quote.raw && quote.raw.branches));
    console.log('address:', JSON.stringify({ ...address, telefono: '***' }));

    const rawSt = (address.estado || '').trim().normalize('NFC').toLowerCase();
    let stateCode = 'CX';
    for (const [k, v] of Object.entries(STATE_CODES_ENVIA)) {
        if (k.normalize('NFC').toLowerCase() === rawSt) { stateCode = v; break; }
    }
    if ((address.estado || '').length <= 3 && address.estado) stateCode = address.estado;
    const pkg = quote.pkg || { length: 23, width: 32, height: 1, weight: 0.25 };
    const branchCode = (quote.raw && quote.raw.branches && quote.raw.branches[0] && quote.raw.branches[0].branch_code) || 'MTY04';

    const body = {
        origin: {
            name: 'Bisonte Manga', phone: '8110000000', street: 'Delta', number: '172',
            district: 'Viejo Roble', city: 'San Nicolás de los Garza', state: 'NL',
            country: 'MX', postalCode: '66418', branchCode,
        },
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
        packages: [{
            type: 'box', content: 'Manga', amount: 1, declaredValue: 200,
            lengthUnit: 'CM', weightUnit: 'KG', weight: pkg.weight,
            dimensions: { length: pkg.length, width: pkg.width, height: pkg.height },
        }],
        shipment: { type: 1, carrier: quote.carrier || 'estafeta', service: quote.service || (quote.raw && quote.raw.service) },
        settings: { printFormat: 'PDF', printSize: 'PAPER_7X4.75' },
    };
    console.log('\n--- payload (tel oculto):');
    console.log(JSON.stringify({ ...body, destination: { ...body.destination, phone: '***' } }, null, 1));

    const res = await fetch('https://api-test.envia.com/ship/generate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ENVIA_BEARER_TOKEN}` },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log('\n--- Envia status:', res.status);
    console.log(text.slice(0, 1500));
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
