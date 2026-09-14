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
import crypto from 'crypto';
import { SignJWT } from 'jose';

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

/**
 * Firma un vale de envio, como lo hace /api/shipping/quote.
 *
 * El costo de envio ya no viaja como numero: /api/checkout exige el vale
 * firmado de la cotizacion. Aqui se firma en vez de pedirselo al endpoint real
 * por dos razones: varias pruebas necesitan un costo EXACTO (la del hueco del
 * minimo de Stripe lo calcula al centavo, y Envia devuelve lo que devuelve), y
 * cotizar de verdad mete la disponibilidad de un tercero en cada corrida. La
 * cotizacion real tiene su propia prueba, mas abajo.
 *
 * La huella se replica en vez de importarse: lib/pricing.js entra por el alias
 * `@/lib/db`, que fuera de Next no resuelve. Si una cambia, la otra tiene que
 * cambiar — y la prueba de la cotizacion real es la que lo cazaria.
 */
const huellaDe = (items) => crypto.createHash('sha256')
    .update(items
        .map(i => `${Number(i.id)}x${Math.max(1, Math.min(Math.floor(Number(i.quantity) || 1), 99))}`)
        .sort().join('|'))
    .digest('hex');

// La direccion de las pruebas. Es una sola porque el vale ahora tambien ata el
// DESTINO: cotizar barato a la esquina y confirmar a la otra punta del pais era
// la mitad del agujero del envio que quedaba abierta.
const DIRECCION = { calle: 'Prueba 1', ciudad: 'CDMX', municipio: 'Cuauhtémoc', estado: 'Ciudad de México', cp: '01000' };

const destinoDe = (dir) => crypto.createHash('sha256')
    .update(`${String(dir?.cp ?? '').replace(/\D/g, '')}|${String(dir?.estado ?? '').trim().toLowerCase().normalize('NFC')}`)
    .digest('hex').slice(0, 32);

const valeEnvio = (items, precio, dir = DIRECCION) => new SignJWT({
    precio: Number(precio).toFixed(2),
    carrier: 'prueba',
    service: 'estandar',
    itemsHash: huellaDe(items),
    destino: destinoDe(dir),
})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('60m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));

/**
 * Sube el saldo hasta al menos `minimo`, con recargas de verdad.
 *
 * Las pruebas del pedido sin cargo necesitan que el saldo CUBRA el carrito, y
 * las del hueco del minimo de Stripe que lo cubra casi entero. El saldo de esta
 * cuenta cambia en cada corrida —las recargas suben, los reembolsos devuelven—,
 * asi que sin esto la misma prueba medía una cosa un dia y otra al siguiente:
 * con poco saldo el checkout devolvia un clientSecret donde la prueba esperaba
 * un token, y el fallo no señalaba a ningun bug.
 */
/**
 * Pide una recarga esperando al freno si hace falta.
 *
 * /api/credit/topup corta a 10 por minuto y por cliente. La suite hace mas que
 * eso desde que las pruebas del webhook necesitan cobros REALES —un `pi_`
 * inventado ya no sirve de nada, porque el webhook le pide el objeto a Stripe—,
 * y un 429 a mitad de la suite hacia fallar una prueba que no tenia nada roto.
 */
async function pedirRecarga(monto) {
    for (let intento = 0; intento < 4; intento++) {
        const t = await api('/api/credit/topup', { amount: monto, currency: 'MXN' });
        if (t.clientSecret) return t;
        if (t.http !== 429) throw new Error(`no se pudo recargar: ${t.error || t.http}`);
        const espera = (Number(String(t.error).match(/(\d+)/)?.[1]) || 10) + 2;
        await new Promise(r => setTimeout(r, espera * 1000));
    }
    throw new Error('el freno de recargas no se soltó');
}

async function asegurarSaldo(minimo) {
    let s = await saldo();
    while (s < minimo) {
        const falta = Math.min(10000, Math.max(100, Math.ceil(minimo - s)));
        const t = await pedirRecarga(falta);
        const pi = t.clientSecret.split('_secret_')[0];
        await cobrar(pi);
        const c = await api('/api/credit/confirm', { paymentIntentId: pi });
        if (!c.success) throw new Error(`no se pudo abonar: ${c.error || c.http}`);
        s = await saldo();
    }
    return s;
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
    // Sin cobrarlo. La comprobacion del dueño va ANTES que la del estado, asi
    // que el 403 sale igual — y cobrarlo tenia un efecto que no se veia desde
    // aqui: Stripe manda `payment_intent.succeeded` a TODOS los destinos de la
    // cuenta de prueba, produccion incluida. Alli el webhook intentaba abonarle
    // saldo al cliente 999999, que no existe, y se quedaba reintentando ese
    // evento durante dias. Cada pasada de esta prueba dejaba uno.
    const r = await api('/api/credit/confirm', { paymentIntentId: ajeno.id });
    igual(r.http, 403, 'status');
    await stripe.paymentIntents.cancel(ajeno.id);
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
        items: carrito.items, currency: 'MXN', shippingToken: await valeEnvio(carrito.items, ENVIO), saveCard: false,
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
        shipping_address: DIRECCION,
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
        items: carrito.items, currency: 'MXN', shippingToken: await valeEnvio(carrito.items, ENVIO), saveCard: false,
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
        items: [{ id: PRODUCTO, quantity: 1 }], currency: 'MXN', shippingToken: await valeEnvio([{ id: PRODUCTO, quantity: 1 }], 220), saveCard: false,
    });
    debe(r.success, r.error || 'no se puede comprar pagando solo con saldo');
    igual(r.totalCharge, 0, 'a la tarjeta no le toca nada');
});

let saleSaldo, creditoSaldo;
await prueba('el pedido sin cargo se registra y no inventa un pago en Stripe', async () => {
    const disponible = await saldo();
    const c = await api('/api/checkout', {
        items: [{ id: PRODUCTO, quantity: 1 }], currency: 'MXN', shippingToken: await valeEnvio([{ id: PRODUCTO, quantity: 1 }], 220), saveCard: false,
    });
    debe(c.sinCargo, 'deberia venir marcado como sin cargo');
    debe(c.pedidoToken, 'y traer el token firmado');
    creditoSaldo = c.appliedCredit;

    const r = await api('/api/checkout/confirm', {
        pedidoToken: c.pedidoToken, items: [{ id: PRODUCTO, quantity: 1 }],
        userEmail: EMAIL, userName: 'Prueba', shippingMethod: 'envia',
        shipping_address: DIRECCION,
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
    // El saldo tiene que cubrir el pedido entero: es lo que hace que /checkout
    // devuelva un token en vez de un clientSecret, y el token es lo que esta
    // prueba manipula.
    const p = await uno('SELECT sale_price FROM products WHERE id = ?', [PRODUCTO]);
    await asegurarSaldo(round2(Number(p.sale_price) + 220 + 50));
    const c = await api('/api/checkout', {
        items: [{ id: PRODUCTO, quantity: 1 }], currency: 'MXN', shippingToken: await valeEnvio([{ id: PRODUCTO, quantity: 1 }], 220), saveCard: false,
    });
    debe(c.sinCargo && c.pedidoToken, c.error || 'el saldo deberia cubrir el pedido entero');
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
    //
    // El carrito se arma con el articulo MAS BARATO y no con `carritoQueSupere`:
    // aquel apila los caros primero, y con articulos de $750 el salto entre una
    // cantidad y la siguiente es mayor que la ventana de envio que la tienda
    // acepta ($10–$2000). El envio salia negativo y la prueba fallaba sin que
    // hubiera nada roto.
    const disponible = await asegurarSaldo(1500);
    const art = await uno(
        'SELECT id, sale_price, stock FROM products WHERE stock > 0 AND sale_price > 0 ORDER BY sale_price ASC LIMIT 1');
    const precio = Number(art.sale_price);
    const cant = Math.max(1, Math.min(99, Number(art.stock), Math.floor((disponible - 500) / precio)));
    const subtotal = round2(precio * cant);
    const envio = round2(disponible + 5 - subtotal);
    // Ya no hay rango que respetar: el envio es el que diga la cotizacion
    // firmada, y aqui la firma esta prueba. Antes el servidor lo acotaba entre
    // $10 y $2,000 — precisamente porque se creia el numero del navegador.
    debe(envio > 0, `el envio calculado (${envio}) tiene que ser positivo`);
    const r = await api('/api/checkout', {
        items: [{ id: art.id, quantity: cant }], currency: 'MXN', shippingToken: await valeEnvio([{ id: art.id, quantity: cant }], envio), saveCard: false,
    });
    debe(r.success, r.error || 'deberia prepararse');
    igual(r.totalCharge, 10, 'la tarjeta paga el minimo de Stripe');
    igual(r.appliedCredit, round2(subtotal + envio - 10), 'y el saldo cubre el resto');
    debe(r.appliedCredit < disponible, 'se aplica un poco menos de saldo del que hay');
});

// ═════════════════════════════════════════════════════════════════════════════
//  LO QUE SE PAGA Y LO QUE SE EMPACA — tienen que ser el mismo carrito
// ═════════════════════════════════════════════════════════════════════════════

await prueba('confirmar un pedido exige sesion', async () => {
    // /api/checkout/confirm registra pedidos y gasta saldo, y durante mucho
    // tiempo no miro la cookie: le bastaba un PaymentIntent valido. El id de un
    // PaymentIntent viaja al navegador dentro del clientSecret, asi que no es
    // ningun secreto.
    const r = await fetch(BASE + '/api/checkout/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: 'pi_loquesea', items: [{ id: PRODUCTO, quantity: 1 }] }),
    });
    igual(r.status, 401, 'status');
});

await prueba('no se puede confirmar un carrito distinto al que se pago', async () => {
    // El agujero: los importes venian del servidor pero los RENGLONES venian
    // del navegador. Se cotizaba un carrito, se autorizaba su importe y se
    // confirmaba otro; la venta quedaba por lo cotizado y el POS empacaba lo
    // confirmado. Medido: $470 cobrados, $1,500 de mercancia.
    //
    // El carrito tiene que SUPERAR el saldo para que el pago pase por la
    // tarjeta: si el saldo lo cubre entero no hay PaymentIntent, y ese camino
    // (el del token firmado) ya lo cubre la prueba del token manipulado.
    const c = await carritoQueSupere(await saldo());
    const ck = await api('/api/checkout', {
        items: c.items, currency: 'MXN', shippingToken: await valeEnvio(c.items, 220), saveCard: false,
    });
    debe(ck.clientSecret, ck.error || 'deberia crear el PaymentIntent');
    const pi = ck.clientSecret.split('_secret_')[0];
    await cobrar(pi);

    // Se confirma el mismo carrito con una unidad de mas: mercancia que nadie
    // pago. Es la forma exacta del ataque.
    const inflado = c.items.map((it, k) => k === 0 ? { ...it, quantity: it.quantity + 1 } : it);
    const r = await api('/api/checkout/confirm', {
        paymentIntentId: pi, items: inflado,
        userEmail: EMAIL, userName: 'Prueba', shippingMethod: 'envia',
    });
    igual(r.http, 409, 'status');
    debe(!r.success, 'un carrito cambiado no puede registrar pedido');
    const hay = await uno('SELECT COUNT(*) n FROM bisonte_orders WHERE payment_intent_id = ?', [pi]);
    igual(hay.n, 0, 'no debe quedar ningun pedido registrado');
    await stripe.paymentIntents.cancel(pi).catch(() => { });
});

await prueba('el carrito que SI se pago se confirma sin problema', async () => {
    // El reverso de la anterior: la comprobacion nueva no puede estorbar al
    // pedido honesto.
    //
    // El envio va distinto del de la prueba anterior a proposito: entra en la
    // llave de idempotencia, y con el mismo carrito y el mismo envio Stripe
    // devolveria aquel PaymentIntent — que aquella prueba dejo cancelado.
    const c = await carritoQueSupere(await saldo());
    const ck = await api('/api/checkout', {
        items: c.items, currency: 'MXN', shippingToken: await valeEnvio(c.items, 230), saveCard: false,
    });
    debe(ck.clientSecret, ck.error || 'deberia crear el PaymentIntent');
    const pi = ck.clientSecret.split('_secret_')[0];
    await cobrar(pi);
    const r = await api('/api/checkout/confirm', {
        paymentIntentId: pi, items: c.items,
        shippingMethod: 'envia', shipping_address: DIRECCION,
    });
    debe(r.success, r.error || 'el pedido legitimo deberia registrarse');

    // Y lo que quedo en sale_items es lo que se cotizo, renglon por renglon.
    const [renglones] = await db.query(
        'SELECT product_id, quantity FROM sale_items WHERE sale_id = ? ORDER BY product_id', [r.saleId]);
    const esperado = [...c.items].map(i => `${i.id}x${i.quantity}`).sort().join('|');
    const llego = renglones.map(x => `${x.product_id}x${x.quantity}`).sort().join('|');
    igual(llego, esperado, 'los renglones guardados');

    await api('/api/orders/capture', { saleId: r.saleId, action: 'cancel', apiKey: process.env.CAPTURE_API_KEY });
});

await prueba('el envio no lo pone el navegador', async () => {
    // El agujero: el costo de envio llegaba como numero suelto y aqui solo se
    // comprobaba que cayera entre $10 y $2,000. Mandar 10 donde la cotizacion
    // decia 220 le costaba a la tienda los $210 de diferencia, que se le pagan
    // a la paqueteria igual.
    const items = [{ id: PRODUCTO, quantity: 1 }];
    const r = await api('/api/checkout', {
        items, currency: 'MXN', shippingCost: 10, saveCard: false,   // como antes
    });
    igual(r.http, 400, 'status');
    debe(r.envioInvalido, 'deberia decir que el envio no vale');
});

await prueba('un vale de envio inventado no cuela', async () => {
    const items = [{ id: PRODUCTO, quantity: 1 }];
    const bueno = await valeEnvio(items, 220);
    // Se le cambia el final a la firma: el cuerpo sigue diciendo $220 pero ya
    // no lo avala el servidor.
    const roto = bueno.slice(0, -3) + (bueno.endsWith('AAA') ? 'BBB' : 'AAA');
    const r = await api('/api/checkout', { items, currency: 'MXN', shippingToken: roto, saveCard: false });
    igual(r.http, 400, 'status');
    debe(r.envioInvalido, 'una firma rota no puede fijar el envio');
});

await prueba('el vale de un carrito no sirve para otro', async () => {
    // El precio del envio depende del tamaño del paquete: el vale barato de un
    // solo manga no puede pagar el envio de una caja de veinte.
    const uno = [{ id: PRODUCTO, quantity: 1 }];
    const veinte = [{ id: PRODUCTO, quantity: 20 }];
    const r = await api('/api/checkout', {
        items: veinte, currency: 'MXN', shippingToken: await valeEnvio(uno, 220), saveCard: false,
    });
    igual(r.http, 409, 'status');
    debe(r.envioInvalido, 'deberia rechazar el vale de otro carrito');
});

await prueba('la cotizacion real viene firmada y el checkout la acepta', async () => {
    // La unica prueba que pasa por Envia. Vale la pena aunque dependa de un
    // tercero: es lo que caza que la huella que firma /api/shipping/quote y la
    // que compara /api/checkout dejen de coincidir.
    const items = [{ id: PRODUCTO, quantity: 1 }];
    const q = await api('/api/shipping/quote', {
        items,
        destination: {
            nombre_recibe: 'Prueba', telefono: '8110000000', calle: 'Reforma',
            numero_exterior: '100', colonia: 'Centro', cp: '64000',
            municipio: 'Monterrey', estado: 'Nuevo León',
        },
    });
    debe(q.success && q.carriers?.length, q.error || 'Envia no devolvio opciones');
    const opcion = q.carriers[0];
    debe(opcion.vale, 'cada opcion tiene que venir firmada');

    const r = await api('/api/checkout', {
        items, currency: 'MXN', shippingToken: opcion.vale, saveCard: false,
    });
    debe(r.success, r.error || 'el vale de la cotizacion real deberia valer');
    // Y el envio que se cobra es el cotizado, ni mas ni menos.
    const esperado = round2(r.appliedCredit + r.totalCharge);
    const p = await uno('SELECT sale_price FROM products WHERE id = ?', [PRODUCTO]);
    igual(esperado, round2(Number(p.sale_price) + opcion.price), 'el total lleva el envio cotizado');
    if (r.clientSecret) await stripe.paymentIntents.cancel(r.clientSecret.split('_secret_')[0]).catch(() => { });
});

// ═════════════════════════════════════════════════════════════════════════════
//  EL WEBHOOK — lo que Stripe cuenta cuando el navegador no esta
// ═════════════════════════════════════════════════════════════════════════════

/** Manda un evento a /api/stripe/webhook firmado como lo firma Stripe. */
async function webhook(tipo, objeto, { secreto = process.env.STRIPE_WEBHOOK_SECRET } = {}) {
    const cuerpo = JSON.stringify({
        id: `evt_prueba_${crypto.randomBytes(8).toString('hex')}`,
        type: tipo,
        data: { object: objeto },
    });
    const firma = stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: secreto });
    const r = await fetch(BASE + '/api/stripe/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'stripe-signature': firma },
        body: cuerpo,
    });
    return { http: r.status, cuerpo: await r.text() };
}

/** Un cobro de recarga REAL, ya pagado. Devuelve su id.
 *  Los eventos ya no se pueden inventar: el webhook le pide el objeto a Stripe
 *  y solo usa el id del cuerpo, asi que una prueba con un `pi_` de mentira solo
 *  probaria que Stripe contesta 404. */
async function recargaPagada(monto) {
    const t = await pedirRecarga(monto);
    const pi = t.clientSecret.split('_secret_')[0];
    await cobrar(pi);
    return pi;
}

/** El cuerpo tal cual lo manda Stripe en el estilo completo. */
const eventoDe = (id, extra = {}) => ({ id, object: 'payment_intent', status: 'succeeded', ...extra });

await prueba('sin firma el webhook no escucha a nadie', async () => {
    const antes = await saldo();
    const r = await fetch(BASE + '/api/stripe/webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'payment_intent.succeeded', data: { object: eventoDe('pi_sinfirma') } }),
    });
    igual(r.status, 400, 'status');
    igual(await saldo(), antes, 'y desde luego no abona nada');
});

await prueba('una firma de otro secreto no cuela', async () => {
    // Es el caso real de mezclar el secreto de pruebas con el de produccion, y
    // el de alguien que descubra la URL — que es publica.
    const antes = await saldo();
    const r = await webhook('payment_intent.succeeded', eventoDe('pi_secretomalo'),
        { secreto: 'whsec_este_no_es' });
    igual(r.http, 400, 'status');
    igual(await saldo(), antes, 'el saldo no se mueve');
});

await prueba('el secreto de firma filtrado no basta para regalarse saldo', async () => {
    // Un secreto de firma es una cadena que vive en dos paneles y una variable
    // de entorno: se copia mal, se pega donde no debe, se queda en un
    // historial. Si el webhook se creyera la metadata del cuerpo, quien lo
    // tuviera firmaria un cobro inventado por el monto que quisiera.
    //
    // El evento va firmado CORRECTAMENTE. Lo unico falso es el contenido.
    const antes = await saldo();
    const r = await webhook('payment_intent.succeeded', eventoDe('pi_inventado_por_el_atacante', {
        metadata: {
            userId: String(CLIENTE), tipo: 'credit_topup',
            creditMXN: '99999.00', cargoMoneda: 'MXN', cargoMonto: '99999.00',
        },
    }));
    debe(r.http >= 400, `deberia fallar al buscar el cobro en Stripe, contesto ${r.http}`);
    igual(await saldo(), antes, 'no se abona un peso');
});

await prueba('un monto inflado sobre un cobro real tampoco cuela', async () => {
    // La version fina del ataque anterior: el cobro SI existe (son $100), pero
    // el evento firmado dice que fueron $50,000. El webhook usa el objeto que
    // le da Stripe, no el del cuerpo.
    const antes = await saldo();
    const pi = await recargaPagada(100);
    const r = await webhook('payment_intent.succeeded', eventoDe(pi, {
        metadata: {
            userId: String(CLIENTE), tipo: 'credit_topup',
            creditMXN: '50000.00', cargoMoneda: 'MXN', cargoMonto: '50000.00',
        },
    }));
    igual(r.http, 200, 'status');
    igual(await saldo(), round2(antes + 100), 'sube lo que se cobro de verdad, no lo que decia el evento');
});

await prueba('el webhook abona la recarga que el navegador nunca aviso', async () => {
    // El caso entero por el que existe: Stripe cobro y la pestaña se cerro.
    const antes = await saldo();
    const pi = await recargaPagada(500);
    const r = await webhook('payment_intent.succeeded', eventoDe(pi));
    igual(r.http, 200, 'status');
    igual(await saldo(), round2(antes + 500), 'el saldo sube sin que el navegador diga nada');
    const mov = await uno(
        'SELECT amount FROM credit_history WHERE cliente_id = ? ORDER BY id DESC LIMIT 1', [CLIENTE]);
    igual(Number(mov.amount), 500, 'y deja su movimiento en el historial');
});

await prueba('el mismo aviso dos veces no abona dos veces', async () => {
    // Stripe reintenta cuando duda de la respuesta, asi que este caso NO es
    // hipotetico: el mismo evento llega varias veces por diseño.
    const pi = await recargaPagada(300);
    await webhook('payment_intent.succeeded', eventoDe(pi));
    const despuesDeUna = await saldo();
    const r = await webhook('payment_intent.succeeded', eventoDe(pi));
    igual(r.http, 200, 'la segunda tambien contesta 200');
    igual(await saldo(), despuesDeUna, 'pero el saldo no se mueve otra vez');
});

await prueba('el navegador y el webhook no abonan el mismo cobro dos veces', async () => {
    // Los dos caminos corriendo a la vez sobre el MISMO cobro: es lo normal, no
    // la excepcion. Stripe avisa mientras la pagina tambien esta avisando.
    const pi = await recargaPagada(400);
    const antes = await saldo();
    const [porNavegador, porStripe] = await Promise.all([
        api('/api/credit/confirm', { paymentIntentId: pi }),
        webhook('payment_intent.succeeded', eventoDe(pi)),
    ]);
    debe(porNavegador.success, porNavegador.error || 'el navegador deberia poder abonar');
    igual(porStripe.http, 200, 'y el webhook contestar 200');
    igual(await saldo(), round2(antes + 400), 'pero el abono es UNO');
});

await prueba('dos avisos SIMULTANEOS del mismo cobro no rompen nada', async () => {
    // La version dura de la prueba anterior: no seguidos, a la vez. Dos
    // transacciones abiertas sobre la misma fila.
    //
    // Aqui salio un fallo de verdad, en produccion: la comprobacion de "¿ya
    // estaba?" se hacia DENTRO de la transaccion, y en REPEATABLE READ la fila
    // que otro proceso acababa de confirmar no se ve. El choque del UNIQUE se
    // leia como "no se pudo guardar" y el webhook contestaba 500.
    //
    // Depende del reloj, asi que no siempre reproduce el caso. Cuando falla,
    // falla por algo real.
    const pi = await recargaPagada(200);
    const antes = await saldo();
    const dos = await Promise.all([
        webhook('payment_intent.succeeded', eventoDe(pi)),
        webhook('payment_intent.succeeded', eventoDe(pi)),
    ]);
    for (const [i, r] of dos.entries()) igual(r.http, 200, `el aviso ${i + 1} deberia contestar 200`);
    igual(await saldo(), round2(antes + 200), 'y el abono es UNO');
});

await prueba('el cobro de un pedido no se convierte en saldo', async () => {
    // Sin el filtro por tipo, el cobro de cualquier compra de mercancia seria
    // saldo regalado en cuanto Stripe avisara de el. Se usa un PaymentIntent de
    // checkout de verdad, que es justo el que un atacante tendria a mano.
    const c = await carritoQueSupere(await saldo());
    const ck = await api('/api/checkout', {
        items: c.items, currency: 'MXN', shippingToken: await valeEnvio(c.items, 220), saveCard: false,
    });
    debe(ck.clientSecret, ck.error || 'deberia crear el PaymentIntent');
    const pi = ck.clientSecret.split('_secret_')[0];

    const antes = await saldo();
    const r = await webhook('payment_intent.succeeded', eventoDe(pi));
    igual(r.http, 200, 'se acepta el evento');
    igual(await saldo(), antes, 'pero no abona nada');
    await stripe.paymentIntents.cancel(pi).catch(() => { });
});

await prueba('un evento que no nos interesa se acepta y se ignora', async () => {
    // 200 y no 4xx: si contestaramos error, Stripe marcaria el destino como
    // roto y dejaria de mandarnos tambien los que si importan.
    const r = await webhook('customer.subscription.updated', { id: 'sub_loquesea' });
    igual(r.http, 200, 'status');
});

await prueba('la clave del POS no se compara caracter por caracter', async () => {
    // Con una clave mala la respuesta tiene que ser 401 igual de rapido sea
    // cual sea el prefijo acertado: si el tiempo dependiera de cuantos
    // caracteres coinciden, la clave se adivina de izquierda a derecha.
    const real = process.env.CAPTURE_API_KEY;
    const casi = real.slice(0, -1) + (real.endsWith('z') ? 'y' : 'z');
    for (const mala of ['x', casi, '']) {
        const r = await api('/api/orders/capture', { saleId: 1, action: 'cancel', apiKey: mala });
        igual(r.http, 401, `clave "${String(mala).slice(0, 4)}..." deberia dar 401`);
    }
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


// ── Puntos de entrada: lo que llega del navegador ────────────────────────────

await prueba('el carrito de otra persona no se lee ni se escribe sin sesion', async () => {
    // Sin cookie: es la peticion que hacia cualquiera desde fuera. Antes el
    // dueño del carrito salia del `?userId=` de la URL y del cuerpo, asi que
    // esto devolvia la lista de la compra de quien fuera, y la sobreescribia.
    const leer = await fetch(`${BASE}/api/cart?userId=${CLIENTE}`);
    const d = await leer.json();
    debe(Array.isArray(d.items) && d.items.length === 0,
        'sin sesion no puede salir el carrito de nadie');

    const escribir = await fetch(`${BASE}/api/cart`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: CLIENTE, items: [{ id: PRODUCTO, quantity: 7 }] }),
    });
    igual(escribir.status, 401, 'escribir sin sesion');

    // Y con sesion, el `userId` del cuerpo se ignora: manda la cookie.
    const mio = await api('/api/cart', { userId: 999999, items: [{ id: PRODUCTO, quantity: 2 }] });
    debe(mio.success, mio.error || 'con sesion si deberia guardar');
    const fila = await uno(
        `SELECT ci.quantity FROM cart_items ci
           JOIN carts c ON c.id = ci.cart_id
          WHERE c.cliente_id = ? AND c.estado = 'activo' AND ci.product_id = ?
          ORDER BY ci.id DESC LIMIT 1`, [CLIENTE, PRODUCTO]);
    debe(fila && Number(fila.quantity) === 2, 'el carrito guardado tiene que ser el de la sesion');
});

await prueba('una cantidad absurda en el carrito se acota antes de guardarse', async () => {
    await api('/api/cart', { items: [{ id: PRODUCTO, quantity: -50 }] });
    const fila = await uno(
        `SELECT ci.quantity FROM cart_items ci
           JOIN carts c ON c.id = ci.cart_id
          WHERE c.cliente_id = ? AND c.estado = 'activo' AND ci.product_id = ?
          ORDER BY ci.id DESC LIMIT 1`, [CLIENTE, PRODUCTO]);
    debe(fila && Number(fila.quantity) === 1, `una cantidad negativa deberia quedar en 1, quedo ${fila?.quantity}`);
});

await prueba('la fecha de nacimiento escrita de otra forma no salta el corte de 18', async () => {
    // '20150615' es Invalid Date en JavaScript — la edad salia NaN y NaN < 18
    // es false, asi que pasaba — pero MySQL lo guarda tan campante como
    // 2015-06-15. Once años en una tienda +18.
    const r = await fetch(`${BASE}/api/registro`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nombre: 'Menor', apellido: 'DePrueba', fechaNacimiento: '20150615',
            email: `menor.${Date.now()}@bisonte.test`, password: 'NoDeberia2026',
        }),
    });
    igual(r.status, 400, 'deberia rechazarse');
    const cuantos = await uno(
        "SELECT COUNT(*) n FROM clientes WHERE email LIKE 'menor.%@bisonte.test'", []);
    igual(Number(cuantos.n), 0, 'y no puede quedar ninguna cuenta creada');
});

await prueba('el login no dice cuales correos tienen cuenta', async () => {
    const inexistente = await fetch(`${BASE}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `nadie.${Date.now()}@bisonte.test`, password: 'LoQueSea2026' }),
    });
    const real = await fetch(`${BASE}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: 'ContraseñaMala2026' }),
    });
    igual(inexistente.status, real.status, 'el codigo de respuesta tiene que ser el mismo');
    igual((await inexistente.json()).error, (await real.json()).error, 'y el mensaje tambien');
});

await prueba('el envio cotizado a un destino no sirve para mandarlo a otro', async () => {
    const items = [{ id: PRODUCTO, quantity: 1 }];
    const p = await uno('SELECT sale_price FROM products WHERE id = ?', [PRODUCTO]);
    await asegurarSaldo(round2(Number(p.sale_price) + 220 + 50));

    // Se cotiza a la direccion de siempre y se confirma con otra: mismo
    // carrito, mismo vale autentico, distinto codigo postal. El envio barato de
    // la esquina pagando el paquete a la otra punta del pais.
    const c = await api('/api/checkout', {
        items, currency: 'MXN', shippingToken: await valeEnvio(items, 220), saveCard: false,
    });
    debe(c.sinCargo && c.pedidoToken, c.error || 'el saldo deberia cubrirlo entero');

    const lejos = { ...DIRECCION, cp: '22000', estado: 'Baja California' };
    const r = await api('/api/checkout/confirm', {
        pedidoToken: c.pedidoToken, items, shippingMethod: 'envia', shipping_address: lejos,
    });
    igual(r.http, 409, 'deberia rechazarse');
    debe(r.envioInvalido, 'y decir que hay que volver a elegir el envio');
});

// ── veredicto ────────────────────────────────────────────────────────────────
console.log(`\n  ${ok} pasaron, ${mal} fallaron, ${n} total`);
if (mal) console.log('  Fallos: ' + fallos.join(' | '));
console.log(`  Saldo final: $${(await saldo()).toFixed(2)}`);
await db.end();
process.exit(mal ? 1 : 0);
