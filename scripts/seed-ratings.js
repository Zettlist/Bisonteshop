/**
 * Rellena products.rating / rating_count con notas inventadas.
 *
 * OJO CON LO QUE ES ESTO: no son opiniones. No hay nadie detras de estos
 * numeros. En la tienda se ven exactamente igual que una calificacion real, asi
 * que el cliente los va a leer como notas de otros compradores. Se escribe
 * aparte y no dentro de `product_reviews` justo por eso: lo falso no se mezcla
 * con lo que la gente escriba de verdad, y el dia que llegue una opinion real
 * el endpoint recalcula el promedio desde la tabla y estas notas desaparecen
 * solas de ese producto.
 *
 * Reversible: `--quitar` las devuelve a NULL. Nunca pisa un producto que ya
 * tenga nota salvo que se pida `--forzar`, para no borrar de un manotazo lo que
 * si sea legitimo.
 *
 * Las notas salen del id, no de un random: correrlo dos veces da lo mismo, y un
 * producto no cambia de 4.2 a 4.8 entre dos ejecuciones delante del cliente.
 *
 *   node scripts/seed-ratings.js --ver      solo muestra lo que haria
 *   node scripts/seed-ratings.js            escribe las que estan en NULL
 *   node scripts/seed-ratings.js --forzar   escribe tambien sobre las que ya tienen
 *   node scripts/seed-ratings.js --quitar   las regresa a NULL
 *
 * (requiere el Cloud SQL proxy; DB_* salen de .env.local)
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const args = process.argv.slice(2);
const VER = args.includes('--ver');
const FORZAR = args.includes('--forzar');
const QUITAR = args.includes('--quitar');

/* Un hash simple del id: reparte parejo y siempre da lo mismo para el mismo
   producto. No busca ser criptografico, busca ser estable. */
const revuelto = (id, sal) => {
    let h = (id * 2654435761 + sal * 40503) >>> 0;
    h ^= h >>> 13;
    h = (h * 1274126177) >>> 0;
    return h >>> 0;
};

/* Entre 3.8 y 5.0. Nada por debajo: una tienda no elige su catalogo para luego
   decir que la mitad es mala, y un 2.1 inventado le hace dano a un producto
   real que nadie ha calificado. */
const notaDe = id => (38 + (revuelto(id, 1) % 13)) / 10;

/* Entre 4 y 40 opiniones. Con menos de cuatro la nota se lee como el capricho
   de una persona; con cientos, en una tienda de este tamano, se nota el invento. */
const cuantasDe = id => 4 + (revuelto(id, 2) % 37);

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const [productos] = await conn.query(
        // `name`, no `title`: el titulo que ve la tienda lo arma lib/productos.js
        // juntando serie y tomo; en la tabla del POS la columna se llama name.
        'SELECT id, name, rating, rating_count FROM products ORDER BY id'
    );

    if (QUITAR) {
        const [r] = await conn.query(
            'UPDATE products SET rating = NULL, rating_count = 0 WHERE rating IS NOT NULL'
        );
        console.log(`- notas quitadas de ${r.affectedRows} productos`);
        await conn.end();
        return;
    }

    const objetivo = FORZAR ? productos : productos.filter(p => p.rating == null);
    console.log(`${productos.length} productos en la tabla, ${objetivo.length} a escribir`
        + (FORZAR ? ' (--forzar: incluye los que ya tenian nota)' : ' (solo los que estan sin nota)'));

    if (!objetivo.length) {
        console.log('nada que hacer');
        await conn.end();
        return;
    }

    for (const p of objetivo) {
        const nota = notaDe(p.id);
        const cuantas = cuantasDe(p.id);
        console.log(`  ${String(p.id).padStart(6)}  ${nota.toFixed(1)}  (${String(cuantas).padStart(2)})  ${p.name}`);
        if (!VER) {
            await conn.query(
                'UPDATE products SET rating = ?, rating_count = ? WHERE id = ?',
                [nota, cuantas, p.id]
            );
        }
    }

    console.log(VER
        ? '\n--ver: no se escribio nada. Quita --ver para aplicarlo.'
        : `\nlisto: ${objetivo.length} productos con nota. Para deshacerlo: node scripts/seed-ratings.js --quitar`);

    await conn.end();
})().catch(err => { console.error(err.message); process.exit(1); });
