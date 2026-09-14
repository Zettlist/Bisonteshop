/**
 * Pruebas de extremo a extremo de la recuperacion de contrasena.
 *
 * Levanta un MySQL efimero con db/schema.sql, siembra cuentas y arranca un
 * `next dev` propio contra esa base. Produccion no se toca en ningun momento: la
 * unica razon de montar todo esto es poder crear y romper cuentas sin miedo.
 *
 *   node tests/recuperar-e2e.mjs        (desde db/)
 *   VERBOSO=1 node tests/recuperar-e2e.mjs   para ver la salida del servidor
 *
 * Next 16 no deja dos servidores de desarrollo en el mismo directorio: si hay
 * uno corriendo en el 3000, hay que pararlo antes.
 *
 * Cada prueba usa SU cuenta y SU direccion IP. No es manía: los limites de
 * peticiones son parte de lo que se prueba, y compartirlos entre casos haria que
 * el cuarto test agotara el cupo y los demas fallaran por un motivo que no es el
 * suyo. Asi cada caso empieza limpio y los dos tests del final pueden apretar
 * los limites a proposito.
 */
import { createDB } from 'mysql-memory-server';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** La raiz del repo, para no depender de desde donde se lance. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PUERTO = 3101;
const BASE = `http://127.0.0.1:${PUERTO}`;
const VIEJA = 'ClaveVieja1';
const NUEVA = 'ClaveNueva9';

let db, conn, servidor, empresaId;
const resultados = [];
const VERBOSO = process.env.VERBOSO === '1';

const ok = (nombre) => { resultados.push([true, nombre]); console.log(`  ok    ${nombre}`); };
const falla = (nombre, detalle) => {
    resultados.push([false, nombre]);
    console.log(`  FALLA ${nombre}\n          ${detalle}`);
};

async function prueba(nombre, fn) {
    try { await fn(); ok(nombre); }
    catch (e) { falla(nombre, e.message); }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEqual(a, b, msg) {
    if (String(a) !== String(b)) throw new Error(`${msg}: esperaba ${b}, llego ${a}`);
}

// ── Peticiones ──────────────────────────────────────────────────────────────
let ipN = 0;
/** Una IP distinta por llamada, salvo que se pida una concreta. */
const nuevaIp = () => `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}`;

const post = async (ruta, cuerpo, ip = nuevaIp()) => {
    const r = await fetch(`${BASE}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(cuerpo),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
};

const get = async (ruta) => {
    const r = await fetch(`${BASE}${ruta}`, { headers: { 'x-forwarded-for': nuevaIp() } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
};

/** El token no se puede leer de la base (solo esta su hash) ni del correo (no
 *  hay Resend en pruebas). Se lee del log de desarrollo del servidor, que es
 *  para lo que existe esa linea. */
let ultimoToken = null;

// ── Montaje ─────────────────────────────────────────────────────────────────
async function arrancar() {
    // Si el puerto esta ocupado, `next dev` no arranca y las pruebas irian a
    // parar a lo que sea que haya ahi. Mejor decirlo aqui que fallar quince
    // veces sin explicar por que.
    try {
        await fetch(BASE, { signal: AbortSignal.timeout(2000) });
        throw new Error(`el puerto ${PUERTO} ya esta ocupado. Cierra lo que haya ahi y repite.`);
    } catch (e) {
        if (e.message.includes('ya esta ocupado')) throw e;
        // Cualquier otro error es que no hay nadie escuchando: justo lo que hace falta.
    }

    console.log('Levantando MySQL efimero y cargando db/schema.sql...');
    db = await createDB({ version: '8.0.x', dbName: 'torlan_pos' });
    conn = await mysql.createConnection({
        host: '127.0.0.1', port: db.port, user: db.username,
        database: db.dbName, multipleStatements: true,
    });
    await conn.query(readFileSync(join(RAIZ, 'db', 'schema.sql'), 'utf8'));

    const [e] = await conn.query('INSERT INTO empresas (nombre_empresa) VALUES (?)', ['Bisonte Prueba']);
    empresaId = e.insertId;

    console.log(`Arrancando next dev en ${PUERTO} contra la base efimera...`);
    servidor = spawn('npx', ['next', 'dev', '-p', String(PUERTO)], {
        cwd: RAIZ,
        shell: true,
        env: {
            ...process.env,
            NODE_ENV: 'development',
            DB_HOST: '127.0.0.1',
            DB_PORT: String(db.port),
            DB_USER: db.username,
            DB_PASSWORD: '',
            DB_NAME: db.dbName,
            JWT_SECRET: 'secreto-de-pruebas-no-usar-en-produccion',
            NEXT_PUBLIC_BASE_URL: BASE,
            RESEND_API_KEY: '',
        },
    });

    const mirar = (t) => {
        const m = t.match(/\[Recuperar\] enlace de desarrollo: \S*\?token=([a-f0-9]{64})/);
        if (m) ultimoToken = m[1];
    };
    servidor.stdout.on('data', (d) => {
        const t = d.toString();
        if (VERBOSO) process.stdout.write(`  [next] ${t}`);
        mirar(t);
    });
    servidor.stderr.on('data', (d) => {
        const t = d.toString();
        if (VERBOSO) process.stderr.write(`  [next:err] ${t}`);
        mirar(t);
    });

    for (let i = 0; i < 90; i++) {
        try {
            const r = await fetch(`${BASE}/api/recuperar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            if (r.status) { console.log('Servidor listo.\n'); return; }
        } catch { /* todavia no */ }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('el servidor de pruebas no arranco');
}

/**
 * Apagar de verdad, y no solo al hijo.
 *
 * `spawn(..., { shell: true })` deja una cadena de tres: la shell, npx y el
 * `next dev` que de verdad escucha en el puerto. `servidor.kill()` mata la
 * shell y el nieto se queda vivo, escuchando, contra una base efimera que si se
 * apaga — y la siguiente ejecucion se encuentra el puerto ocupado por un
 * servidor zombi cuyas peticiones no responden nunca. En Windows la unica forma
 * de llevarse el arbol entero es taskkill /T.
 */
async function apagar() {
    if (servidor?.pid) {
        await new Promise((res) => {
            spawn('taskkill', ['/PID', String(servidor.pid), '/T', '/F'], { stdio: 'ignore' })
                .on('close', res)
                .on('error', res);
        });
    }
    if (conn) await conn.end();
    if (db) await db.stop();
}

// ── Utilidades de datos ─────────────────────────────────────────────────────
let cuentaN = 0;
/** Cuenta nueva, con contrasena conocida. */
async function nuevaCuenta() {
    const n = ++cuentaN;
    const correo = `ana${n}.prueba@example.invalid`;
    await conn.query(
        `INSERT INTO clientes (empresa_id, nombre, apellido, fecha_nac, email, password, client_code, email_verified)
         VALUES (?,?,?,?,?,?,?,0)`,
        [empresaId, 'Ana', 'Prueba', '1990-01-01', correo, await bcrypt.hash(VIEJA, 12), `BM${String(9000 + n)}`]
    );
    return correo;
}

const fila = async (correo) => {
    const [[f]] = await conn.query(
        `SELECT id, password, reset_token_hash, reset_expires_at, session_version, email_verified
           FROM clientes WHERE email = ?`, [correo]);
    return f;
};

const huella = (t) => crypto.createHash('sha256').update(t).digest('hex');

/** Pide el enlace y espera a que el token asome por el log. */
async function pedirEnlace(correo, ip = nuevaIp()) {
    ultimoToken = null;
    const r = await post('/api/recuperar', { email: correo }, ip);
    for (let i = 0; i < 30 && !ultimoToken; i++) await new Promise((s) => setTimeout(s, 100));
    return { r, token: ultimoToken };
}

// ═══════════════════════════════════════════════════════════════════════════
await arrancar();
console.log('RECUPERAR CONTRASEÑA');

await prueba('pedir el enlace con un correo que existe responde exito', async () => {
    const { r } = await pedirEnlace(await nuevaCuenta());
    assertEqual(r.status, 200, 'estado');
    assert(r.body.success === true, 'deberia responder success');
});

await prueba('el token se guarda hasheado, nunca en claro', async () => {
    const correo = await nuevaCuenta();
    const { token } = await pedirEnlace(correo);
    assert(token, 'no se capturo el token');
    const f = await fila(correo);
    assertEqual(f.reset_token_hash, huella(token), 'la columna deberia tener el SHA-256');
    assert(f.reset_token_hash !== token, 'el token en claro NO puede estar en la base');
});

await prueba('un correo que no existe responde exactamente igual', async () => {
    // Si contestara distinto, probando correos se averigua quien es cliente.
    const conCuenta = await post('/api/recuperar', { email: await nuevaCuenta() });
    const sinCuenta = await post('/api/recuperar', { email: 'nadie@example.invalid' });
    assertEqual(sinCuenta.status, conCuenta.status, 'el estado deberia ser el mismo');
    assertEqual(JSON.stringify(sinCuenta.body), JSON.stringify(conCuenta.body), 'el cuerpo deberia ser el mismo');
});

await prueba('un correo mal escrito se rechaza', async () => {
    const r = await post('/api/recuperar', { email: 'esto-no-es-un-correo' });
    assertEqual(r.status, 400, 'estado');
});

await prueba('pedir un enlace nuevo invalida el anterior', async () => {
    const correo = await nuevaCuenta();
    const primero = await pedirEnlace(correo);
    const segundo = await pedirEnlace(correo);
    assert(primero.token && segundo.token, 'deberian emitirse los dos tokens');
    assert(primero.token !== segundo.token, 'deberian ser tokens distintos');
    assertEqual((await get(`/api/recuperar/confirmar?token=${primero.token}`)).status, 400,
        'el primer enlace deberia haber muerto');
    assertEqual((await get(`/api/recuperar/confirmar?token=${segundo.token}`)).status, 200,
        'el segundo deberia seguir vivo');
});

await prueba('un token inventado no vale', async () => {
    assertEqual((await get(`/api/recuperar/confirmar?token=${'a'.repeat(64)}`)).status, 400, 'estado');
});

await prueba('un token caducado no vale', async () => {
    const correo = await nuevaCuenta();
    const { token } = await pedirEnlace(correo);
    await conn.query('UPDATE clientes SET reset_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE email = ?', [correo]);
    assertEqual((await post('/api/recuperar/confirmar', { token, password: NUEVA })).status, 400, 'estado');
    assert(await bcrypt.compare(VIEJA, (await fila(correo)).password), 'la contrasena no deberia haber cambiado');
});

await prueba('una contrasena debil se rechaza y el enlace sigue vivo', async () => {
    const correo = await nuevaCuenta();
    const { token } = await pedirEnlace(correo);
    assertEqual((await post('/api/recuperar/confirmar', { token, password: 'corta' })).status, 400, 'estado');
    assert((await fila(correo)).reset_token_hash !== null, 'el token deberia sobrevivir a un intento invalido');
});

await prueba('con un enlace valido la contrasena cambia de verdad', async () => {
    const correo = await nuevaCuenta();
    const { token } = await pedirEnlace(correo);
    assertEqual((await post('/api/recuperar/confirmar', { token, password: NUEVA })).status, 200, 'estado');
    const f = await fila(correo);
    assert(await bcrypt.compare(NUEVA, f.password), 'deberia guardar la contrasena nueva');
    assert(!(await bcrypt.compare(VIEJA, f.password)), 'la vieja no deberia servir');
});

await prueba('el token es de un solo uso', async () => {
    const correo = await nuevaCuenta();
    const { token } = await pedirEnlace(correo);
    assertEqual((await post('/api/recuperar/confirmar', { token, password: 'OtraClave7' })).status, 200,
        'la primera deberia funcionar');
    assertEqual((await post('/api/recuperar/confirmar', { token, password: 'TerceraClave3' })).status, 400,
        'la segunda deberia rebotar');
    assert(await bcrypt.compare('OtraClave7', (await fila(correo)).password), 'deberia quedarse con la primera');
});

await prueba('recuperar cierra las demas sesiones abiertas', async () => {
    // Es el punto de esta pantalla: si alguien entro a la cuenta, aqui se le echa.
    const correo = await nuevaCuenta();
    const antes = (await fila(correo)).session_version;
    const { token } = await pedirEnlace(correo);
    await post('/api/recuperar/confirmar', { token, password: 'CuartaClave2' });
    const despues = (await fila(correo)).session_version;
    assert(despues > antes, `session_version deberia subir: ${antes} -> ${despues}`);
});

await prueba('abrir el enlace deja el correo verificado', async () => {
    // Quien abre un enlace que solo llego a esa direccion ya demostro que es suya.
    const correo = await nuevaCuenta();
    const { token } = await pedirEnlace(correo);
    await post('/api/recuperar/confirmar', { token, password: 'QuintaClave4' });
    assertEqual((await fila(correo)).email_verified, 1, 'deberia quedar verificado');
});

await prueba('el token se borra de la base al usarse', async () => {
    const correo = await nuevaCuenta();
    const { token } = await pedirEnlace(correo);
    await post('/api/recuperar/confirmar', { token, password: 'SextaClave5' });
    const f = await fila(correo);
    assertEqual(f.reset_token_hash, null, 'reset_token_hash deberia quedar en NULL');
    assertEqual(f.reset_expires_at, null, 'reset_expires_at deberia quedar en NULL');
});

await prueba('sin token no se puede fijar contrasena', async () => {
    assertEqual((await post('/api/recuperar/confirmar', { password: NUEVA })).status, 400, 'estado');
});

await prueba('una misma IP no puede recorrer una lista de correos', async () => {
    // Sin este limite, se prueban correos hasta armar la lista de clientes.
    const ip = '203.0.113.77';
    let cortada = false;
    for (let i = 0; i < 15; i++) {
        const r = await post('/api/recuperar', { email: `barrido${i}@example.invalid` }, ip);
        if (r.status === 429) { cortada = true; break; }
    }
    assert(cortada, 'deberia haber cortado con 429 antes de las 15 peticiones');
});

await prueba('no se puede inundar el buzon de una persona desde muchas IPs', async () => {
    // El limite por correo no cambia la respuesta —seguiria delatando cuentas—:
    // lo que hace es dejar de mandar. Se comprueba contando los enlaces emitidos.
    const correo = await nuevaCuenta();
    let emitidos = 0;
    for (let i = 0; i < 6; i++) {
        const { token } = await pedirEnlace(correo);
        if (token) emitidos++;
    }
    assert(emitidos <= 3, `deberia dejar de mandar tras 3, mando ${emitidos}`);
    assert(emitidos >= 1, 'deberia haber mandado al menos el primero');
});

// ═══════════════════════════════════════════════════════════════════════════
await apagar();

const pasaron = resultados.filter(([b]) => b).length;
const fallaron = resultados.length - pasaron;
console.log(`\n  ${pasaron} pasaron, ${fallaron} fallaron, ${resultados.length} total`);
process.exit(fallaron > 0 ? 1 : 0);
