// ─────────────────────────────────────────────────────────────────────────────
// Aplica una migracion a la base real, o corre una consulta suelta contra ella.
//
//   node db/aplicar-migracion.mjs migrations/2026-09-11-credito-reversible.sql
//   node db/aplicar-migracion.mjs migrations/2026-09-11-credito-reversible.sql --aplicar
//   node db/aplicar-migracion.mjs --consulta "SELECT ..."
//
// Existe porque en esta maquina no hay cliente `mysql` en el PATH, y el
// `mysql ... < archivo.sql` de los README no se puede escribir en PowerShell
// (el `<` esta reservado). `mysql2` ya esta instalado aqui para las pruebas,
// asi que sirve igual y sin instalar nada.
//
// SIN --aplicar no escribe nada: enseña el SQL y se va. Estas migraciones
// tocan dinero de clientes en una base compartida con el POS, y el paso de
// "mirar antes" no deberia depender de acordarse.
//
// La conexion sale de .env.local, que apunta al Cloud SQL Auth Proxy. Si el
// proxy no esta levantado no hay nada al otro lado:
//
//   cloud-sql-proxy --gcloud-auth --port=3307 torlan-web:us-central1:torlan-mysql
// ─────────────────────────────────────────────────────────────────────────────
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(join(AQUI, '..', '.env.local'));

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const iConsulta = args.indexOf('--consulta');
const consulta = iConsulta !== -1 ? args[iConsulta + 1] : null;
const archivo = args.find(a => !a.startsWith('--') && a !== consulta);

if (!archivo && !consulta) {
    console.error('Falta el archivo de migracion (o --consulta "SELECT ...").');
    process.exit(1);
}

const conexion = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    multipleStatements: true,
};

// Antes de nada, decir a que base se esta apuntando. Hay DOS instancias con el
// mismo nombre en proyectos distintos (ver el comentario de .env.local) y
// equivocarse de tunel es silencioso.
console.log(`Base: ${conexion.user}@${conexion.host}:${conexion.port}/${conexion.database}\n`);

let sql, etiqueta;
if (consulta) {
    sql = consulta;
    etiqueta = 'consulta';
} else {
    sql = readFileSync(resolve(AQUI, archivo), 'utf8');
    etiqueta = archivo;
}

if (!consulta && !aplicar) {
    // Solo las lineas que hacen algo: estas migraciones son mas comentario que
    // SQL a proposito, y enseñar 300 lineas de prosa esconde las 25 que corren.
    const ejecutable = sql.split('\n').filter(l => l.trim() && !l.trim().startsWith('--'));
    console.log(`--- ${etiqueta}: ${ejecutable.length} lineas ejecutables ---`);
    console.log(ejecutable.join('\n'));
    console.log(`\nNo se aplico nada. Para aplicarlo de verdad:\n  node db/aplicar-migracion.mjs ${archivo} --aplicar`);
    process.exit(0);
}

let conn;
try {
    conn = await mysql.createConnection(conexion);
} catch (e) {
    console.error(`No se pudo conectar: ${e.code || e.message}`);
    if (e.code === 'ECONNREFUSED') {
        console.error('\nEl Cloud SQL Auth Proxy no esta levantado. En otra terminal:');
        console.error('  cloud-sql-proxy --gcloud-auth --port=3307 torlan-web:us-central1:torlan-mysql');
    }
    process.exit(1);
}

try {
    const [resultado] = await conn.query(sql);
    if (consulta) {
        console.table(resultado);
    } else {
        const partes = Array.isArray(resultado) ? resultado : [resultado];
        partes.forEach((r, i) => {
            if (r && typeof r.affectedRows === 'number') {
                console.log(`  sentencia ${i + 1}: ${r.affectedRows} fila(s)`);
            }
        });
        console.log(`\n${etiqueta} aplicada.`);
    }
} catch (e) {
    console.error(`\nFALLO: ${e.sqlMessage || e.message}`);
    if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME') {
        console.error('Esa columna o llave ya existe: la migracion probablemente ya estaba puesta.');
    }
    process.exitCode = 1;
} finally {
    await conn.end();
}
