/**
 * Borra los pedidos de prueba y crea un juego nuevo, variado y completo.
 *
 * Los 61 anteriores salieron de scripts/prueba-credito.mjs, que se saltaba el
 * formulario: sin telefono, sin paqueteria, sin tamaños, todos del mismo
 * cliente con saldo, y algunos en estados imposibles ("pendiente" y
 * "reembolsado" a la vez). Servian para probar el saldo y para nada mas.
 *
 * Estos se escriben como los deja la tienda de verdad:
 *   · el cobro es un PaymentIntent REAL de Stripe en modo prueba, autorizado y
 *     sin capturar -- asi "Confirmar existencia" en el POS lo puede cobrar, y
 *     "Cancelar" lo puede soltar, igual que con un cliente
 *   · la paqueteria sale de una cotizacion REAL del sandbox de Envia, con el
 *     paquete armado por lib/paquete.mjs, que es lo que usa el checkout
 *   · las piezas quedan apartadas (stock_reservado) mientras el pedido espera,
 *     y descontadas (stock) cuando ya se confirmo
 *   · lo que ya salio del local se mueve con backend/tools/simulador-envio.mjs,
 *     el mismo traductor que usa el rastreo de verdad
 *
 * Solo usa productos marcados `es_prueba`: ni aparta ni descuenta inventario real.
 *
 * Por que no pasa por /api/checkout: la tienda rechaza a proposito los
 * productos de prueba (lib/pricing.js), para que nadie pueda comprarlos.
 *
 * ── Como correrlo ───────────────────────────────────────────────────────────
 *
 *   Con el tunel a la base abierto (puerto 3307), desde Bisonteshop/:
 *
 *     DB_MIGRADOR_USER=...  DB_MIGRADOR_PASSWORD=...  (torlan_user)
 *     STRIPE_SECRET_KEY=... (la MISMA que usa la tienda publicada: el POS cobra
 *                            a traves de ella, y un PaymentIntent de otra
 *                            cuenta no lo encuentra)
 *     node scripts/pedidos-de-prueba.mjs
 *
 *   El token del sandbox de Envia: ENVIA_SANDBOX_TOKEN, o si no el de TorlanPOS/backend/.env.
 *   Se niega a correr con una llave de Stripe que no sea sk_test_.
 */
import Stripe from 'stripe';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { armarPaquete, medidasDelCarrito } from '../lib/paquete.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const POS_BACKEND = path.resolve(aqui, '../../TorlanPOS/backend');

// ── Frenos ──────────────────────────────────────────────────────────────────
const LLAVE = process.env.STRIPE_SECRET_KEY || '';
if (!LLAVE.startsWith('sk_test_')) {
    console.error('STRIPE_SECRET_KEY tiene que ser de PRUEBA (sk_test_). Esto crea cobros.');
    process.exit(1);
}
const envPos = Object.fromEntries(
    fs.readFileSync(path.join(POS_BACKEND, '.env'), 'utf8').split(/\r?\n/)
        .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
if (envPos.ENVIA_API_URL && !envPos.ENVIA_API_URL.includes('api-test')) {
    console.error('El token de Envia del POS no es el del sandbox. No se cotiza contra produccion.');
    process.exit(1);
}
const ENVIA_SANDBOX = 'https://api-test.envia.com';

const stripe = new Stripe(LLAVE, { apiVersion: '2023-10-16' });
const db = await mysql.createConnection({
    host: '127.0.0.1', port: 3307, database: 'torlan_pos',
    user: process.env.DB_MIGRADOR_USER, password: process.env.DB_MIGRADOR_PASSWORD,
    dateStrings: true,
});

const EMPRESA = 1;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const uno = async (q, p = []) => (await db.query(q, p))[0][0];

const [[reales]] = await db.query('SELECT COUNT(*) AS n FROM bisonte_orders WHERE es_prueba = 0');
if (Number(reales.n) > 0) {
    console.error(`Hay ${reales.n} pedido(s) REAL(es). Este script solo se corre antes de abrir.`);
    process.exit(1);
}

const CLIENTE = await uno(`SELECT id, nombre, apellido, email, store_credit FROM clientes WHERE email = 'prueba.credito@bisonte.test'`);
if (!CLIENTE) { console.error('No existe la cuenta de prueba.'); process.exit(1); }
const USUARIO_WEB = (await uno('SELECT id FROM users WHERE empresa_id = ? ORDER BY id LIMIT 1', [EMPRESA])).id;

// ── 1. Borrar lo anterior ───────────────────────────────────────────────────
console.log('\n1. Borrando los pedidos de prueba anteriores');
{
    await db.beginTransaction();
    const [borrados] = await db.query(
        `DELETE s FROM sales s JOIN bisonte_orders bo ON bo.sale_id = s.id WHERE bo.es_prueba = 1`);
    // Los productos de prueba vuelven a su existencia de fabrica y sin nada
    // apartado: todo lo que tenian apartado o descontado era de esos pedidos.
    await db.query(
        `UPDATE products SET stock_reservado = 0, stock = IF(name = 'PRUEBA — Ultima pieza', 1, 999)
          WHERE es_prueba = 1`);
    // Y los movimientos de saldo que apuntaban a pedidos que ya no existen.
    await db.query(
        `DELETE FROM credit_history WHERE cliente_id = ? AND description LIKE 'Saldo aplicado al pedido #%'`,
        [CLIENTE.id]);
    await db.commit();
    console.log(`   ${borrados.affectedRows} ventas borradas (sus pedidos, renglones y eventos se van con ellas)`);
}

// ── 2. Tamaños para los productos de prueba ─────────────────────────────────
// Sin formato, el pedido dice "sin tamaño registrado" y se cotiza con un
// supuesto: justo lo que se quiere poder ver funcionando.
const formato = async (nombre) => (await uno('SELECT id FROM product_formats WHERE empresa_id = ? AND name = ?', [EMPRESA, nombre]))?.id;
const P = {};
for (const [clave, nombre, fmt] of [
    ['barato', 'PRUEBA — Manga barato', 'Tankobon'],
    ['normal', 'PRUEBA — Manga normal', 'B6 Tankobon'],
    ['caro', 'PRUEBA — Manga caro', 'Saikyo Jump'],
    ['pesado', 'PRUEBA — Tomo pesado', 'Monthly Comic Alive'],
    ['adultos', 'PRUEBA — Articulo para adultos', 'Doujinshi'],
    ['ultima', 'PRUEBA — Ultima pieza', 'Tankobon'],
]) {
    const p = await uno('SELECT id, sale_price FROM products WHERE es_prueba = 1 AND name = ?', [nombre]);
    if (!p) throw new Error(`falta el producto ${nombre}`);
    await db.query('UPDATE products SET format_id = ? WHERE id = ?', [await formato(fmt), p.id]);
    P[clave] = { id: p.id, precio: Number(p.sale_price) };
}
console.log('2. Productos de prueba con formato de envio');

// ── Piezas ──────────────────────────────────────────────────────────────────
async function cotizar(carrito, dir, preferida) {
    const pkg = armarPaquete(await medidasDelCarrito(db, carrito.map(c => ({ id: P[c[0]].id, quantity: c[1] }))));
    const cuerpo = (carrier) => ({
        origin: {
            name: 'Bisonte Manga', phone: '8110000000', street: 'Delta 172', district: 'Viejo Roble',
            city: 'San Nicolás de los Garza', state: 'NL', country: 'MX', postalCode: '66418',
        },
        destination: {
            name: dir.nombre_recibe, phone: dir.telefono, street: `${dir.calle} ${dir.numero_exterior}`,
            district: dir.colonia, city: dir.municipio, state: dir.codigoEstado, country: 'MX', postalCode: dir.cp,
        },
        packages: [{
            type: 'box', content: 'Manga', amount: 1, declaredValue: 200, lengthUnit: 'CM', weightUnit: 'KG',
            weight: pkg.weight, dimensions: { length: pkg.length, width: pkg.width, height: pkg.height },
        }],
        shipment: { type: 1, carrier },
    });
    for (const carrier of [preferida, 'estafeta', 'fedex', 'dhl', 'paquetexpress']) {
        const r = await fetch(`${ENVIA_SANDBOX}/ship/rate/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ENVIA_SANDBOX_TOKEN || envPos.ENVIA_BEARER_TOKEN}` },
            body: JSON.stringify(cuerpo(carrier)),
            signal: AbortSignal.timeout(20_000),
        });
        const d = await r.json().catch(() => ({}));
        const opciones = [...(d.data || [])].sort((a, b) => a.totalPrice - b.totalPrice);
        if (opciones.length) {
            const c = opciones[0];
            const price = Math.ceil(c.totalPrice);
            // La forma exacta que guarda el checkout (la opcion elegida), sin el
            // vale firmado: ese solo sirve durante la compra.
            return {
                type: 'envia', carrier: c.carrier, service: c.service,
                name: c.carrier.charAt(0).toUpperCase() + c.carrier.slice(1),
                price, deliveryEstimate: c.deliveryEstimate || null, raw: c, pkg,
            };
        }
    }
    throw new Error(`el sandbox de Envia no dio ninguna opcion para ${dir.cp}`);
}

/** Autoriza sin capturar, como el checkout. Devuelve el PI y la tarjeta. */
async function autorizar(montoMXN, tarjeta, { meses = 0, descripcion }) {
    const base = {
        amount: Math.round(montoMXN * 100), currency: 'mxn', capture_method: 'manual',
        payment_method_types: ['card'], payment_method: tarjeta,
        description: descripcion,
        metadata: { userId: String(CLIENTE.id), pedidoDePrueba: '1' },
    };
    let pi;
    if (meses) {
        pi = await stripe.paymentIntents.create({
            ...base, payment_method_options: { card: { installments: { enabled: true } } },
        });
        const planes = pi.payment_method_options?.card?.installments?.available_plans || [];
        const plan = planes.find(p => p.count === meses) || planes[0];
        if (!plan) throw new Error('Stripe no ofrecio meses sin intereses para esta tarjeta');
        pi = await stripe.paymentIntents.confirm(pi.id, {
            payment_method_options: { card: { installments: { plan } } },
            expand: ['latest_charge'],
        });
    } else {
        pi = await stripe.paymentIntents.create({ ...base, confirm: true, expand: ['latest_charge'] });
    }
    if (pi.status !== 'requires_capture') throw new Error(`el pago quedo en ${pi.status}`);
    const card = pi.latest_charge?.payment_method_details?.card;
    const tipos = { credit: 'credito', debit: 'debito', prepaid: 'prepago' };
    return {
        id: pi.id,
        marca: card?.brand || null, ultimos4: card?.last4 || null,
        tipo: tipos[card?.funding] || 'desconocido',
        meses: Number(card?.installments?.plan?.count) || 0,
        detalle: card || null,
    };
}

const haceHoras = (h) => `DATE_SUB(NOW(), INTERVAL ${Number(h)} HOUR)`;

async function crearPedido(e) {
    const renglones = e.carrito.map(([clave, cantidad]) => ({ ...P[clave], cantidad }));
    const subtotal = round2(renglones.reduce((s, r) => s + r.precio * r.cantidad, 0));
    const envio = await cotizar(e.carrito, e.dir, e.paqueteria);
    const bruto = round2(subtotal + envio.price);
    const credito = e.saldo === 'todo' ? bruto : round2(Math.min(e.saldo || 0, bruto));
    const aCobrar = round2(bruto - credito);
    const pagoTipo = credito > 0 && aCobrar <= 0 ? 'saldo' : credito > 0 ? 'mixto' : 'tarjeta';

    const tarjeta = aCobrar > 0
        ? await autorizar(aCobrar, e.tarjeta, { meses: e.meses, descripcion: `Pedido de prueba: ${e.titulo}` })
        : null;
    const referencia = tarjeta ? tarjeta.id : `saldo_${crypto.randomBytes(16).toString('hex')}`;

    await db.beginTransaction();
    try {
        const [venta] = await db.query(
            `INSERT INTO sales (empresa_id, user_id, origen, subtotal, discount, surcharge, total, payment_method, created_at)
             VALUES (?, ?, 'web', ?, 0, ?, ?, ?, ${haceHoras(e.horas)})`,
            [EMPRESA, USUARIO_WEB, subtotal, envio.price, aCobrar, pagoTipo === 'tarjeta' ? 'card' : pagoTipo]);
        const saleId = venta.insertId;

        for (const r of renglones) {
            await db.query('INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [saleId, r.id, r.cantidad, r.precio]);
            // Nace apartado, como en /api/checkout/confirm.
            await db.query('UPDATE products SET stock_reservado = stock_reservado + ? WHERE id = ?', [r.cantidad, r.id]);
        }

        // El saldo que gasto el pedido queda anotado en su historial. El saldo
        // de la cuenta no se toca aqui: ya quedo fijado arriba en lo que le
        // sobra despues de estos pedidos.
        if (credito > 0) {
            await db.query('INSERT INTO credit_history (cliente_id, amount, description) VALUES (?, ?, ?)',
                [CLIENTE.id, -credito, `Saldo aplicado al pedido #${saleId}`]);
        }

        const { codigoEstado, ...direccion } = e.dir;
        const [pedido] = await db.query(
            `INSERT INTO bisonte_orders
                (sale_id, cliente_id, payment_intent_id, pago_estado, estado, es_prueba,
                 credito_aplicado, shipping_method, shipping_address_json, envia_quote_data,
                 pago_tipo, tarjeta_marca, tarjeta_ultimos4, tarjeta_tipo, tarjeta_meses, pago_detalle, created_at)
             VALUES (?, ?, ?, 'autorizado', 'pendiente', 1, ?, 'envia', ?, ?, ?, ?, ?, ?, ?, ?, ${haceHoras(e.horas)})`,
            [saleId, CLIENTE.id, referencia, credito, JSON.stringify(direccion), JSON.stringify(envio),
             pagoTipo, tarjeta?.marca || null, tarjeta?.ultimos4 || null, tarjeta?.tipo || null,
             tarjeta?.meses || 0, tarjeta?.detalle ? JSON.stringify(tarjeta.detalle) : null]);
        await db.commit();
        return { saleId, pedidoId: pedido.insertId, referencia, tarjeta, renglones, envio, credito, aCobrar, pagoTipo };
    } catch (err) {
        await db.rollback();
        if (tarjeta) await stripe.paymentIntents.cancel(tarjeta.id).catch(() => {});
        throw err;
    }
}

/** Existencia confirmada: lo apartado pasa a descontado y se cobra. */
async function confirmar(p, horas) {
    if (p.tarjeta) await stripe.paymentIntents.capture(p.tarjeta.id);
    await db.beginTransaction();
    for (const r of p.renglones) {
        await db.query(
            'UPDATE products SET stock = stock - ?, stock_reservado = stock_reservado - ? WHERE id = ?',
            [r.cantidad, r.cantidad, r.id]);
    }
    const guia = String(Math.floor(1e11 + Math.random() * 9e11));
    await db.query(
        `UPDATE bisonte_orders
            SET estado = 'confirmado', pago_estado = 'capturado', process_type = 'manual',
                stock_deducted = 1, confirmed_at = ${haceHoras(horas)},
                tracking_number = ?, shipping_status = 'en_espera'
          WHERE id = ?`, [guia, p.pedidoId]);
    await db.commit();
}

async function despachar(p, horas) {
    await db.query(
        `UPDATE bisonte_orders SET estado = 'envio', shipping_status = 'despachado', shipped_at = ${haceHoras(horas)}
          WHERE id = ?`, [p.pedidoId]);
}

/** Mueve el paquete con el simulador del POS, un aviso de Envia a la vez. */
function simular(p, ...pasos) {
    for (const paso of pasos) {
        const args = paso === 'avanzar' ? ['avanzar', String(p.saleId)] : ['paso', String(p.saleId), String(paso)];
        execFileSync(process.execPath, ['tools/simulador-envio.mjs', ...args], { cwd: POS_BACKEND, stdio: 'pipe' });
    }
}

async function cancelar(p, motivo, horas) {
    if (p.tarjeta) await stripe.paymentIntents.cancel(p.tarjeta.id);
    await db.beginTransaction();
    for (const r of p.renglones) {
        await db.query('UPDATE products SET stock_reservado = stock_reservado - ? WHERE id = ?', [r.cantidad, r.id]);
    }
    await db.query(
        `UPDATE bisonte_orders SET estado = 'cancelado', pago_estado = 'cancelado', process_type = 'manual',
                claim_notes = ?, cancelled_at = ${haceHoras(horas)} WHERE id = ?`, [motivo, p.pedidoId]);
    await db.commit();
}

// ── 3. Los pedidos ──────────────────────────────────────────────────────────
const D = {
    monterrey: { nombre_recibe: 'Ana Sofía Garza', telefono: '8123456701', calle: 'Av. Constitución', numero_exterior: '1450', numero_interior: '', colonia: 'Centro', municipio: 'Monterrey', estado: 'Nuevo León', codigoEstado: 'NL', cp: '64000', referencias: 'Edificio gris, recepción' },
    cdmx: { nombre_recibe: 'Luis Hernández', telefono: '5512345602', calle: 'Calle Durango', numero_exterior: '210', numero_interior: '4B', colonia: 'Roma Norte', municipio: 'Cuauhtémoc', estado: 'Ciudad de México', codigoEstado: 'CX', cp: '06700', referencias: 'Entre Orizaba y Córdoba' },
    guadalajara: { nombre_recibe: 'Mariana López', telefono: '3312345603', calle: 'Av. Chapultepec', numero_exterior: '88', numero_interior: '', colonia: 'Americana', municipio: 'Guadalajara', estado: 'Jalisco', codigoEstado: 'JA', cp: '44160', referencias: '' },
    puebla: { nombre_recibe: 'Jorge Ramírez', telefono: '2221234504', calle: '5 de Mayo', numero_exterior: '402', numero_interior: '', colonia: 'Centro', municipio: 'Puebla', estado: 'Puebla', codigoEstado: 'PU', cp: '72000', referencias: 'Portón negro' },
    merida: { nombre_recibe: 'Daniela Pech', telefono: '9991234505', calle: 'Calle 60', numero_exterior: '491', numero_interior: '', colonia: 'Centro', municipio: 'Mérida', estado: 'Yucatán', codigoEstado: 'YU', cp: '97000', referencias: '' },
    queretaro: { nombre_recibe: 'Ricardo Salinas', telefono: '4421234506', calle: 'Av. Universidad', numero_exterior: '130', numero_interior: '2', colonia: 'Centro', municipio: 'Querétaro', estado: 'Querétaro', codigoEstado: 'QT', cp: '76000', referencias: '' },
    tijuana: { nombre_recibe: 'Paola Castro', telefono: '6641234507', calle: 'Blvd. Agua Caliente', numero_exterior: '10535', numero_interior: '', colonia: 'Aviación', municipio: 'Tijuana', estado: 'Baja California', codigoEstado: 'BC', cp: '22014', referencias: 'Torre Agua Caliente, piso 3' },
    culiacan: { nombre_recibe: 'Héctor Félix', telefono: '6671234508', calle: 'Blvd. Francisco I. Madero', numero_exterior: '560', numero_interior: '', colonia: 'Centro', municipio: 'Culiacán', estado: 'Sinaloa', codigoEstado: 'SI', cp: '80000', referencias: '' },
};

const ESCENARIOS = [
    { titulo: 'Tarjeta de crédito, una exhibición — por confirmar', horas: 3,
      carrito: [['normal', 2]], dir: D.monterrey, paqueteria: 'estafeta', tarjeta: 'pm_card_visa' },
    { titulo: 'Tarjeta de débito — por confirmar', horas: 7,
      carrito: [['pesado', 1], ['barato', 3]], dir: D.cdmx, paqueteria: 'fedex', tarjeta: 'pm_card_visa_debit' },
    { titulo: 'Solo saldo a favor — por confirmar', horas: 20,
      carrito: [['barato', 1]], dir: D.guadalajara, paqueteria: 'estafeta', saldo: 'todo' },
    { titulo: 'Saldo + Mastercard — confirmado, esperando recolección', horas: 30, saldo: 200,
      carrito: [['normal', 1], ['adultos', 1]], dir: D.puebla, paqueteria: 'dhl', tarjeta: 'pm_card_mastercard',
      despues: async (p) => { await confirmar(p, 26); } },
    { titulo: 'Meses sin intereses (3) — en camino', horas: 72, meses: 3,
      carrito: [['caro', 4]], dir: D.merida, paqueteria: 'fedex', tarjeta: 'pm_card_mx',
      despues: async (p) => { await confirmar(p, 66); await despachar(p, 60); simular(p, 'avanzar', 'avanzar', 'avanzar'); } },
    { titulo: 'American Express — entregado', horas: 140,
      carrito: [['adultos', 2], ['barato', 1]], dir: D.queretaro, paqueteria: 'estafeta', tarjeta: 'pm_card_amex',
      despues: async (p) => { await confirmar(p, 130); await despachar(p, 124); simular(p, 'avanzar', 'avanzar', 'avanzar', 'avanzar', 'avanzar'); } },
    { titulo: 'Visa — cancelado por el cliente', horas: 50,
      carrito: [['pesado', 2]], dir: D.tijuana, paqueteria: 'paquetexpress', tarjeta: 'pm_card_visa',
      despues: async (p) => { await cancelar(p, 'El cliente pidió cancelar: compró el tomo en otro lado.', 45); } },
    { titulo: 'Mastercard — reclamo: llegó dañado', horas: 200,
      carrito: [['normal', 3]], dir: D.culiacan, paqueteria: 'dhl', tarjeta: 'pm_card_mastercard',
      despues: async (p) => {
          await confirmar(p, 190); await despachar(p, 184);
          simular(p, 'avanzar', 'avanzar', 'avanzar', 'avanzar', 'avanzar');
          await db.query(
              `UPDATE bisonte_orders SET estado = 'reclamo', claim_status = 'disputa', claim_type = 'paqueteria',
                      claim_notes = 'El cliente mandó fotos: la caja llegó mojada y un tomo con la portada doblada.'
                WHERE id = ?`, [p.pedidoId]);
      } },
];

// La cuenta de prueba tenia $31,990 de saldo inventado a base de recargas de
// prueba. Se deja en $150: lo que le sobra despues de pagar con saldo los dos
// pedidos de abajo. Una cuenta con saldo, pero no con miles.
{
    const [[c]] = await db.query('SELECT store_credit FROM clientes WHERE id = ?', [CLIENTE.id]);
    await db.query('UPDATE clientes SET store_credit = 150 WHERE id = ?', [CLIENTE.id]);
    console.log(`3. Saldo de la cuenta de prueba: $${Number(c.store_credit).toFixed(2)} -> $150.00`);
}

console.log('\n4. Creando pedidos');
const hechos = [];
for (const e of ESCENARIOS) {
    try {
        const p = await crearPedido(e);
        if (e.despues) await e.despues(p);
        const final = await uno('SELECT estado, pago_estado, shipping_status FROM bisonte_orders WHERE id = ?', [p.pedidoId]);
        hechos.push({ '#': p.saleId, pedido: e.titulo, pago: p.pagoTipo, cobrado: p.aCobrar, saldo: p.credito,
            paqueteria: `${p.envio.carrier} ${p.envio.service}`, envio: p.envio.price, estado: final.estado,
            pago_estado: final.pago_estado, paquete: final.shipping_status || '—' });
        console.log(`   ok  #${p.saleId}  ${e.titulo}`);
    } catch (err) {
        console.log(`   MAL ${e.titulo}\n       ${err.message}`);
        hechos.push({ '#': '—', pedido: e.titulo, estado: `FALLÓ: ${err.message}` });
    }
}

const final = await uno('SELECT store_credit FROM clientes WHERE id = ?', [CLIENTE.id]);
console.table(hechos);
console.log(`Saldo final de la cuenta de prueba: $${Number(final.store_credit).toFixed(2)}`);
const reservado = (await db.query('SELECT name, stock, stock_reservado FROM products WHERE es_prueba = 1 ORDER BY id'))[0];
console.table(reservado);
await db.end();
