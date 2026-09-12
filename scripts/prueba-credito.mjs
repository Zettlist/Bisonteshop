/**
 * El sistema de credito de tienda, de punta a punta.
 *
 * A diferencia de db/tests/, esto NO corre contra una base efimera: usa el
 * servidor de desarrollo, Stripe de verdad (en modo prueba) y la base real.
 * Es lo unico que ejercita las rutas — db/tests/credito.mjs prueba el esquema y
 * la forma de las consultas, pero no pasa por /api/credit/topup ni por Stripe.
 *
 * Por eso vive en scripts/ y no en la suite: `npm test` tiene que poder correr
 * sin nada levantado, y esto necesita tres cosas encendidas.
 *
 * Antes de correrlo:
 *   1. el tunel a la base
 *      cloud-sql-proxy --gcloud-auth --port=3307 torlan-web:us-central1:torlan-mysql
 *   2. el servidor        npm run dev
 *   3. las llaves de Stripe en .env.local (sk_test_ / pk_test_ — NUNCA las live:
 *      esto cobra tarjetas de verdad si le pones llaves de verdad)
 *   4. la cuenta de prueba de abajo, creada y con email_verified = 1
 *
 * Uso: node scripts/prueba-credito.mjs
 *
 * El freno de recargas de /api/credit/topup es por minuto, asi que dos pasadas
 * seguidas necesitan un minuto entre medias.
 */
import Stripe from 'stripe';
import mysql from 'mysql2/promise';

process.loadEnvFile('.env.local');

const BASE = 'http://localhost:3000';
const EMAIL = 'prueba.credito@bisonte.test';
const PASS = 'PruebaCredito2026';
const PRODUCTO = 52;
// Envio alto a proposito: con el envio normal el saldo cubre el pedido entero y
// el cargo queda en cero, que es el fallo que aisla la prueba 16.
const ENVIO = 2000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// ── sesion ───────────────────────────────────────────────────────────────────
let cookie = '';
async function api(ruta, body, metodo = 'POST') {
    const r = await fetch(BASE + ruta, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
        ...(body && { body: JSON.stringify(body) }),
    });
    const set = r.headers.getSetCookie?.() || [];
    if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
    let d = null; try { d = await r.json(); } catch { }
    // `http` y no `status`: /api/credit/confirm devuelve un `status` propio en el
    // cuerpo (el del PaymentIntent) y el spread lo pisaba encima del codigo HTTP.
    return { http: r.status, ...d };
}

const saldo = async () => {
    const [r] = await db.query('SELECT store_credit FROM clientes WHERE id = ?', [CLIENTE]);
    return Number(r[0].store_credit);
};
const uno = async (q, p = []) => (await db.query(q, p))[0][0];
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// El saldo del cliente de prueba CRECE en cada corrida (cada pasada abona una
// recarga y los reembolsos devuelven mas), asi que un carrito fijo acaba
// costando menos que el saldo y las pruebas del camino con tarjeta se
// convierten en pruebas del camino sin cargo sin avisar. El carrito se arma en
// funcion del saldo del momento: asi la suite dice lo mismo la primera vez y la
// decima.
async function carritoQueSupere(objetivo) {
    const [rows] = await db.query(
        `SELECT id, sale_price, stock FROM products
          WHERE stock > 0 AND sale_price > 0 ORDER BY sale_price DESC LIMIT 40`);
    const items = [];
    let suma = 0;
    for (const p of rows) {
        if (suma > objetivo) break;
        const cantidad = Math.min(Number(p.stock), Math.ceil((objetivo - suma) / Number(p.sale_price)) || 1);
        items.push({ id: p.id, quantity: cantidad });
        suma += Number(p.sale_price) * cantidad;
    }
    if (suma <= objetivo) throw new Error(`no hay catalogo suficiente para superar ${objetivo} (llego a ${suma})`);
    return { items, subtotal: round2(suma) };
}

/** Cobra un PaymentIntent con la tarjeta de prueba de Stripe.
 *  El return_url es obligatorio al confirmar desde el SERVIDOR con
 *  automatic_payment_methods; en el navegador lo pone Stripe.js solo. */
const cobrar = (id) => stripe.paymentIntents.confirm(id, {
    payment_method: 'pm_card_visa',
    return_url: 'https://bisonte.test/retorno',
});

// ── arnes ────────────────────────────────────────────────────────────────────
let n = 0, ok = 0, mal = 0;
const fallos = [];
async function prueba(nombre, fn) {
    n++;
    try {
        await fn();
        console.log(`  ${String(n).padStart(2)}. ok    ${nombre}`);
        ok++;
    } catch (e) {
        console.log(`  ${String(n).padStart(2)}. FALLA ${nombre}\n          ${e.message}`);
        mal++;
        fallos.push(nombre);
    }
}
const debe = (c, m) => { if (!c) throw new Error(m); };
const igual = (a, b, m) => debe(String(a) === String(b), `${m}: esperaba ${b}, llego ${a}`);

// ── preparacion ──────────────────────────────────────────────────────────────
const login = await api('/api/login', { email: EMAIL, password: PASS });
if (!login.success) { console.error('No se pudo iniciar sesion:', login.error); process.exit(1); }
const CLIENTE = login.user.id;
console.log(`Sesion iniciada como cliente ${CLIENTE} (${login.user.client_code})`);
console.log(`Saldo de partida: $${(await saldo()).toFixed(2)}\n`);

// ═════════════════════════════════════════════════════════════════════════════
//  RECARGA — lo que el servidor NO se cree del navegador
// ═════════════════════════════════════════════════════════════════════════════

await prueba('el monto por debajo del minimo se rechaza', async () => {
    const r = await api('/api/credit/topup', { amount: 50, currency: 'MXN' });
    igual(r.http, 400, 'status');
    debe(!r.success, 'no deberia tener exito');
});

await prueba('el monto por encima del maximo se rechaza', async () => {
    const r = await api('/api/credit/topup', { amount: 50000, currency: 'MXN' });
    igual(r.http, 400, 'status');
});

await prueba('un monto que no es numero se rechaza', async () => {
    const r = await api('/api/credit/topup', { amount: 'mil pesos', currency: 'MXN' });
    igual(r.http, 400, 'status');
});

await prueba('sin sesion no se puede pedir una recarga', async () => {
    const r = await fetch(BASE + '/api/credit/topup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 500, currency: 'MXN' }),
    });
    // Aqui `r` es la Response cruda, no el resultado de api(): el codigo va en .status
    igual(r.status, 401, 'status');
});

let piRecarga;
await prueba('una recarga valida crea el cargo con su metadata', async () => {
    const r = await api('/api/credit/topup', { amount: 700, currency: 'MXN' });
    debe(r.success, r.error || 'deberia prepararse');
    igual(r.amount, 700, 'monto');
    piRecarga = r.clientSecret.split('_secret_')[0];
    const pi = await stripe.paymentIntents.retrieve(piRecarga);
    igual(pi.metadata.tipo, 'credit_topup', 'tipo');
    igual(pi.metadata.userId, CLIENTE, 'dueño');
    igual(pi.metadata.creditMXN, '700.00', 'credito');
    igual(pi.amount, 70000, 'centavos');
});

await prueba('el tipo de cambio no lo pone el navegador', async () => {
    // Mandar un rate absurdo no debe abaratar el cargo: el USD sale de getUsdRate().
    const r = await api('/api/credit/topup', { amount: 1000, currency: 'USD', usdRate: 0.0001, rate: 0.0001 });
    debe(r.success, r.error || 'deberia prepararse');
    igual(r.amount, 1000, 'el saldo abonado son 1000 pesos');
    debe(r.chargeAmount > 20 && r.chargeAmount < 100,
        `el cargo en USD deberia rondar los 50, llego ${r.chargeAmount}`);
});

await prueba('un pago que no es recarga no puede abonarse', async () => {
    const otro = await stripe.paymentIntents.create({
        amount: 50000, currency: 'mxn', payment_method_types: ['card'],
        metadata: { tipo: 'pedido', userId: String(CLIENTE), creditMXN: '500.00' },
    });
    await cobrar(otro.id);
    const r = await api('/api/credit/confirm', { paymentIntentId: otro.id });
    igual(r.http, 400, 'status');
    debe(!r.success, 'un cobro de pedido no puede convertirse en saldo');
});

await prueba('un pago de otro cliente no se abona al que lo manda', async () => {
    const ajeno = await stripe.paymentIntents.create({
        amount: 50000, currency: 'mxn', payment_method_types: ['card'],
        metadata: { tipo: 'credit_topup', userId: '999999', creditMXN: '500.00', cargoMoneda: 'MXN', cargoMonto: '500.00' },
    });
    await cobrar(ajeno.id);
    const r = await api('/api/credit/confirm', { paymentIntentId: ajeno.id });
    igual(r.http, 403, 'status');
});

await prueba('un pago sin cobrar todavia no abona nada', async () => {
    const sinPagar = await api('/api/credit/topup', { amount: 300, currency: 'MXN' });
    const id = sinPagar.clientSecret.split('_secret_')[0];
    const r = await api('/api/credit/confirm', { paymentIntentId: id });
    igual(r.http, 409, 'status'); igual(r.status, 'requires_payment_method', 'estado del pago');
    await stripe.paymentIntents.cancel(id);
});

await prueba('la recarga cobrada sube el saldo y deja su movimiento', async () => {
    const antes = await saldo();
    await cobrar(piRecarga);
    const r = await api('/api/credit/confirm', { paymentIntentId: piRecarga });
    debe(r.success, r.error || 'deberia abonar');
    igual(r.balance, antes + 700, 'saldo');
    igual(await saldo(), antes + 700, 'saldo en base');
    const m = await uno(
        'SELECT amount FROM credit_history WHERE cliente_id = ? ORDER BY id DESC LIMIT 1', [CLIENTE]);
    igual(m.amount, '700.00', 'movimiento');
});

await prueba('el mismo cobro no se abona dos veces', async () => {
    const antes = await saldo();
    const a = await api('/api/credit/confirm', { paymentIntentId: piRecarga });
    const b = await api('/api/credit/confirm', { paymentIntentId: piRecarga });
    debe(a.yaAplicado && b.yaAplicado, 'deberia decir que ya estaba aplicado');
    igual(await saldo(), antes, 'el saldo no puede moverse');
    const f = await uno('SELECT COUNT(*) c FROM credit_topups WHERE payment_intent_id = ?', [piRecarga]);
    igual(f.c, 1, 'filas en el libro');
});

// ═════════════════════════════════════════════════════════════════════════════
//  GASTO — el agujero que se corrigio
// ═════════════════════════════════════════════════════════════════════════════

let sale, creditoDelPedido, carrito;
await prueba('el checkout aplica el saldo disponible y baja el cobro', async () => {
    const disponible = await saldo();
    // Carrito por encima del saldo a proposito: aqui se prueba el camino CON
    // tarjeta, y el saldo tiene que quedarse corto para que haya algo que cobrar.
    carrito = await carritoQueSupere(disponible + 500);
    const r = await api('/api/checkout', {
        items: carrito.items, currency: 'MXN', shippingCost: ENVIO, saveCard: false,
    });
    debe(r.success, r.error || 'deberia prepararse');
    igual(r.appliedCredit, disponible, 'se aplica todo el saldo, que no alcanza');
    igual(r.totalCharge, round2(carrito.subtotal + ENVIO - disponible), 'lo que va a la tarjeta');
    creditoDelPedido = r.appliedCredit;
    globalThis.__secret = r.clientSecret;
});

await prueba('el saldo sale al REGISTRAR el pedido, no al capturarlo', async () => {
    const antes = await saldo();
    const pi = globalThis.__secret.split('_secret_')[0];
    await cobrar(pi);
    const r = await api('/api/checkout/confirm', {
        paymentIntentId: pi, items: carrito.items,
        userEmail: EMAIL, userName: 'Prueba', shippingMethod: 'envia',
        shipping_address: { calle: 'Prueba 1', ciudad: 'CDMX', cp: '01000' },
    });
    debe(r.success, r.error || 'deberia registrarse');
    sale = r.saleId;
    const o = await uno('SELECT pago_estado, credito_aplicado FROM bisonte_orders WHERE sale_id = ?', [sale]);
    igual(o.pago_estado, 'autorizado', 'el pedido aun no se ha capturado');
    igual(o.credito_aplicado, creditoDelPedido.toFixed(2), 'lo anotado');
    igual(await saldo(), antes - creditoDelPedido, 'y el saldo ya salio');
});

await prueba('un segundo pedido no puede gastar el saldo otra vez', async () => {
    // El saldo quedo en cero al registrar el pedido anterior. Con el codigo
    // viejo aqui volveria a aplicarse entero.
    igual(await saldo(), 0, 'el pedido anterior se llevo el saldo');
    const r = await api('/api/checkout', {
        items: carrito.items, currency: 'MXN', shippingCost: ENVIO, saveCard: false,
    });
    igual(r.appliedCredit, 0, 'no puede repetir el credito del pedido anterior');
    igual(r.totalCharge, round2(carrito.subtotal + ENVIO), 'la tarjeta paga el pedido entero');
});

await prueba('cancelar el pedido devuelve el saldo, y solo una vez', async () => {
    const antes = await saldo();
    const a = await api('/api/orders/capture', { saleId: sale, action: 'cancel', apiKey: process.env.CAPTURE_API_KEY });
    debe(a.success, a.error || 'deberia cancelarse');
    igual(await saldo(), antes + creditoDelPedido, 'el saldo vuelve');
    const b = await api('/api/orders/capture', { saleId: sale, action: 'cancel', apiKey: process.env.CAPTURE_API_KEY });
    igual(b.http, 409, 'el reintento no debe pasar');
    igual(await saldo(), antes + creditoDelPedido, 'y no puede devolver dos veces');
});

await prueba('el saldo puede pagar un pedido ENTERO', async () => {
    // El caso de uso central del saldo: cubrir la compra completa. Con envio
    // normal el pedido son $570 y el cliente tiene $700, asi que a la tarjeta
    // no le queda nada que cobrar -- y ahi es donde /api/checkout se cae.
    const disponible = await saldo();
    debe(disponible >= 350 + 220, `esta prueba necesita saldo de sobra, hay ${disponible}`);
    const r = await api('/api/checkout', {
        items: [{ id: PRODUCTO, quantity: 1 }], currency: 'MXN', shippingCost: 220, saveCard: false,
    });
    debe(r.success, r.error || 'no se puede comprar pagando solo con saldo');
    igual(r.totalCharge, 0, 'a la tarjeta no le toca nada');
});

let saleSaldo, creditoSaldo;
await prueba('el pedido sin cargo se registra y no inventa un pago en Stripe', async () => {
    const disponible = await saldo();
    const c = await api('/api/checkout', {
        items: [{ id: PRODUCTO, quantity: 1 }], currency: 'MXN', shippingCost: 220, saveCard: false,
    });
    debe(c.sinCargo, 'deberia venir marcado como sin cargo');
    debe(c.pedidoToken, 'y traer el token firmado');
    creditoSaldo = c.appliedCredit;

    const r = await api('/api/checkout/confirm', {
        pedidoToken: c.pedidoToken, items: [{ id: PRODUCTO, quantity: 1 }],
        userEmail: EMAIL, userName: 'Prueba', shippingMethod: 'envia',
        shipping_address: { calle: 'Prueba 1', ciudad: 'CDMX', cp: '01000' },
    });
    debe(r.success, r.error || 'deberia registrarse');
    saleSaldo = r.saleId;

    const o = await uno('SELECT payment_intent_id, pago_estado, credito_aplicado FROM bisonte_orders WHERE sale_id = ?', [saleSaldo]);
    debe(o.payment_intent_id.startsWith('saldo_'), `la referencia deberia ser propia, llego ${o.payment_intent_id}`);
    debe(!o.payment_intent_id.startsWith('pi_'), 'no puede fingir un PaymentIntent');
    igual(o.pago_estado, 'autorizado', 'estado');
    igual(o.credito_aplicado, creditoSaldo.toFixed(2), 'lo que se comio');
    igual(await saldo(), disponible - creditoSaldo, 'y el saldo salio de la cuenta');
});

await prueba('un token manipulado no registra ningun pedido', async () => {
    const c = await api('/api/checkout', {
        items: [{ id: PRODUCTO, quantity: 1 }], currency: 'MXN', shippingCost: 220, saveCard: false,
    });
    // Se cambia un caracter de la firma: el cuerpo sigue diciendo lo mismo pero
    // ya no lo avala nadie. Es la unica defensa que tiene este camino.
    const roto = c.pedidoToken.slice(0, -3) + (c.pedidoToken.endsWith('AAA') ? 'BBB' : 'AAA');
    const r = await api('/api/checkout/confirm', {
        pedidoToken: roto, items: [{ id: PRODUCTO, quantity: 1 }],
        userEmail: EMAIL, userName: 'Prueba', shippingMethod: 'envia',
    });
    igual(r.http, 400, 'status');
    debe(!r.success, 'una firma rota no puede crear un pedido');
});

await prueba('capturar el pedido sin cargo no le pide nada a Stripe', async () => {
    const antes = await saldo();
    const r = await api('/api/orders/capture', { saleId: saleSaldo, action: 'capture', apiKey: process.env.CAPTURE_API_KEY });
    debe(r.success, r.error || 'deberia capturarse');
    debe(r.sinCargo, 'deberia decir que no habia cargo');
    const o = await uno('SELECT pago_estado FROM bisonte_orders WHERE sale_id = ?', [saleSaldo]);
    igual(o.pago_estado, 'capturado', 'estado');
    igual(await saldo(), antes, 'capturar no mueve el saldo: ya se gasto');
});

await prueba('reembolsar el pedido sin cargo devuelve el saldo', async () => {
    const antes = await saldo();
    const r = await api('/api/orders/refund', { saleId: saleSaldo, apiKey: process.env.CAPTURE_API_KEY });
    debe(r.success, r.error || 'deberia reembolsarse');
    igual(await saldo(), antes + creditoSaldo, 'el saldo vuelve entero');
    const b = await api('/api/orders/refund', { saleId: saleSaldo, apiKey: process.env.CAPTURE_API_KEY });
    debe(b.alreadyRefunded, 'el reintento deberia verlo ya reembolsado');
    igual(await saldo(), antes + creditoSaldo, 'y no devolverlo dos veces');
});

await prueba('si al saldo le falta poco, la tarjeta paga el minimo y no menos', async () => {
    // El hueco entre 0 y el minimo de Stripe: dejar ahi el cargo era un
    // `amount_too_small` seguro. Ahora se aplica un poco menos de saldo.
    // El carrito se arma para dejar exactamente $5 por cobrar, que cae dentro
    // de ese hueco.
    const disponible = await saldo();
    const c = await carritoQueSupere(disponible - 500);
    const envio = round2(disponible + 5 - c.subtotal);
    debe(envio >= 10 && envio <= 2000, `el envio calculado (${envio}) se sale del rango permitido`);
    const r = await api('/api/checkout', {
        items: c.items, currency: 'MXN', shippingCost: envio, saveCard: false,
    });
    debe(r.success, r.error || 'deberia prepararse');
    igual(r.totalCharge, 10, 'la tarjeta paga el minimo de Stripe');
    igual(r.appliedCredit, round2(c.subtotal + envio - 10), 'y el saldo cubre el resto');
    debe(r.appliedCredit < disponible, 'se aplica un poco menos de saldo del que hay');
});

await prueba('el historial explica el saldo hasta el ultimo centavo', async () => {
    const s = await saldo();
    const h = await uno('SELECT COALESCE(SUM(amount),0) t FROM credit_history WHERE cliente_id = ?', [CLIENTE]);
    igual(Number(h.t), s, 'la suma del historial tiene que ser el saldo');
});

await prueba('el freno de recargas corta la insistencia', async () => {
    let cortado = false;
    for (let i = 0; i < 14; i++) {
        const r = await api('/api/credit/topup', { amount: 100, currency: 'MXN' });
        if (r.http === 429) { cortado = true; break; }
    }
    debe(cortado, 'tras varias seguidas deberia contestar 429');
});

// ── veredicto ────────────────────────────────────────────────────────────────
console.log(`\n  ${ok} pasaron, ${mal} fallaron, ${n} total`);
if (mal) console.log('  Fallos: ' + fallos.join(' | '));
console.log(`  Saldo final: $${(await saldo()).toFixed(2)}`);
await db.end();
process.exit(mal ? 1 : 0);
