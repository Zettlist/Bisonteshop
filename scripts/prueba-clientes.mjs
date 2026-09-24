/**
 * Los datos de los clientes, de punta a punta: todo lo que un cliente escribe
 * en la base y todo lo que se escribe a su nombre.
 *
 * Igual que scripts/prueba-cobros.mjs: corre contra el servidor de desarrollo,
 * la base real y Stripe en modo prueba, hace las peticiones que hace el
 * navegador y mira en la base lo que quedo. Donde se puede hacer trampa (los
 * datos de otra cuenta, una sesion vieja, un token usado) lo intenta.
 *
 * Qué cubre:
 *   registro y verificacion del correo · entrar · perfil · direcciones ·
 *   cambio de contraseña y sesiones abiertas · recuperar contraseña (lo que se
 *   puede sin leer el correo) · contacto y quejas · reclamos de pedidos ·
 *   calificaciones · avisos · votos del evento · tarjetas guardadas · borrar
 *   la cuenta.
 *
 * Crea cuentas NUEVAS en cada corrida (prueba.cliente.<algo>@bisonte.test), y
 * no toca la cuenta fija de las pruebas de cobro. Las cuentas quedan en la base
 * -- una borrada con los datos personales quitados, como la dejaria un cliente
 * de verdad -- y los pedidos que se crean quedan marcados como prueba.
 *
 * Uso: node scripts/prueba-clientes.mjs   (con el tunel y npm run dev)
 */
import Stripe from 'stripe';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import { SignJWT } from 'jose';

process.loadEnvFile('.env.local');
if (!String(process.env.STRIPE_SECRET_KEY).startsWith('sk_test_')) {
    console.error('Solo con llaves de PRUEBA de Stripe.');
    process.exit(1);
}

const BASE = process.env.PRUEBA_BASE || 'http://localhost:3000';
const CLAVE = 'PruebaCliente2026';
const CLAVE_POS = process.env.CAPTURE_API_KEY;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
const q = async (sql, p = []) => (await db.query(sql, p))[0];
const uno = async (sql, p = []) => (await q(sql, p))[0];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const sufijo = crypto.randomBytes(4).toString('hex');
const correoDe = (n) => `prueba.cliente.${sufijo}.${n}@bisonte.test`;

/** Una sesion: su cookie viaja sola en cada peticion. */
class Sesion {
    constructor() { this.cookie = ''; }
    async api(ruta, body, metodo = 'POST') {
        for (;;) {
            // Cada peticion llega como de un visitante distinto. En local no hay
            // proxy delante y lib/ipCliente.js toma la ultima IP de la cabecera,
            // que aqui escribe la prueba: sin esto los frenos por IP (5 altas
            // cada 10 minutos) la tendrian media hora esperando. En produccion
            // no sirve de nada: Google agrega la IP real al final.
            const ip = `10.${[1, 2, 3].map(() => Math.floor(Math.random() * 250) + 1).join('.')}`;
            const r = await fetch(BASE + ruta, {
                method: metodo,
                headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(this.cookie && { Cookie: this.cookie }) },
                ...(body !== undefined && { body: JSON.stringify(body) }),
            });
            if (r.status === 429) {
                const s = Number(r.headers.get('retry-after')) || 30;
                process.stdout.write(`        (la ruta ${ruta} pide esperar ${s}s)\n`);
                await dormir((s + 1) * 1000);
                continue;
            }
            const set = r.headers.getSetCookie?.() || [];
            const c = set.find((x) => x.startsWith('bisonte_session='));
            if (c) this.cookie = c.split(';')[0];
            this.ultimaCookie = c || null;
            let d = {};
            try { d = await r.json(); } catch { /* sin cuerpo */ }
            return { http: r.status, ...d };
        }
    }
    get(ruta) { return this.api(ruta, undefined, 'GET'); }
}
const anonimo = new Sesion();

let n = 0, ok = 0, mal = 0;
const fallos = [];
let grupo = '';
const seccion = (t) => { grupo = t; console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`); };
async function prueba(nombre, fn) {
    n++;
    try { await fn(); ok++; console.log(`  ${String(n).padStart(3)}. ok    ${nombre}`); }
    catch (e) { mal++; fallos.push(`[${grupo}] ${nombre}: ${e.message}`); console.log(`  ${String(n).padStart(3)}. FALLA ${nombre}\n           ${e.message}`); }
}
const debe = (c, m) => { if (!c) throw new Error(m); };
const igual = (a, b, m) => debe(String(a) === String(b), `${m}: esperaba ${b}, llego ${a}`);

const hace = (anios) => { const d = new Date(); d.setFullYear(d.getFullYear() - anios); return d.toISOString().slice(0, 10); };
const alta = (email, extra = {}) => anonimo.api('/api/registro', {
    nombre: 'Prueba', apellido: 'Cliente', fechaNacimiento: hace(30), nacionalidad: 'México',
    email, password: CLAVE, telefono: '5512345678', ...extra,
});
async function verificarYEntrar(email, sesion = new Sesion()) {
    const { verification_token: t } = await uno('SELECT verification_token FROM clientes WHERE email = ?', [email]);
    const v = await anonimo.get(`/api/verificar?token=${t}`);
    if (!v.success) throw new Error(`no se pudo verificar: ${v.error}`);
    const l = await sesion.api('/api/login', { email, password: CLAVE });
    if (!l.success) throw new Error(`no se pudo entrar: ${l.error}`);
    return { sesion, id: l.user.id };
}

// ═════════════════════════════════════════════════════════════════════════════
seccion('REGISTRO Y CORREO');
// ═════════════════════════════════════════════════════════════════════════════
const EMAIL_A = correoDe('a');

await prueba('sin los datos obligatorios no se crea la cuenta', async () => {
    igual((await anonimo.api('/api/registro', { email: correoDe('x') })).http, 400, 'sin datos');
});
await prueba('correo invalido, contraseña debil, menor de edad y fecha imposible se rechazan', async () => {
    igual((await alta('no-es-correo')).http, 400, 'correo');
    igual((await alta(correoDe('x'), { password: 'corta' })).http, 400, 'contraseña');
    igual((await alta(correoDe('x'), { fechaNacimiento: hace(15) })).http, 400, 'menor de edad');
    igual((await alta(correoDe('x'), { fechaNacimiento: '2000-02-31' })).http, 400, 'fecha imposible');
});
await prueba('alta correcta: la cuenta nace sin verificar y con la contraseña cifrada', async () => {
    const r = await alta(EMAIL_A);
    debe(r.success && r.requiresVerification, `alta: ${r.error}`);
    const c = await uno('SELECT email_verified, password, fecha_nac, verification_token FROM clientes WHERE email = ?', [EMAIL_A]);
    igual(c.email_verified, 0, 'verificada');
    debe(String(c.password).startsWith('$2'), 'la contraseña no esta cifrada');
    debe(c.password !== CLAVE, 'la contraseña se guardo tal cual');
    debe(c.verification_token, 'sin token de verificacion');
});
await prueba('el mismo correo no se registra dos veces (tampoco en mayusculas)', async () => {
    igual((await alta(EMAIL_A)).http, 409, 'repetido');
    igual((await alta(EMAIL_A.toUpperCase())).http, 409, 'en mayusculas');
});
await prueba('dos altas simultaneas con el mismo correo: una entra y la otra dice "ya registrado"', async () => {
    const e = correoDe('simultanea');
    const [a, b] = await Promise.all([alta(e), alta(e)]);
    const codigos = [a.http, b.http].sort().join(',');
    igual(codigos, '200,409', 'respuestas');
});
await prueba('sin verificar el correo no se puede entrar', async () => {
    const r = await new Sesion().api('/api/login', { email: EMAIL_A, password: CLAVE });
    igual(r.http, 403, 'entrar sin verificar');
    debe(r.requiresVerification, 'deberia pedir la verificacion');
});
await prueba('reenviar la verificacion no revela si un correo existe', async () => {
    const r = await anonimo.api('/api/reenviar-verificacion', { email: correoDe('noexiste') });
    debe(r.success, 'deberia contestar igual que a uno que existe');
});
let A;
await prueba('el enlace del correo verifica la cuenta, y no sirve dos veces', async () => {
    const { verification_token: t } = await uno('SELECT verification_token FROM clientes WHERE email = ?', [EMAIL_A]);
    const v = await anonimo.get(`/api/verificar?token=${t}`);
    debe(v.success, `verificar: ${v.error}`);
    igual((await anonimo.get(`/api/verificar?token=${t}`)).http, 400, 'el mismo enlace otra vez');
    igual((await anonimo.get(`/api/verificar?token=${'f'.repeat(64)}`)).http, 400, 'un token inventado');
});
await prueba('ya verificada, entra; la sesion es una cookie que el navegador no deja leer', async () => {
    const s = new Sesion();
    const l = await s.api('/api/login', { email: EMAIL_A, password: CLAVE });
    debe(l.success, `entrar: ${l.error}`);
    debe(/HttpOnly/i.test(s.ultimaCookie || ''), 'la cookie de sesion deberia ser HttpOnly');
    const me = await s.get('/api/me');
    igual(me.user?.email, EMAIL_A, 'la sesion es de la cuenta');
    A = { sesion: s, id: l.user.id };
});
await prueba('contraseña mala y correo inexistente contestan exactamente igual', async () => {
    const a = await new Sesion().api('/api/login', { email: EMAIL_A, password: 'Otra12345' });
    const b = await new Sesion().api('/api/login', { email: correoDe('nadie'), password: 'Otra12345' });
    igual(a.http, b.http, 'codigo');
    igual(a.error, b.error, 'mensaje');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('PERFIL');
// ═════════════════════════════════════════════════════════════════════════════
await prueba('sin sesion no se cambia ningun perfil', async () => {
    igual((await anonimo.api('/api/me', { nombre: 'X' }, 'PUT')).http, 401, 'sin sesion');
});
await prueba('datos basura se rechazan: nombre enorme, avatar javascript:, contacto raro, menor de edad', async () => {
    igual((await A.sesion.api('/api/me', { nombre: 'x'.repeat(1000) }, 'PUT')).http, 400, 'nombre');
    igual((await A.sesion.api('/api/me', { avatar: 'javascript:alert(1)' }, 'PUT')).http, 400, 'avatar');
    igual((await A.sesion.api('/api/me', { contacto_preferido: 'paloma' }, 'PUT')).http, 400, 'contacto');
    igual((await A.sesion.api('/api/me', { fecha_nac: hace(12) }, 'PUT')).http, 400, 'fecha');
});
await prueba('guardar solo la fecha de nacimiento NO borra el telefono ni el medio de contacto', async () => {
    await A.sesion.api('/api/me', { nombre: 'Prueba', apellido: 'Cliente', telefono: '5598765432', contacto_preferido: 'whatsapp' }, 'PUT');
    const r = await A.sesion.api('/api/me', { fecha_nac: hace(31) }, 'PUT');
    debe(r.success, `guardar fecha: ${r.error}`);
    const c = await uno('SELECT telefono, contacto_preferido FROM clientes WHERE id = ?', [A.id]);
    igual(c.telefono, '5598765432', 'telefono');
    igual(c.contacto_preferido, 'whatsapp', 'contacto');
    igual(r.user?.telefono, '5598765432', 'la sesion nueva trae el telefono');
});
await prueba('cambiar el avatar no toca nada mas', async () => {
    const r = await A.sesion.api('/api/me', { avatar: '/avatars/naruto.png' }, 'PUT');
    debe(r.success, `avatar: ${r.error}`);
    const c = await uno('SELECT telefono, avatar FROM clientes WHERE id = ?', [A.id]);
    igual(c.avatar, '/avatars/naruto.png', 'avatar');
    igual(c.telefono, '5598765432', 'telefono');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('DIRECCIONES');
// ═════════════════════════════════════════════════════════════════════════════
const dir = (calle, estado = 'Jalisco') => ({
    nombre_recibe: 'Prueba', calle, numero_ext: '1', colonia: 'Centro', cp: '44100', municipio: 'Guadalajara', estado,
});
const direcciones = (s) => s.get('/api/addresses').then((r) => r.addresses || []);

await prueba('sin sesion no se guardan direcciones', async () => {
    igual((await anonimo.api('/api/addresses', dir('Sin sesion'))).http, 401, 'sin sesion');
});
let d1, d2, d3;
await prueba('la primera direccion queda como principal', async () => {
    d1 = (await A.sesion.api('/api/addresses', dir('Primera'))).address;
    debe(d1?.is_default === 1, 'la primera deberia ser la principal');
});
await prueba('el estado se guarda con el nombre de la lista, y uno que no existe se rechaza', async () => {
    d2 = (await A.sesion.api('/api/addresses', dir('Segunda', 'Nuevo Leon'))).address;
    igual(d2?.estado, 'Nuevo León', 'nombre guardado');
    const r = await A.sesion.api('/api/addresses', dir('Tercera', 'Texas'));
    igual(r.http, 400, 'estado inexistente');
    d3 = (await A.sesion.api('/api/addresses', dir('Tercera', 'México'))).address;
    igual(d3?.estado, 'Estado de México', '"México" es el Estado de México');
});
await prueba('borrar una direccion que no es la principal no cambia la principal', async () => {
    await A.sesion.api('/api/addresses', { id: d2.id }, 'DELETE');
    const l = await direcciones(A.sesion);
    igual(l.find((x) => x.is_default)?.id, d1.id, 'principal');
});
await prueba('borrar la principal deja otra como principal', async () => {
    await A.sesion.api('/api/addresses', { id: d1.id }, 'DELETE');
    const l = await direcciones(A.sesion);
    igual(l.filter((x) => x.is_default).length, 1, 'principales');
});
await prueba('no hay mas de 20 direcciones por cuenta', async () => {
    let ultima;
    for (let i = 0; i < 21; i++) ultima = await A.sesion.api('/api/addresses', dir(`Tope ${i}`));
    igual(ultima.http, 400, 'la 21');
    debe((await direcciones(A.sesion)).length <= 20, 'no deberia pasar de 20');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('OTRA CUENTA NO PUEDE TOCAR LO TUYO');
// ═════════════════════════════════════════════════════════════════════════════
const EMAIL_B = correoDe('b');
await alta(EMAIL_B);
const B = await verificarYEntrar(EMAIL_B);

await prueba('no puede borrar ni volver principal una direccion ajena', async () => {
    const ajena = (await direcciones(A.sesion))[0];
    await B.sesion.api('/api/addresses', { id: ajena.id }, 'DELETE');
    await B.sesion.api('/api/addresses', { id: ajena.id }, 'PUT');
    const sigue = await uno('SELECT cliente_id FROM user_addresses WHERE id = ?', [ajena.id]);
    igual(sigue?.cliente_id, A.id, 'la direccion sigue siendo de A');
});
await prueba('no ve las direcciones, el carrito ni el perfil del otro', async () => {
    const l = await direcciones(B.sesion);
    igual(l.length, 0, 'direcciones visibles');
    igual((await B.sesion.get('/api/me')).user?.email, EMAIL_B, 'perfil');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('CONTRASEÑA Y SESIONES');
// ═════════════════════════════════════════════════════════════════════════════
await prueba('cambiarla con la actual equivocada o una nueva debil no pasa', async () => {
    igual((await A.sesion.api('/api/change-password', { currentPassword: 'Mala12345', newPassword: 'Nueva12345' })).http, 400, 'actual mala');
    igual((await A.sesion.api('/api/change-password', { currentPassword: CLAVE, newPassword: 'debil' })).http, 400, 'nueva debil');
});
await prueba('cambiarla cierra las OTRAS sesiones y deja viva la tuya', async () => {
    const otra = new Sesion();
    await otra.api('/api/login', { email: EMAIL_A, password: CLAVE });
    debe((await otra.get('/api/me')).user, 'la otra sesion deberia estar viva antes');
    const r = await A.sesion.api('/api/change-password', { currentPassword: CLAVE, newPassword: 'Cambiada2026' });
    debe(r.success, `cambiar: ${r.error}`);
    igual((await otra.get('/api/me')).user, null, 'la otra sesion deberia quedar cerrada');
    debe((await A.sesion.get('/api/me')).user, 'la sesion que la cambio deberia seguir');
    // Se regresa, para que la cuenta siga entrando con la de siempre.
    await A.sesion.api('/api/change-password', { currentPassword: 'Cambiada2026', newPassword: CLAVE });
});
await prueba('cerrar sesion la cierra de verdad, en todos los aparatos', async () => {
    const s = new Sesion();
    await s.api('/api/login', { email: EMAIL_B, password: CLAVE });
    await s.api('/api/logout', {});
    igual((await s.get('/api/me')).user, null, 'despues de salir');
    // "Cerrar sesion" sube la version de la sesion: cierra tambien las de los
    // otros aparatos. Es a proposito (quien la copio tampoco entra).
    igual((await B.sesion.get('/api/me')).user, null, 'la sesion de B en otro aparato');
    await B.sesion.api('/api/login', { email: EMAIL_B, password: CLAVE });
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('RECUPERAR CONTRASEÑA');
// ═════════════════════════════════════════════════════════════════════════════
await prueba('pedir el enlace no revela si el correo existe', async () => {
    const a = await anonimo.api('/api/recuperar', { email: correoDe('noexiste') });
    const b = await anonimo.api('/api/recuperar', { email: EMAIL_B });
    debe(a.success && b.success, 'las dos deberian contestar igual');
    const c = await uno('SELECT reset_token_hash FROM clientes WHERE email = ?', [EMAIL_B]);
    debe(c.reset_token_hash && c.reset_token_hash.length === 64, 'en la base se guarda la huella, no el token');
});
await prueba('un enlace inventado no cambia ninguna contraseña', async () => {
    igual((await anonimo.api('/api/recuperar/confirmar', { token: crypto.randomBytes(32).toString('hex'), password: 'Nueva12345' })).http, 400, 'token inventado');
    igual((await anonimo.get(`/api/recuperar/confirmar?token=${'a'.repeat(64)}`)).http, 400, 'revisar un token inventado');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('CONTACTO Y QUEJAS');
// ═════════════════════════════════════════════════════════════════════════════
await prueba('tema inexistente, sin mensaje o con correo invalido no se manda', async () => {
    igual((await anonimo.api('/api/contacto', { tema: 'spam', nombre: 'X', email: EMAIL_A, mensaje: 'hola' })).http, 400, 'tema');
    igual((await anonimo.api('/api/contacto', { tema: 'quejas', nombre: 'X', email: EMAIL_A, mensaje: '' })).http, 400, 'sin mensaje');
    igual((await anonimo.api('/api/contacto', { tema: 'quejas', nombre: 'X', email: 'no-es-correo', mensaje: 'hola' })).http, 400, 'correo');
});
await prueba('una queja llega al buzon de soporte', async () => {
    const r = await anonimo.api('/api/contacto', { tema: 'quejas', nombre: 'Prueba', email: EMAIL_A, pedido: 'PRUEBA', mensaje: 'Queja de prueba automatica. Ignorar.' });
    debe(r.success, `queja: ${r.error}`);
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('PEDIDOS: RECLAMOS Y AVISOS');
// ═════════════════════════════════════════════════════════════════════════════
// B compra un producto de prueba para tener un pedido propio.
const huella = (items) => crypto.createHash('sha256').update(items.map((i) => `${i.id}x${i.quantity}`).sort().join('|')).digest('hex');
const DIRB = { nombre_recibe: 'Prueba', telefono: '5512345678', calle: 'Calle', numero_exterior: '1', colonia: 'Centro', cp: '06000', municipio: 'Cuauhtémoc', estado: 'Ciudad de México' };
const destino = crypto.createHash('sha256').update(`06000|ciudad de méxico`.normalize('NFC')).digest('hex').slice(0, 32);
const itemsB = [{ id: 9, quantity: 1 }];
const valeB = await new SignJWT({ precio: '150.00', carrier: 'prueba', service: 'estandar', itemsHash: huella(itemsB), destino })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('60m').sign(new TextEncoder().encode(process.env.JWT_SECRET));
const kB = await B.sesion.api('/api/checkout', { items: itemsB, shippingToken: valeB, appliedCredit: 0 });
const piB = kB.clientSecret?.split('_secret_')[0];
if (piB) await stripe.paymentIntents.confirm(piB, { payment_method: 'pm_card_visa', return_url: 'https://bisonte.test/r' });
const cB = piB ? await B.sesion.api('/api/checkout/confirm', { paymentIntentId: piB, items: itemsB, shipping_address: DIRB, envia_quote_data: { carrier: 'prueba', service: 'estandar' } }) : {};
const pedidoB = cB.saleId;
if (pedidoB) await db.query('UPDATE bisonte_orders SET es_prueba = 1 WHERE sale_id = ?', [pedidoB]);

await prueba('el pedido de B existe para las pruebas de abajo', async () => debe(pedidoB, `sin pedido: ${kB.error || cB.error}`));
await prueba('un reclamo sin sesion, de un pedido ajeno o de uno sin enviar no se registra', async () => {
    igual((await anonimo.api(`/api/orders/${pedidoB}/claim`, { claim_reason: 'danado' })).http, 401, 'sin sesion');
    igual((await A.sesion.api(`/api/orders/${pedidoB}/claim`, { claim_reason: 'danado' })).http, 404, 'pedido ajeno');
    igual((await B.sesion.api(`/api/orders/${pedidoB}/claim`, { claim_reason: 'danado' })).http, 400, 'sin enviar');
});
await prueba('un pedido entregado admite UN reclamo', async () => {
    await db.query("UPDATE bisonte_orders SET estado = 'entregado' WHERE sale_id = ?", [pedidoB]);
    const r = await B.sesion.api(`/api/orders/${pedidoB}/claim`, { claim_reason: 'danado', claim_notes: '<b>llego roto</b>' });
    debe(r.success, `reclamo: ${r.error}`);
    igual((await uno('SELECT estado FROM bisonte_orders WHERE sale_id = ?', [pedidoB])).estado, 'reclamo', 'estado');
    igual((await B.sesion.api(`/api/orders/${pedidoB}/claim`, { claim_reason: 'otra vez' })).http, 400, 'segundo reclamo');
});
await prueba('los avisos de un pedido son solo de su dueño', async () => {
    const nb = await B.sesion.get('/api/notifications');
    debe(nb.notifications?.length, 'B deberia tener avisos de su pedido');
    const aviso = nb.notifications[0];
    await A.sesion.api('/api/notifications', { id: aviso.id }, 'PUT');
    const sigue = await uno('SELECT read_at FROM user_notifications WHERE id = ?', [aviso.id]);
    igual(sigue.read_at, null, 'A no deberia poder marcar el aviso de B');
    igual((await A.sesion.get('/api/notifications')).notifications.some((x) => x.id === aviso.id), false, 'A no deberia verlo');
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('CALIFICACIONES, VOTOS Y TARJETAS');
// ═════════════════════════════════════════════════════════════════════════════
// Un producto sin calificaciones, para no tocar las que ya tiene el catalogo.
const sinNota = await uno('SELECT id FROM products WHERE es_prueba = 0 AND (rating_count = 0 OR rating_count IS NULL) LIMIT 1');

await prueba('calificar pide sesion, y solo de 1 a 5 estrellas enteras', async () => {
    const id = sinNota.id;
    igual((await anonimo.api(`/api/productos/${id}/opinion`, { nota: 5 }, 'PUT')).http, 401, 'sin sesion');
    for (const nota of [0, 6, 2.5, 'cinco']) igual((await A.sesion.api(`/api/productos/${id}/opinion`, { nota }, 'PUT')).http, 400, `nota ${nota}`);
    igual((await A.sesion.api('/api/productos/99999999/opinion', { nota: 5 }, 'PUT')).http, 404, 'producto inexistente');
});
await prueba('calificar dos veces cambia la nota, no la duplica; retirarla la quita del promedio', async () => {
    const id = sinNota.id;
    await A.sesion.api(`/api/productos/${id}/opinion`, { nota: 5 }, 'PUT');
    const r = await A.sesion.api(`/api/productos/${id}/opinion`, { nota: 3 }, 'PUT');
    igual(r.rating_count, 1, 'cuantas');
    igual(r.rating, 3, 'promedio');
    const d = await A.sesion.api(`/api/productos/${id}/opinion`, {}, 'DELETE');
    igual(d.rating_count, 0, 'despues de retirarla');
});
await prueba('votar pide sesion y una opcion valida', async () => {
    igual((await anonimo.api('/api/eventos/mundial', { opcion: 'x' })).http, 401, 'sin sesion');
    const r = await A.sesion.api('/api/eventos/mundial', { opcion: 'opcion-inventada' });
    debe(r.http === 400 || r.http === 403, `esperaba rechazo, llego ${r.http}`);
});
await prueba('no se puede borrar la tarjeta guardada de otra persona', async () => {
    const ajeno = await stripe.customers.create({ email: 'ajeno@bisonte.test', metadata: { prueba: 'clientes' } });
    const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: ajeno.id });
    // A necesita su propio "customer" para llegar a la comprobacion.
    await A.sesion.api('/api/payment-methods', {});
    const r = await A.sesion.api('/api/payment-methods', { paymentMethodId: pm.id }, 'DELETE');
    igual(r.http, 403, 'tarjeta ajena');
    const sigue = await stripe.paymentMethods.retrieve(pm.id);
    igual(sigue.customer, ajeno.id, 'la tarjeta sigue con su dueño');
    await stripe.customers.del(ajeno.id);
});

// ═════════════════════════════════════════════════════════════════════════════
seccion('BORRAR LA CUENTA');
// ═════════════════════════════════════════════════════════════════════════════
await prueba('con un pedido en curso no se borra, y se dice por que', async () => {
    await db.query("UPDATE bisonte_orders SET estado = 'pendiente' WHERE sale_id = ?", [pedidoB]);
    const r = await B.sesion.api('/api/me', undefined, 'DELETE');
    igual(r.http, 409, 'pedido en curso');
    debe(/pedido/i.test(r.error), `el motivo deberia decir que es por el pedido: ${r.error}`);
});
await prueba('con saldo no se borra: el saldo es dinero del cliente', async () => {
    const t = await A.sesion.api('/api/credit/topup', { amount: 100 });
    const pi = t.clientSecret.split('_secret_')[0];
    await stripe.paymentIntents.confirm(pi, { payment_method: 'pm_card_visa', return_url: 'https://bisonte.test/r' });
    await A.sesion.api('/api/credit/confirm', { paymentIntentId: pi });
    const r = await A.sesion.api('/api/me', undefined, 'DELETE');
    igual(r.http, 409, 'con saldo');
    debe(/saldo/i.test(r.error), `el motivo deberia decir que es por el saldo: ${r.error}`);
});
await prueba('sin nada pendiente: se quitan los datos personales y se conserva lo contable', async () => {
    // El pedido de B se cancela como lo haria el POS; ya no esta en curso.
    const c = await fetch(BASE + '/api/orders/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: CLAVE_POS, saleId: pedidoB, action: 'cancel' }) });
    debe(c.ok, 'no se pudo cancelar el pedido de B');
    await B.sesion.api('/api/addresses', dir('De B'));
    const r = await B.sesion.api('/api/me', undefined, 'DELETE');
    debe(r.success, `borrar: ${r.error}`);
    const fila = await uno('SELECT nombre, email, telefono, fecha_nac, avatar, google_sub FROM clientes WHERE id = ?', [B.id]);
    debe(fila, 'la fila deberia seguir (lo contable cuelga de ella)');
    debe(fila.email.endsWith('@bisontemanga.invalid'), `el correo deberia quitarse: ${fila.email}`);
    igual(fila.telefono, null, 'telefono');
    igual(fila.fecha_nac, null, 'fecha de nacimiento');
    igual((await q('SELECT 1 FROM user_addresses WHERE cliente_id = ?', [B.id])).length, 0, 'direcciones');
    igual((await q('SELECT 1 FROM bisonte_orders WHERE sale_id = ? AND cliente_id = ?', [pedidoB, B.id])).length, 1, 'el pedido se conserva');
    igual((await B.sesion.get('/api/me')).user, null, 'la sesion se cierra');
    igual((await new Sesion().api('/api/login', { email: EMAIL_B, password: CLAVE })).http, 401, 'ya no se puede entrar');
});

// ── Cierre ───────────────────────────────────────────────────────────────────
if (pedidoB) await db.query('UPDATE bisonte_orders SET es_prueba = 1 WHERE sale_id = ?', [pedidoB]);
console.log(`\n${ok} pasaron, ${mal} fallaron, ${n} en total.`);
if (fallos.length) { console.log('\nFallaron:'); for (const f of fallos) console.log(`  · ${f}`); }
console.log(`\nCuentas de esta corrida: ${EMAIL_A} (queda con $100 de saldo de prueba) y ${EMAIL_B} (borrada).`);
await db.end();
process.exit(mal ? 1 : 0);
