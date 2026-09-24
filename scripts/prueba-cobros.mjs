/**
 * Todas las rutas de dinero de la tienda, de punta a punta.
 *
 * Corre contra el servidor de desarrollo, la base real y Stripe en MODO PRUEBA.
 * No llama a las funciones por dentro: hace las mismas peticiones que hace el
 * navegador, confirma los cobros en Stripe como lo haria una tarjeta, y despues
 * mira en la base que quedo escrito lo que tenia que quedar. Donde hay una
 * trampa posible (otro precio, otro carrito, el cobro de otra persona, un
 * envio mas barato, pagar dos veces) la intenta.
 *
 * Qué cubre:
 *   carrito · compra con tarjeta · cupón · saldo (entero, mixto, el hueco del
 *   mínimo de Stripe y el interruptor) · dólares · recargas y el aviso de
 *   Stripe · lo que hace el POS (cobrar, cancelar, reembolsar) · apartar,
 *   liquidar y el tope de apartados · enviar apartados, uno y varios.
 *
 * La mercancia son los productos TEST-ADU: estan en la vitrina de adultos pero
 * no son mercancia real, asi que apartarlos o venderlos no mueve inventario de
 * verdad. Todo lo que esta prueba crea queda marcado `es_prueba` y con el cobro
 * soltado al terminar. No se borra nada.
 *
 * Antes de correrlo:
 *   1. el tunel a la base (cloud-sql-proxy ... --port=3307)
 *   2. el servidor en local: npm run dev
 *   3. llaves de Stripe de PRUEBA en .env.local (sk_test_). Con llaves de verdad
 *      esto cobraria tarjetas de verdad: se niega a arrancar.
 *
 * Uso: node scripts/prueba-cobros.mjs
 *      PRUEBA_BASE=https://bisontemanga.com PRUEBA_PASE=... node scripts/prueba-cobros.mjs
 *      (contra la tienda publicada; el pase es MAINTENANCE_BYPASS mientras
 *      siga en "en construccion". Su JWT_SECRET, CAPTURE_API_KEY y el secreto
 *      del webhook tienen que ser los mismos que los de .env.local)
 *
 * Manda correos reales al buzon de avisos de la tienda (uno por pedido): es la
 * automatizacion de verdad funcionando, no un fallo.
 */
import Stripe from 'stripe';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import { readFileSync } from 'node:fs';
import { SignJWT } from 'jose';

process.loadEnvFile('.env.local');

if (!String(process.env.STRIPE_SECRET_KEY).startsWith('sk_test_')) {
    console.error('Esta prueba solo corre con llaves de PRUEBA de Stripe. Me niego a cobrar tarjetas de verdad.');
    process.exit(1);
}

const BASE = process.env.PRUEBA_BASE || 'http://localhost:3000';
// Contra la tienda publicada, mientras este en "en construccion": el pase del
// equipo (MAINTENANCE_BYPASS) viaja como cookie en cada peticion. En local no
// hace falta.
const PASE = process.env.PRUEBA_PASE ? `bisonte_pase=${process.env.PRUEBA_PASE}` : '';
const galletas = (conSesion) => [conSesion ? cookie : '', PASE].filter(Boolean).join('; ');
const EMAIL = 'prueba.credito@bisonte.test';
const PASS = 'PruebaCredito2026';
const CLAVE_POS = process.env.CAPTURE_API_KEY;
const RETORNO = 'https://bisonte.test/retorno';

// Productos de prueba (TEST-ADU): no son mercancia real.
const P = { a: 3, b: 2, c: 9, d: 5, e: 10, f: 7, g: 4, h: 6, i: 8, j: 1, k: 11 };
const AGOTADO = 52; // real y sin existencias: solo se usa donde la tienda lo tiene que rechazar

const DIR = {
    nombre_recibe: 'Prueba Bisonte', telefono: '5512345678', calle: 'Calle de Prueba',
    numero_exterior: '1', colonia: 'Centro', cp: '06000', municipio: 'Cuauhtémoc',
    estado: 'Ciudad de México',
};
const DIR_LEJOS = { ...DIR, cp: '22000', municipio: 'Tijuana', estado: 'Baja California' };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
const q = async (sql, p = []) => (await db.query(sql, p))[0];
const uno = async (sql, p = []) => (await q(sql, p))[0];
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ── sesion y peticiones ──────────────────────────────────────────────────────
let cookie = '';
async function api(ruta, body, { metodo = 'POST', sesion = true } = {}) {
    for (;;) {
        const r = await fetch(BASE + ruta, {
            method: metodo,
            headers: { 'Content-Type': 'application/json', ...(galletas(sesion) && { Cookie: galletas(sesion) }) },
            ...(body !== undefined && { body: JSON.stringify(body) }),
        });
        // Los frenos de las rutas son reales: la prueba espera lo que pidan en
        // vez de contarlos como fallo. La prueba del freno lo mira aparte.
        if (r.status === 429) {
            const s = Number(r.headers.get('retry-after')) || 30;
            process.stdout.write(`        (la ruta ${ruta} pide esperar ${s}s)\n`);
            await dormir((s + 1) * 1000);
            continue;
        }
        const set = r.headers.getSetCookie?.() || [];
        const sesionNueva = set.find((c) => c.startsWith('bisonte_session='));
        if (sesion && sesionNueva) cookie = sesionNueva.split(';')[0];
        let d = {};
        try { d = await r.json(); } catch { /* sin cuerpo */ }
        return { http: r.status, ...d };
    }
}
const pos = (ruta, cuerpo) => fetch(BASE + ruta, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(PASE && { Cookie: PASE }) },
    body: JSON.stringify({ apiKey: CLAVE_POS, ...cuerpo }),
}).then(async (r) => ({ http: r.status, ...(await r.json().catch(() => ({}))) }));

// ── el vale de envio, firmado como lo firma la cotizacion ────────────────────
// Se firma aqui para que el precio sea EXACTO en cada prueba. La cotizacion de
// verdad, contra Envia, tiene sus propias pruebas mas abajo.
const huellaDe = (items) => crypto.createHash('sha256')
    .update(items.map((i) => `${Number(i.id)}x${Math.max(1, Math.min(Math.floor(Number(i.quantity) || 1), 99))}`).sort().join('|'))
    .digest('hex');
const destinoDe = (dir) => crypto.createHash('sha256')
    .update(`${String(dir?.cp ?? '').replace(/\D/g, '')}|${String(dir?.estado ?? '').trim().toLowerCase().normalize('NFC')}`)
    .digest('hex').slice(0, 32);
const vale = (items, precio, dir = DIR, carrier = 'prueba', service = 'estandar') => new SignJWT({
    precio: Number(precio).toFixed(2), carrier, service, itemsHash: huellaDe(items), destino: destinoDe(dir),
}).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('60m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));

const tarjeta = (pi, pm = 'pm_card_visa') => stripe.paymentIntents.confirm(pi, { payment_method: pm, return_url: RETORNO });
const piDe = (secret) => secret.split('_secret_')[0];

// Lo que la prueba crea, para marcarlo y soltar los cobros al final.
const ventas = new Set();
let cupon = null;

/**
 * Una compra completa, como la hace la pagina de pago. Devuelve lo que contesto
 * cada paso para que cada prueba mire lo suyo.
 */
async function comprar({
    items, envio = 150, dir = DIR, currency, discountCode, usarSaldo = false,
    pm = 'pm_card_visa', quote, itemsAlConfirmar, dirAlConfirmar,
} = {}) {
    const k = await api('/api/checkout', {
        items, shippingToken: await vale(items, envio, dir), currency, discountCode,
        appliedCredit: usarSaldo ? 1 : 0,
    });
    if (!k.success) return { k };
    const cotizacion = quote || { carrier: 'prueba', service: 'estandar', name: 'Prueba', price: envio };
    const cuerpo = {
        items: itemsAlConfirmar || items, shipping_address: dirAlConfirmar || dir,
        envia_quote_data: cotizacion, shippingMethod: 'envia',
    };
    if (k.sinCargo) {
        const c = await api('/api/checkout/confirm', { ...cuerpo, pedidoToken: k.pedidoToken });
        if (c.saleId) ventas.add(c.saleId);
        return { k, c };
    }
    const pi = piDe(k.clientSecret);
    let rechazo = null;
    try { await tarjeta(pi, pm); } catch (e) { rechazo = e; }
    const c = await api('/api/checkout/confirm', { ...cuerpo, paymentIntentId: pi });
    if (c.saleId) ventas.add(c.saleId);
    return { k, c, pi, rechazo };
}

const saldo = async () => Number((await uno('SELECT store_credit FROM clientes WHERE id = ?', [CLIENTE])).store_credit);
const reservado = async (id) => Number((await uno('SELECT stock_reservado FROM products WHERE id = ?', [id])).stock_reservado);
const pedido = (saleId) => uno('SELECT * FROM bisonte_orders WHERE sale_id = ?', [saleId]);
const venta = (saleId) => uno('SELECT * FROM sales WHERE id = ?', [saleId]);

async function recargar(monto, currency) {
    const t = await api('/api/credit/topup', { amount: monto, currency });
    if (!t.success) throw new Error(`no se pudo preparar la recarga: ${t.error}`);
    const pi = piDe(t.clientSecret);
    await tarjeta(pi);
    const c = await api('/api/credit/confirm', { paymentIntentId: pi });
    if (!c.success) throw new Error(`no se pudo abonar la recarga: ${c.error}`);
    return { pi, t, c };
}
async function asegurarSaldo(minimo) {
    let s = await saldo();
    while (s < minimo) {
        await recargar(Math.min(10000, Math.max(100, Math.ceil(minimo - s))));
        s = await saldo();
    }
    return s;
}

// ── arnes ────────────────────────────────────────────────────────────────────
let n = 0, ok = 0, mal = 0;
const fallos = [];
let grupo = '';
const seccion = (t) => { grupo = t; console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`); };
async function prueba(nombre, fn) {
    n++;
    try {
        await fn();
        console.log(`  ${String(n).padStart(3)}. ok    ${nombre}`);
        ok++;
    } catch (e) {
        console.log(`  ${String(n).padStart(3)}. FALLA ${nombre}\n           ${e.message}`);
        mal++;
        fallos.push(`[${grupo}] ${nombre}: ${e.message}`);
    }
}
/**
 * Deja las piezas de prueba como estarian si el POS hubiera hecho su parte.
 *
 * Al cancelar un pedido, la TIENDA suelta el cobro pero no la pieza: la pieza
 * la libera el POS (releaseReservation en webOrders.js), que en esta prueba no
 * interviene. Sin esto cada corrida dejaba piezas apartadas para pedidos
 * muertos, hasta agotar las de prueba. Se recuenta desde lo que de verdad
 * sostiene una reserva -- los apartados vivos y los pedidos reales en curso --
 * y SOLO en productos TEST-ADU, que no son mercancia real.
 */
async function recuadrarReservasDePrueba() {
    await db.query(`
        UPDATE products p
          LEFT JOIN (SELECT ai.product_id, SUM(ai.quantity) q
                       FROM anticipo_items ai JOIN anticipos a ON a.id = ai.anticipo_id
                      WHERE a.status = 'pending' GROUP BY ai.product_id) x ON x.product_id = p.id
          LEFT JOIN (SELECT si.product_id, SUM(si.quantity) q
                       FROM sale_items si JOIN bisonte_orders bo ON bo.sale_id = si.sale_id
                      WHERE bo.es_prueba = 0 AND bo.stock_deducted = 0
                        AND bo.pago_estado IN ('autorizado', 'capturado') AND bo.estado <> 'cancelado'
                      GROUP BY si.product_id) y ON y.product_id = p.id
           SET p.stock_reservado = COALESCE(x.q, 0) + COALESCE(y.q, 0)
         WHERE p.barcode LIKE 'TEST-ADU-%'`);
}

const debe = (c, m) => { if (!c) throw new Error(m); };
const igual = (a, b, m) => debe(String(a) === String(b), `${m}: esperaba ${b}, llego ${a}`);
const cerca = (a, b, m) => debe(Math.abs(Number(a) - Number(b)) < 0.011, `${m}: esperaba ${b}, llego ${a}`);

// ═════════════════════════════════════════════════════════════════════════════
const login = await api('/api/login', { email: EMAIL, password: PASS });
if (!login.user?.id) {
    console.error('No pude entrar con la cuenta de prueba:', login.error || login.http);
    process.exit(1);
}
const CLIENTE = login.user.id;
await recuadrarReservasDePrueba();
console.log(`Cuenta de prueba #${CLIENTE} · servidor ${BASE} · saldo inicial $${(await saldo()).toFixed(2)}`);

// ═════════════════════════════════════════════════════════════════════════════
seccion('CARRITO');
// ═════════════════════════════════════════════════════════════════════════════

await prueba('sin sesion no se guarda ni se lee el carrito de nadie', async () => {
    const g = await api('/api/cart', { items: [{ id: P.a, quantity: 1 }] }, { sesion: false });
    igual(g.http, 401, 'guardar sin sesion');
    const l = await api('/api/cart', undefined, { metodo: 'GET', sesion: false });
    igual((l.items || []).length, 0, 'leer sin sesion');
});

await prueba('el precio del carrito sale de la base, no del navegador', async () => {
    await api('/api/cart', { items: [{ id: P.a, quantity: 2, price: 1 }] });
    const l = await api('/api/cart', undefined, { metodo: 'GET' });
    const r = l.items.find((i) => i.id === P.a);
    debe(r, 'el renglon no se guardo');
    igual(Number(r.price), 380, 'precio');
    igual(r.quantity, 2, 'cantidad');
});

await prueba('cantidades absurdas se acotan a 1..99', async () => {
    await api('/api/cart', { items: [{ id: P.a, quantity: -5 }, { id: P.b, quantity: 5000 }] });
    const l = await api('/api/cart', undefined, { metodo: 'GET' });
    igual(l.items.find((i) => i.id === P.a)?.quantity, 1, 'negativa');
    igual(l.items.find((i) => i.id === P.b)?.quantity, 99, 'enorme');
});

await prueba('mas de 100 renglones se rechaza', async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, quantity: 1 }));
    igual((await api('/api/cart', { items })).http, 400, 'carrito gigante');
});

await prueba('un producto que ya no existe no tumba el carrito entero', async () => {
    // Pasa de verdad: un cliente con el carrito guardado en el telefono y un
    // producto que se dio de baja. Si esto revienta, no puede guardar nada.
    const r = await api('/api/cart', { items: [{ id: P.a, quantity: 1 }, { id: 99999999, quantity: 1 }] });
    igual(r.http, 200, 'guardar con un id inexistente');
});

await api('/api/cart', { items: [] });

// ═════════════════════════════════════════════════════════════════════════════
seccion('COMPRA CON TARJETA');
// ═════════════════════════════════════════════════════════════════════════════

await prueba('sin sesion no se prepara ningun cobro', async () => {
    const r = await api('/api/checkout', { items: [{ id: P.a, quantity: 1 }] }, { sesion: false });
    igual(r.http, 401, 'checkout sin sesion');
});

await prueba('sin la cotizacion firmada no hay cobro', async () => {
    const r = await api('/api/checkout', { items: [{ id: P.a, quantity: 1 }], shippingToken: null });
    igual(r.http, 400, 'sin vale');
    debe(r.envioInvalido, 'deberia pedir volver a elegir el envio');
});

await prueba('la cotizacion de un carrito no paga el envio de otro', async () => {
    const r = await api('/api/checkout', {
        items: [{ id: P.a, quantity: 3 }], shippingToken: await vale([{ id: P.a, quantity: 1 }], 99),
    });
    igual(r.http, 409, 'vale ajeno');
});

await prueba('sin existencias no se cobra', async () => {
    const r = await api('/api/checkout', {
        items: [{ id: AGOTADO, quantity: 1 }], shippingToken: await vale([{ id: AGOTADO, quantity: 1 }], 150),
    });
    igual(r.http, 409, 'producto agotado');
    debe(r.sinExistencia?.length, 'deberia decir cual falta');
});

await prueba('pedir mas piezas de las que hay no se cobra', async () => {
    const items = [{ id: P.k, quantity: 50 }];
    const r = await api('/api/checkout', { items, shippingToken: await vale(items, 150) });
    igual(r.http, 409, 'cantidad mayor al stock');
});

let compraNormal;
await prueba('compra normal: cobra el precio de la base, registra el pedido y aparta la pieza', async () => {
    const antesRes = await reservado(P.a);
    const antesSaldo = await saldo();
    const items = [{ id: P.a, quantity: 1, price: 1, title: 'trampa' }];
    // El navegador manda ademas una cotizacion con otra paqueteria y una caja
    // de 10 gramos: no deberia quedar nada de eso.
    compraNormal = await comprar({
        items,
        quote: { carrier: 'dhl', service: 'express', name: 'DHL', price: 1, pkg: { length: 1, width: 1, height: 1, weight: 0.01, empaque: 'Sobre' } },
    });
    const { k, c, pi } = compraNormal;
    debe(k.success, `checkout: ${k.error}`);
    debe(c.success, `confirm: ${c.error}`);
    const intento = await stripe.paymentIntents.retrieve(pi);
    igual(intento.amount, 53000, 'importe en Stripe (380 + 150 de envio)');
    igual(intento.status, 'requires_capture', 'el dinero queda retenido, no cobrado');
    const v = await venta(c.saleId);
    igual(v.origen, 'web', 'origen');
    cerca(v.subtotal, 380, 'subtotal');
    cerca(v.surcharge, 150, 'envio');
    cerca(v.total, 530, 'total');
    igual(v.payment_method, 'card', 'metodo');
    const si = await q('SELECT product_id, quantity, price FROM sale_items WHERE sale_id = ?', [c.saleId]);
    igual(si.length, 1, 'renglones');
    cerca(si[0].price, 380, 'precio del renglon');
    const o = await pedido(c.saleId);
    igual(o.pago_estado, 'autorizado', 'pago_estado');
    igual(o.estado, 'pendiente', 'estado');
    igual(o.pago_tipo, 'tarjeta', 'pago_tipo');
    igual(o.tarjeta_ultimos4, '4242', 'ultimos 4');
    igual(await reservado(P.a), antesRes + 1, 'la pieza queda apartada');
    cerca(await saldo(), antesSaldo, 'con el interruptor apagado el saldo no se toca');
});

await prueba('la guia usa la paqueteria que se pago y la caja real, no la del navegador', async () => {
    const o = await pedido(compraNormal.c.saleId);
    const cot = typeof o.envia_quote_data === 'string' ? JSON.parse(o.envia_quote_data) : o.envia_quote_data;
    igual(cot.carrier, 'prueba', 'paqueteria');
    igual(cot.service, 'estandar', 'servicio');
    cerca(cot.price, 150, 'precio guardado');
    debe(Number(cot.pkg?.weight) > 0.01, `el peso deberia ser el real, llego ${cot.pkg?.weight}`);
});

await prueba('confirmar dos veces el mismo pago no crea dos pedidos', async () => {
    const { pi } = compraNormal;
    const otra = await api('/api/checkout/confirm', {
        paymentIntentId: pi, items: [{ id: P.a, quantity: 1 }], shipping_address: DIR,
        envia_quote_data: { carrier: 'prueba', service: 'estandar' },
    });
    debe(otra.success && otra.repetido, `esperaba "repetido": ${JSON.stringify(otra)}`);
    igual(otra.saleId, compraNormal.c.saleId, 'mismo pedido');
    igual((await uno('SELECT COUNT(*) n FROM bisonte_orders WHERE payment_intent_id = ?', [pi])).n, 1, 'pedidos con ese pago');
});

await prueba('comprar el mismo carrito otra vez el mismo dia da un cobro nuevo, no el del pedido anterior', async () => {
    const otra = await comprar({ items: [{ id: P.a, quantity: 1 }] });
    debe(otra.c.success, `segunda compra: ${otra.c.error || otra.k.error}`);
    debe(otra.pi !== compraNormal.pi, 'reutilizo el cobro del pedido anterior');
    debe(otra.c.saleId !== compraNormal.c.saleId, 'deberia ser otro pedido');
    igual((await stripe.paymentIntents.retrieve(compraNormal.pi)).status, 'requires_capture', 'el primer pedido sigue intacto');
});

await prueba('dos confirmaciones al mismo tiempo (doble clic): un pedido, y su cobro sigue vivo', async () => {
    const items = [{ id: P.b, quantity: 1 }];
    const k = await api('/api/checkout', { items, shippingToken: await vale(items, 150) });
    debe(k.success, `checkout: ${k.error}`);
    const pi = piDe(k.clientSecret);
    await tarjeta(pi);
    const cuerpo = { paymentIntentId: pi, items, shipping_address: DIR, envia_quote_data: { carrier: 'prueba', service: 'estandar' } };
    const [a, b] = await Promise.all([api('/api/checkout/confirm', cuerpo), api('/api/checkout/confirm', cuerpo)]);
    [a, b].forEach((x) => x.saleId && ventas.add(x.saleId));
    debe(a.success && b.success, `las dos deberian contestar bien: ${JSON.stringify([a, b])}`);
    igual(a.saleId, b.saleId, 'el mismo pedido');
    igual((await uno('SELECT COUNT(*) n FROM bisonte_orders WHERE payment_intent_id = ?', [pi])).n, 1, 'pedidos');
    igual((await stripe.paymentIntents.retrieve(pi)).status, 'requires_capture', 'el cobro del pedido NO se solto');
});

await prueba('el cobro de otra persona no registra un pedido aqui', async () => {
    const ajeno = await stripe.paymentIntents.create({
        amount: 53000, currency: 'mxn', capture_method: 'manual',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: { userId: '99999999', itemsHash: huellaDe([{ id: P.a, quantity: 1 }]), totalMXN: '530.00' },
    });
    await stripe.paymentIntents.confirm(ajeno.id, { payment_method: 'pm_card_visa' });
    const r = await api('/api/checkout/confirm', {
        paymentIntentId: ajeno.id, items: [{ id: P.a, quantity: 1 }], shipping_address: DIR,
        envia_quote_data: { carrier: 'prueba', service: 'estandar' },
    });
    igual(r.http, 403, 'pago ajeno');
    await stripe.paymentIntents.cancel(ajeno.id);
});

await prueba('pagar un carrito y confirmar otro no pasa (y la autorizacion queda sin pedido)', async () => {
    const r = await comprar({ items: [{ id: P.a, quantity: 1 }], itemsAlConfirmar: [{ id: P.h, quantity: 1 }] });
    igual(r.c.http, 409, 'carrito distinto');
    await stripe.paymentIntents.cancel(r.pi).catch(() => { });
});

await prueba('cotizar a la esquina y mandar a Tijuana no pasa', async () => {
    const r = await comprar({ items: [{ id: P.a, quantity: 1 }], dirAlConfirmar: DIR_LEJOS });
    igual(r.c.http, 409, 'direccion distinta a la cotizada');
    await stripe.paymentIntents.cancel(r.pi).catch(() => { });
});

await prueba('tarjeta rechazada: no hay pedido ni pieza apartada', async () => {
    const antes = await reservado(P.b);
    const r = await comprar({ items: [{ id: P.b, quantity: 1 }], pm: 'pm_card_chargeDeclined' });
    debe(r.rechazo, 'Stripe deberia haber rechazado la tarjeta');
    debe(!r.c.success, 'no deberia registrarse el pedido');
    igual(await reservado(P.b), antes, 'no deberia apartarse nada');
});

await prueba('dos clics en pagar dan el mismo cobro, no dos', async () => {
    const items = [{ id: P.c, quantity: 1 }];
    const token = await vale(items, 150);
    const a = await api('/api/checkout', { items, shippingToken: token });
    const b = await api('/api/checkout', { items, shippingToken: token });
    igual(piDe(a.clientSecret), piDe(b.clientSecret), 'mismo PaymentIntent');
    await stripe.paymentIntents.cancel(piDe(a.clientSecret)).catch(() => { });
});

await prueba('en dolares se cobra con el tipo de cambio del servidor, y la venta queda en pesos', async () => {
    const r = await comprar({ items: [{ id: P.c, quantity: 1 }], currency: 'USD' });
    debe(r.c.success, `confirm: ${r.c.error}`);
    const intento = await stripe.paymentIntents.retrieve(r.pi);
    igual(intento.currency, 'usd', 'moneda');
    const tc = Number(intento.amount) / 100 / 655;   // 505 + 150
    debe(tc > 0.03 && tc < 0.09, `tipo de cambio raro: ${tc}`);
    cerca((await venta(r.c.saleId)).total, 655, 'la venta se guarda en pesos');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('CUPON');
// ═════════════════════════════════════════════════════════════════════════════

await prueba('un cupon que no existe se rechaza', async () => {
    const items = [{ id: P.d, quantity: 1 }];
    const r = await api('/api/checkout', { items, shippingToken: await vale(items, 150), discountCode: 'NOEXISTE-XYZ' });
    igual(r.http, 400, 'cupon inexistente');
});

// Un cupon temporal: codigo imposible de adivinar, tres usos y dos horas de
// vida. Se desactiva al terminar la prueba.
const credenciales = readFileSync('db/.credenciales-TODAS.txt', 'utf8').split(/\r?\n/);
const iMant = credenciales.findIndex((l) => /^\s*Usuario:\s*torlan_user\b/.test(l));
const claveMant = credenciales.slice(iMant, iMant + 6).find((l) => /Contrase/i.test(l))?.replace(/^.*?:\s*/, '').trim();
const mant = claveMant ? await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: 'torlan_user', password: claveMant, database: process.env.DB_NAME,
}) : null;

if (mant) {
    const codigo = `PRUEBA-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const [ins] = await mant.query(
        `INSERT INTO coupons (empresa_id, code, discount_type, discount_value, status, expiration_date, usage_limit)
         VALUES (?, ?, 'percentage', 10, 'active', DATE_ADD(NOW(), INTERVAL 2 HOUR), 3)`,
        [Number(process.env.EMPRESA_ID) || 122, codigo]);
    cupon = { id: ins.insertId, codigo };

    let conCupon;
    await prueba('un cupon valido descuenta sobre la mercancia, no sobre el envio', async () => {
        conCupon = await comprar({ items: [{ id: P.d, quantity: 1 }], discountCode: codigo });
        debe(conCupon.c.success, `confirm: ${conCupon.c.error || conCupon.k.error}`);
        cerca(conCupon.k.appliedDiscount, 54, '10% de 540');
        igual((await stripe.paymentIntents.retrieve(conCupon.pi)).amount, 63600, '540 - 54 + 150');
    });

    await prueba('el cupon se gasta al cobrar, no al autorizar', async () => {
        igual((await uno('SELECT usage_count FROM coupons WHERE id = ?', [cupon.id])).usage_count, 0, 'antes de cobrar');
        const c = await pos('/api/orders/capture', { saleId: conCupon.c.saleId, action: 'capture' });
        debe(c.success, `captura: ${c.error}`);
        igual((await uno('SELECT usage_count FROM coupons WHERE id = ?', [cupon.id])).usage_count, 1, 'despues de cobrar');
        igual((await q('SELECT 1 FROM coupon_redemptions WHERE coupon_id = ? AND cliente_id = ?', [cupon.id, CLIENTE])).length, 1, 'canje registrado');
    });

    await prueba('el mismo cliente no puede usar el cupon dos veces', async () => {
        const items = [{ id: P.d, quantity: 1 }];
        const r = await api('/api/checkout', { items, shippingToken: await vale(items, 150), discountCode: codigo });
        igual(r.http, 400, 'segundo uso');
    });
} else {
    console.log('  (sin la cuenta de mantenimiento no se puede crear el cupon temporal: se salta el cupon valido)');
}

// ═════════════════════════════════════════════════════════════════════════════
seccion('RECARGAS DE SALDO');
// ═════════════════════════════════════════════════════════════════════════════

await prueba('montos fuera de rango no se cobran', async () => {
    igual((await api('/api/credit/topup', { amount: 50 })).http, 400, '$50');
    igual((await api('/api/credit/topup', { amount: 20000 })).http, 400, '$20,000');
    igual((await api('/api/credit/topup', { amount: 'mil' })).http, 400, 'texto');
});

let recarga;
await prueba('una recarga abona exactamente lo pagado', async () => {
    const antes = await saldo();
    recarga = await recargar(1000);
    cerca(await saldo(), antes + 1000, 'saldo');
    igual((await q('SELECT 1 FROM credit_topups WHERE payment_intent_id = ?', [recarga.pi])).length, 1, 'registro de la recarga');
});

await prueba('confirmar dos veces la misma recarga no abona dos veces', async () => {
    const antes = await saldo();
    const c = await api('/api/credit/confirm', { paymentIntentId: recarga.pi });
    debe(c.success && c.yaAplicado, `esperaba "ya aplicado": ${JSON.stringify(c)}`);
    cerca(await saldo(), antes, 'saldo sin cambio');
});

await prueba('el cobro de un pedido no se puede convertir en saldo', async () => {
    const r = await api('/api/credit/confirm', { paymentIntentId: compraNormal.pi });
    igual(r.http, 400, 'pago de pedido como recarga');
});

await prueba('una recarga sin pagar no abona nada', async () => {
    const t = await api('/api/credit/topup', { amount: 300 });
    const r = await api('/api/credit/confirm', { paymentIntentId: piDe(t.clientSecret) });
    igual(r.http, 409, 'recarga sin pagar');
    await stripe.paymentIntents.cancel(piDe(t.clientSecret)).catch(() => { });
});

await prueba('recargar en dolares abona los pesos elegidos', async () => {
    const antes = await saldo();
    const r = await recargar(500, 'USD');
    igual((await stripe.paymentIntents.retrieve(r.pi)).currency, 'usd', 'moneda del cargo');
    cerca(await saldo(), antes + 500, 'abono en pesos');
});

// El aviso de Stripe: el camino que abona aunque el navegador se cierre.
async function avisoStripe(tipo, objeto, secreto = process.env.STRIPE_WEBHOOK_SECRET) {
    const cuerpo = JSON.stringify({ id: `evt_prueba_${crypto.randomBytes(6).toString('hex')}`, type: tipo, data: { object: objeto } });
    const firma = stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: secreto });
    const r = await fetch(BASE + '/api/stripe/webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': firma }, body: cuerpo,
    });
    return r.status;
}

await prueba('si el navegador se cierra tras pagar, el aviso de Stripe abona la recarga', async () => {
    const antes = await saldo();
    const t = await api('/api/credit/topup', { amount: 200 });
    const pi = piDe(t.clientSecret);
    await tarjeta(pi);
    igual(await avisoStripe('payment_intent.succeeded', { id: pi, object: 'payment_intent' }), 200, 'aviso');
    cerca(await saldo(), antes + 200, 'abonada por el aviso');
    const c = await api('/api/credit/confirm', { paymentIntentId: pi });
    debe(c.yaAplicado, 'el navegador llegando tarde no deberia abonar otra vez');
    cerca(await saldo(), antes + 200, 'sin doble abono');
});

await prueba('un aviso con firma falsa no abona nada', async () => {
    const antes = await saldo();
    const s = await avisoStripe('payment_intent.succeeded', { id: recarga.pi }, 'whsec_falso');
    igual(s, 400, 'firma falsa');
    cerca(await saldo(), antes, 'saldo');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('SALDO EN LA COMPRA');
// ═════════════════════════════════════════════════════════════════════════════

await prueba('con el interruptor encendido y saldo de sobra, se paga sin tarjeta', async () => {
    await asegurarSaldo(700);
    const antes = await saldo();
    const r = await comprar({ items: [{ id: P.e, quantity: 1 }], usarSaldo: true });   // 560 + 150
    debe(r.k.sinCargo, 'deberia ir sin tarjeta');
    debe(r.c.success, `confirm: ${r.c.error}`);
    cerca(await saldo(), antes - 710, 'saldo descontado');
    const o = await pedido(r.c.saleId);
    igual(o.pago_tipo, 'saldo', 'pago_tipo');
    cerca(o.credito_aplicado, 710, 'credito_aplicado');
    igual((await venta(r.c.saleId)).payment_method, 'saldo', 'metodo en la venta');
    debe(String(o.payment_intent_id).startsWith('saldo_'), 'referencia propia');
    // El mismo token dos veces no gasta el saldo dos veces.
    const otra = await api('/api/checkout/confirm', {
        pedidoToken: r.k.pedidoToken, items: [{ id: P.e, quantity: 1 }], shipping_address: DIR,
        envia_quote_data: { carrier: 'prueba', service: 'estandar' },
    });
    debe(otra.repetido || !otra.success, 'el token repetido no deberia crear otro pedido');
    cerca(await saldo(), antes - 710, 'saldo sin doble descuento');
});

await prueba('con el interruptor APAGADO el saldo no se usa aunque alcance', async () => {
    await asegurarSaldo(700);
    const antes = await saldo();
    const r = await comprar({ items: [{ id: P.e, quantity: 1 }], usarSaldo: false });
    debe(!r.k.sinCargo, 'no deberia pagarse con saldo');
    igual((await stripe.paymentIntents.retrieve(r.pi)).amount, 71000, 'todo a la tarjeta');
    cerca(await saldo(), antes, 'saldo intacto');
});

await prueba('pago mixto: el saldo cubre una parte y la tarjeta el resto', async () => {
    // El saldo de esta cuenta crece con cada corrida (recargas y reembolsos),
    // asi que en vez de comprar mas piezas -- que se acaban -- se sube el envio
    // del vale hasta que el total pase el saldo por $200.
    const s = await asegurarSaldo(100);
    const envio = Math.max(150, r2(s - 610 + 200));
    const total = r2(610 + envio);
    const r = await comprar({ items: [{ id: P.g, quantity: 1 }], envio, usarSaldo: true });
    debe(r.c?.success, `confirm: ${r.c?.error || r.k.error}`);
    igual((await stripe.paymentIntents.retrieve(r.pi)).amount, Math.round((total - s) * 100), 'la tarjeta paga el resto');
    igual((await pedido(r.c.saleId)).pago_tipo, 'mixto', 'pago_tipo');
    cerca(await saldo(), 0, 'saldo agotado');
});

await prueba('si al saldo le faltan menos de $10, la tarjeta paga el minimo de Stripe', async () => {
    const s = await asegurarSaldo(400);
    // Envio calculado para que al total le falten $5 despues del saldo.
    const envio = r2(s + 5 - 380);
    const r = await comprar({ items: [{ id: P.a, quantity: 1 }], envio, usarSaldo: true });
    debe(r.c.success, `confirm: ${r.c.error || r.k.error}`);
    igual((await stripe.paymentIntents.retrieve(r.pi)).amount, 1000, 'la tarjeta paga $10');
    cerca(r.k.appliedCredit, r2(s - 5), 'se aplica un poco menos de saldo');
    cerca(await saldo(), 5, 'quedan $5 de saldo');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('LO QUE HACE EL POS: COBRAR, CANCELAR, REEMBOLSAR');
// ═════════════════════════════════════════════════════════════════════════════

await prueba('sin la clave del POS no se cobra, ni se cancela, ni se reembolsa', async () => {
    const s = compraNormal.c.saleId;
    for (const [ruta, cuerpo] of [['/api/orders/capture', { saleId: s, action: 'capture' }], ['/api/orders/refund', { saleId: s }]]) {
        const r = await fetch(BASE + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(PASE && { Cookie: PASE }) }, body: JSON.stringify({ ...cuerpo, apiKey: 'falsa' }) });
        igual(r.status, 401, ruta);
    }
});

await prueba('cobrar un pedido lo captura en Stripe una sola vez', async () => {
    const s = compraNormal.c.saleId;
    const c = await pos('/api/orders/capture', { saleId: s, action: 'capture' });
    debe(c.success, `captura: ${c.error}`);
    igual((await stripe.paymentIntents.retrieve(compraNormal.pi)).status, 'succeeded', 'Stripe');
    igual((await pedido(s)).pago_estado, 'capturado', 'pago_estado');
    igual((await pos('/api/orders/capture', { saleId: s, action: 'capture' })).http, 409, 'segunda captura');
});

await prueba('reembolsar un pedido cobrado devuelve el dinero en Stripe', async () => {
    const s = compraNormal.c.saleId;
    const r = await pos('/api/orders/refund', { saleId: s });
    debe(r.success, `reembolso: ${r.error}`);
    igual((await pedido(s)).pago_estado, 'reembolsado', 'pago_estado');
    const cargo = await stripe.charges.retrieve((await stripe.paymentIntents.retrieve(compraNormal.pi)).latest_charge);
    debe(cargo.refunded, 'Stripe deberia tenerlo reembolsado');
    const otra = await pos('/api/orders/refund', { saleId: s });
    debe(otra.alreadyRefunded, 'el segundo reembolso no deberia devolver otra vez');
});

await prueba('cancelar un pedido con saldo devuelve el saldo y suelta la tarjeta', async () => {
    await asegurarSaldo(200);
    const antes = await saldo();
    const r = await comprar({ items: [{ id: P.i, quantity: 1 }], usarSaldo: true });   // 590 + 150 = 740 > saldo
    debe(r.c.success, `compra: ${r.c.error || r.k.error}`);
    const gastado = r2(antes - await saldo());
    debe(gastado > 0, 'deberia haber gastado saldo');
    const c = await pos('/api/orders/capture', { saleId: r.c.saleId, action: 'cancel' });
    debe(c.success, `cancelar: ${c.error}`);
    igual((await stripe.paymentIntents.retrieve(r.pi)).status, 'canceled', 'Stripe');
    cerca(await saldo(), antes, 'el saldo vuelve completo');
    igual((await pos('/api/orders/refund', { saleId: r.c.saleId })).http, 409, 'no se reembolsa lo que no se cobro');
});

await prueba('cancelar un pedido cuyo cobro ya caduco en Stripe cierra el pedido igual', async () => {
    const r = await comprar({ items: [{ id: P.c, quantity: 1 }] });
    debe(r.c.success, `compra: ${r.c.error || r.k.error}`);
    await stripe.paymentIntents.cancel(r.pi);   // lo que hace Stripe solo a los 7 dias
    const c = await pos('/api/orders/capture', { saleId: r.c.saleId, action: 'cancel' });
    debe(c.success, `cancelar: ${c.error}`);
    igual((await pedido(r.c.saleId)).pago_estado, 'cancelado', 'pago_estado');
});

await prueba('reembolsar un pedido pagado con saldo devuelve el saldo', async () => {
    await asegurarSaldo(900);
    const antes = await saldo();
    const r = await comprar({ items: [{ id: P.j, quantity: 1 }], usarSaldo: true });   // 520 + 150
    debe(r.k.sinCargo, 'deberia ir sin tarjeta');
    await pos('/api/orders/capture', { saleId: r.c.saleId, action: 'capture' });
    const f = await pos('/api/orders/refund', { saleId: r.c.saleId });
    debe(f.success, `reembolso: ${f.error}`);
    cerca(await saldo(), antes, 'saldo devuelto');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('APARTADOS');
// ═════════════════════════════════════════════════════════════════════════════

const abiertos = async () => Number((await uno("SELECT COUNT(*) n FROM anticipos WHERE cliente_id = ? AND status = 'pending'", [CLIENTE])).n);

async function apartar(productoId, monto) {
    const p = await api('/api/me/apartados/preparar', { productoId, ...(monto !== undefined && { monto }) });
    if (!p.success) return { p };
    const pi = piDe(p.clientSecret);
    await tarjeta(pi);
    const c = await api('/api/me/apartados/crear', { paymentIntentId: pi });
    return { p, pi, c };
}
async function liquidar(apartadoId) {
    const p = await api(`/api/me/apartados/${apartadoId}/pay`, {});
    if (!p.success) return { p };
    const pi = piDe(p.clientSecret);
    await tarjeta(pi);
    const c = await api(`/api/me/apartados/${apartadoId}/confirm`, { paymentIntentId: pi });
    return { p, pi, c };
}

await prueba('antes de empezar, la cuenta no tiene apartados abiertos', async () => {
    igual(await abiertos(), 0, 'apartados abiertos (si hay, la prueba del tope no mide lo que dice)');
});

await prueba('apartar: sin sesion, agotado, y montos fuera de rango se rechazan', async () => {
    igual((await api('/api/me/apartados/preparar', { productoId: P.e }, { sesion: false })).http, 401, 'sin sesion');
    igual((await api('/api/me/apartados/preparar', { productoId: AGOTADO })).http, 409, 'agotado');
    igual((await api('/api/me/apartados/preparar', { productoId: P.e, monto: 50 })).http, 400, 'debajo del minimo');
    igual((await api('/api/me/apartados/preparar', { productoId: P.e, monto: 9999 })).http, 400, 'arriba del total');
});

let ap1;
await prueba('apartar con el minimo cobra el 30%, aparta la pieza y da folio', async () => {
    const antes = await reservado(P.e);
    const r = await apartar(P.e);
    debe(r.c?.success, `crear: ${r.c?.error || r.p.error}`);
    ap1 = r;
    const a = await uno('SELECT * FROM anticipos WHERE id = ?', [r.c.apartadoId || r.c.id]);
    debe(a, `no encuentro el apartado (${JSON.stringify(r.c)})`);
    ap1.id = a.id;
    cerca(a.paid_amount, 168, 'anticipo (30% de 560)');
    igual(a.status, 'pending', 'estado');
    debe(/^AP-\d{6}$/.test(a.folio), `folio: ${a.folio}`);
    igual(await reservado(P.e), antes + 1, 'pieza apartada');
    igual((await stripe.paymentIntents.retrieve(r.pi)).status, 'succeeded', 'anticipo cobrado');
});

await prueba('el mismo cobro no crea dos apartados', async () => {
    const r = await api('/api/me/apartados/crear', { paymentIntentId: ap1.pi });
    debe(r.success && r.repetido, `esperaba "repetido": ${JSON.stringify(r)}`);
});

await prueba('el cobro de un apartado no sirve para liquidar otro', async () => {
    const r = await api(`/api/me/apartados/${ap1.id}/confirm`, { paymentIntentId: ap1.pi });
    igual(r.http, 403, 'PI de creacion usado para liquidar');
});

await prueba('ANTES de liquidar, el apartado no se puede enviar', async () => {
    const c = await api('/api/me/apartados/envio/cotizar', { apartadoIds: [ap1.id], direccion: DIR });
    igual(c.http, 409, 'cotizar');
    igual(c.codigo, 'con_saldo', 'motivo');
    const p = await api('/api/me/apartados/envio/preparar', { apartadoIds: [ap1.id], direccion: DIR, shippingToken: 'x' });
    igual(p.http, 409, 'preparar el cobro del envio');
});

await prueba('liquidar cobra exactamente el saldo y deja el apartado en cero', async () => {
    const r = await liquidar(ap1.id);
    debe(r.c?.success, `liquidar: ${r.c?.error || r.p.error}`);
    cerca(r.p.saldo, 392, 'saldo cobrado');
    const a = await uno('SELECT paid_amount, total_amount, status FROM anticipos WHERE id = ?', [ap1.id]);
    cerca(a.paid_amount, a.total_amount, 'pagado completo');
    igual(a.status, 'pending', 'sigue vivo hasta mandarse');
    igual((await api(`/api/me/apartados/${ap1.id}/pay`, {})).http, 409, 'no se puede pagar de mas');
});

await prueba('el tope de 3 apartados no se salta pidiendo los cobros antes', async () => {
    // Con 1 abierto, se preparan 3 cobros (los 3 ven "1 abierto") y despues se
    // crean. Dos caben; el tercero tiene que rebotar y soltar su cobro.
    const n0 = await abiertos();
    const cuantos = 3 - n0 + 1;
    const preparados = [];
    for (const [i, prod] of [P.f, P.g, P.h, P.i].slice(0, cuantos).entries()) {
        const p = await api('/api/me/apartados/preparar', { productoId: prod });
        debe(p.success, `preparar ${i}: ${p.error}`);
        const pi = piDe(p.clientSecret);
        await tarjeta(pi);
        preparados.push({ prod, pi });
    }
    const resultados = [];
    for (const x of preparados) resultados.push(await api('/api/me/apartados/crear', { paymentIntentId: x.pi }));
    igual(await abiertos(), 3, 'apartados abiertos al final');
    const ultimo = resultados.at(-1);
    igual(ultimo.http, 409, 'el que se pasa del tope');
    igual((await stripe.paymentIntents.retrieve(preparados.at(-1).pi)).status, 'canceled', 'y su cobro se suelta');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('ENVIAR APARTADOS');
// ═════════════════════════════════════════════════════════════════════════════

let envio1;
await prueba('cotizar el envio de un apartado liquidado pregunta a la paqueteria de verdad', async () => {
    const c = await api('/api/me/apartados/envio/cotizar', { apartadoIds: [ap1.id], direccion: DIR });
    debe(c.success, `cotizar: ${c.error}`);
    debe(c.carriers?.length, 'sin opciones');
    envio1 = { opcion: c.carriers[0] };
    cerca(c.mercancia, 560, 'mercancia');
});

await prueba('pedir el envio cobra SOLO el envio y cierra el apartado', async () => {
    const antesRes = await reservado(P.e);
    const p = await api('/api/me/apartados/envio/preparar', { apartadoIds: [ap1.id], direccion: DIR, shippingToken: envio1.opcion.vale });
    debe(p.success, `preparar: ${p.error}`);
    const pi = piDe(p.clientSecret);
    igual((await stripe.paymentIntents.retrieve(pi)).amount, Math.round(envio1.opcion.price * 100), 'solo el envio');
    await tarjeta(pi);
    // Primero con otra paqueteria: tiene que rebotar sin tocar nada...
    const trampa = await api('/api/me/apartados/envio/confirmar', { paymentIntentId: pi, direccion: DIR, envia_quote_data: { ...envio1.opcion, carrier: 'otra' } });
    igual(trampa.http, 409, 'paqueteria distinta');
    // ...y a otra direccion tampoco.
    const lejos = await api('/api/me/apartados/envio/confirmar', { paymentIntentId: pi, direccion: DIR_LEJOS, envia_quote_data: envio1.opcion });
    igual(lejos.http, 409, 'direccion distinta');
    const c = await api('/api/me/apartados/envio/confirmar', { paymentIntentId: pi, direccion: DIR, envia_quote_data: { ...envio1.opcion, pkg: { weight: 0.01 } } });
    debe(c.success, `confirmar: ${c.error}`);
    ventas.add(c.saleId);
    envio1.saleId = c.saleId;
    envio1.pi = pi;
    const a = await uno('SELECT status, sale_id FROM anticipos WHERE id = ?', [ap1.id]);
    igual(a.status, 'completed', 'apartado cerrado');
    igual(a.sale_id, c.saleId, 'apunta a su venta');
    const v = await venta(c.saleId);
    cerca(v.subtotal, 560, 'mercancia en la venta');
    cerca(v.surcharge, envio1.opcion.price, 'envio en la venta');
    const o = await pedido(c.saleId);
    igual(o.pago_estado, 'autorizado', 'el envio queda retenido');
    const cot = typeof o.envia_quote_data === 'string' ? JSON.parse(o.envia_quote_data) : o.envia_quote_data;
    debe(Number(cot.pkg?.weight) > 0.01, 'la caja la arma el servidor');
    igual(await reservado(P.e), antesRes, 'el inventario no se mueve: el pedido hereda la reserva');
});

await prueba('el mismo envio confirmado dos veces no crea dos pedidos', async () => {
    const r = await api('/api/me/apartados/envio/confirmar', { paymentIntentId: envio1.pi, direccion: DIR, envia_quote_data: envio1.opcion });
    debe(r.success && r.repetido, `esperaba "repetido": ${JSON.stringify(r)}`);
});

await prueba('un apartado ya enviado no se vuelve a enviar', async () => {
    const r = await api('/api/me/apartados/envio/cotizar', { apartadoIds: [ap1.id], direccion: DIR });
    igual(r.codigo, 'ya_enviado', 'motivo');
});

await prueba('el cobro de una compra no sirve para registrar un envio', async () => {
    const r = await api('/api/me/apartados/envio/confirmar', { paymentIntentId: compraNormal.pi, direccion: DIR, envia_quote_data: envio1.opcion });
    debe(r.http === 403 || r.http === 400, `esperaba rechazo, llego ${r.http}`);
});

await prueba('envio multiple: dos apartados liquidados, una caja, un cobro', async () => {
    const vivos = await q("SELECT id FROM anticipos WHERE cliente_id = ? AND status = 'pending' ORDER BY id LIMIT 2", [CLIENTE]);
    igual(vivos.length, 2, 'apartados disponibles');
    const ids = vivos.map((v) => v.id);
    // Uno liquidado y otro no: la caja no sale.
    const a0 = await liquidar(ids[0]);
    debe(a0.c?.success, `liquidar el primero: ${a0.c?.error}`);
    const mitad = await api('/api/me/apartados/envio/cotizar', { apartadoIds: ids, direccion: DIR });
    igual(mitad.codigo, 'con_saldo', 'con uno a medias no se cotiza');
    const a1 = await liquidar(ids[1]);
    debe(a1.c?.success, `liquidar el segundo: ${a1.c?.error}`);
    const c = await api('/api/me/apartados/envio/cotizar', { apartadoIds: ids, direccion: DIR });
    debe(c.success, `cotizar: ${c.error}`);
    const opcion = c.carriers[0];
    const p = await api('/api/me/apartados/envio/preparar', { apartadoIds: ids, direccion: DIR, shippingToken: opcion.vale });
    debe(p.success, `preparar: ${p.error}`);
    const pi = piDe(p.clientSecret);
    await tarjeta(pi);
    // Dos confirmaciones al mismo tiempo, como un doble clic.
    const cuerpo = { paymentIntentId: pi, direccion: DIR, envia_quote_data: opcion };
    const [f, g] = await Promise.all([
        api('/api/me/apartados/envio/confirmar', cuerpo), api('/api/me/apartados/envio/confirmar', cuerpo),
    ]);
    debe(f.success && g.success, `las dos deberian contestar bien: ${JSON.stringify([f, g])}`);
    igual(f.saleId, g.saleId, 'el mismo pedido');
    ventas.add(f.saleId);
    igual((await stripe.paymentIntents.retrieve(pi)).status, 'requires_capture', 'el cobro del envio NO se solto');
    const cerrados = await q('SELECT sale_id FROM anticipos WHERE id IN (?)', [ids]);
    debe(cerrados.every((x) => x.sale_id === f.saleId), 'los dos apartados apuntan a la misma venta');
    igual((await q('SELECT 1 FROM sale_items WHERE sale_id = ?', [f.saleId])).length, 2, 'dos renglones en la caja');
});

await prueba('el POS cobra el envio del apartado (solo el envio)', async () => {
    const c = await pos('/api/orders/capture', { saleId: envio1.saleId, action: 'capture' });
    debe(c.success, `captura: ${c.error}`);
    const intento = await stripe.paymentIntents.retrieve(envio1.pi);
    igual(intento.status, 'succeeded', 'cobrado');
    igual(intento.amount_received, Math.round(envio1.opcion.price * 100), 'solo el envio');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('FRENO DE LA PANTALLA DE PAGO');
// ═════════════════════════════════════════════════════════════════════════════

await prueba('una sesion en bucle se frena antes de llenar Stripe de cobros', async () => {
    let frenado = false;
    for (let i = 0; i < 20 && !frenado; i++) {
        const r = await fetch(BASE + '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: galletas(true) }, body: JSON.stringify({ items: [] }) });
        if (r.status === 429) frenado = true;
    }
    debe(frenado, 'veinte intentos seguidos deberian frenarse');
});

// ═════════════════════════════════════════════════════════════════════════════
//  Cierre: nada se borra. Lo creado queda marcado como prueba y ningun cobro
//  queda retenido en Stripe.
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── Cierre ─────────────────────────────────────────────────────────────');
const anteriores = await q(
    "SELECT sale_id FROM bisonte_orders WHERE cliente_id = ? AND es_prueba = 1 AND pago_estado = 'autorizado'", [CLIENTE]);
for (const a of anteriores) ventas.add(a.sale_id);
const creados = [...ventas];
if (creados.length) {
    await db.query('UPDATE bisonte_orders SET es_prueba = 1 WHERE sale_id IN (?)', [creados]);
    let soltados = 0;
    for (const s of creados) {
        const o = await pedido(s);
        if (o?.pago_estado === 'autorizado') {
            const c = await pos('/api/orders/capture', { saleId: s, action: 'cancel' });
            if (c.success) soltados++;
        }
    }
    console.log(`  ${creados.length} pedidos marcados como prueba; ${soltados} autorizaciones soltadas en Stripe.`);
}
if (cupon && mant) {
    await mant.query("UPDATE coupons SET status = 'inactive' WHERE id = ?", [cupon.id]);
    console.log(`  cupon temporal ${cupon.codigo} desactivado.`);
}
await recuadrarReservasDePrueba();
console.log('  piezas de prueba recuadradas (como si el POS hubiera liberado las de los pedidos cancelados).');
await api('/api/cart', { items: [] });

console.log(`\n${ok} pasaron, ${mal} fallaron, ${n} en total.`);
if (fallos.length) {
    console.log('\nFallaron:');
    for (const f of fallos) console.log(`  · ${f}`);
}
await db.end();
if (mant) await mant.end();
process.exit(mal ? 1 : 0);
