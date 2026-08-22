// Carga productos DE PRUEBA en la seccion de adultos.
//
// Idempotente: todos llevan barcode con prefijo TEST-ADU-, y el script borra
// esos antes de insertar. Correrlo dos veces deja la misma lista, no el doble.
// Para quitarlos:  node .scripts/seed-adultos-prueba.mjs --limpiar
//
// Las portadas viven en public/productos-prueba/adultos/, asi que viajan con
// el repo y con la imagen de Docker: no dependen de GCS.
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const env = Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const EMPRESA_ID = Number(env.EMPRESA_ID) || 1;
const PREFIJO = 'TEST-ADU-';
const DIR_IMG = 'public/productos-prueba/adultos';

const PRODUCTOS = [
    {
        img: 'hatsumono-jealousy.jpg', name: 'Hatsumono Jealousy (初物嫉妬)',
        series: 'Hatsumono Jealousy', artist: 'Mogu Chobi', group_name: 'Shafu desu.',
        price: 520, pages: 32, sinopsis: 'Doujinshi original a color, edicion 成人向け. Importado directo de Japon.',
    },
    {
        img: 'rinjin-haishinsha-5.jpg', name: 'Rinjin wa Yuumei Haishinsha 5-ninme', volume: 5,
        series: 'Rinjin wa Yuumei Haishinsha', artist: null, group_name: null,
        price: 495, pages: 28, sinopsis: 'Quinto numero de la serie. R18, adult only.',
    },
    {
        img: 'odanon-special-booklet.jpg', name: 'ODANON Special Booklet - COMIC X-EROS #13',
        series: 'COMIC X-EROS', artist: 'ODANON', group_name: null, publisher: 'Wanimagazine',
        price: 380, pages: 16, sinopsis: 'Booklet especial que acompaño a COMIC X-EROS #13. 分売不可.',
    },
    {
        img: 'mars-volta-mercury-shadows.jpg', name: 'MARS VOLTA: Mercury Shadows',
        series: 'Sailor Moon (parodia)', artist: null, group_name: null,
        price: 610, pages: 36, sinopsis: 'Parodia adult only de Sailor Moon centrada en Sailor Mars.',
    },
    {
        img: 'ero-to-tsukkomi.jpg', name: 'Ero to Tsukkomi ~Sain Chinpo Hen~ (エロとツッコミ)',
        series: 'Ero to Tsukkomi', artist: null, group_name: null,
        price: 540, pages: 30, sinopsis: 'Doujinshi R18 成人向け. Prohibida la venta a menores de 18.',
    },
    {
        img: 'carnal-chaldea-6.jpg', name: 'Carnal Chaldea 6', volume: 6,
        series: 'Fate/Grand Order (parodia)', artist: null, group_name: null,
        price: 650, pages: 40, sinopsis: 'Sexto tomo de la serie Carnal Chaldea. Parodia de Fate/Grand Order.',
    },
    {
        img: 'yellow-light.jpg', name: 'YELLOW LIGHT (イエローライト)',
        series: 'YELLOW LIGHT', artist: null, group_name: 'Robaitei',
        price: 575, pages: 34, sinopsis: 'Publicado en Comic Market 100. Incluye pagina invitada. 18禁.',
    },
    {
        img: 'miyasaka-byouin-5.jpg', name: 'Miyasaka Byouin 5 - "Semerareru no wa Suki desu ka?"', volume: 5,
        series: 'Miyasaka Byouin', artist: null, group_name: 'onsoku ubaguruma',
        price: 590, pages: 32, sinopsis: 'Quinto numero de la serie del hospital. DOJIN R18 成人向け.',
    },
    {
        img: 'drop-in-gyaru-4-5.jpg', name: 'Drop-In Gyaru 4.5 (入り浸りギャル)',
        series: 'Drop-In Gyaru', artist: null, group_name: 'Amagami Honpo',
        price: 505, pages: 26, sinopsis: 'Original book, numero 4.5 de la serie. R18.',
    },
    {
        img: 'lucid-dream.jpg', name: 'LUCID★DREAM (ルーシッド★ドリーム)',
        series: 'Seishun Buta Yarou (parodia)', artist: null, group_name: null,
        price: 560, pages: 30, sinopsis: 'Doujinshi adult only con las protagonistas en traje de conejita.',
    },
    {
        img: 'appuri-monogatari-2.jpg', name: 'Appuri Monogatari II (アョプり物語 II)', volume: 2,
        series: 'Appuri Monogatari', artist: null, group_name: null,
        price: 530, pages: 28, sinopsis: 'Segundo tomo, ambientacion de fantasia. 成人向け.',
    },
];

const limpiar = process.argv.includes('--limpiar');

const c = await mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
});

try {
    const [borrados] = await c.query(
        'DELETE FROM products WHERE empresa_id = ? AND barcode LIKE ?', [EMPRESA_ID, `${PREFIJO}%`]
    );
    console.log(`🗑️  ${borrados.affectedRows} producto(s) de prueba anteriores eliminados`);

    if (limpiar) {
        console.log('✅ Limpieza terminada (no se insertó nada).');
    } else {
        let n = 0;
        for (const [i, p] of PRODUCTOS.entries()) {
            const ruta = path.join(DIR_IMG, p.img);
            if (!fs.existsSync(ruta)) { console.warn(`⚠️  falta la imagen ${p.img}, se omite`); continue; }
            await c.query(
                `INSERT INTO products
                   (empresa_id, name, series, volume, cost_price, sale_price, stock, category,
                    barcode, publisher, page_count, language, artist, group_name,
                    is_adult, image_url, sinopsis, gender, page_color, dimensions)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'Doujinshi', ?, ?, ?, 'JA', ?, ?, 1, ?, ?, 'Hentai', 'B/N con portada a color', 'B5')`,
                [
                    EMPRESA_ID, p.name, p.series ?? null, p.volume ?? null,
                    Math.round(p.price * 0.42), p.price, 3 + ((i * 3) % 10),
                    `${PREFIJO}${String(i + 1).padStart(2, '0')}`,
                    p.publisher ?? 'Doujin (autoeditado)', p.pages,
                    p.artist ?? null, p.group_name ?? null,
                    `/productos-prueba/adultos/${p.img}`, p.sinopsis,
                ]
            );
            n++;
        }
        console.log(`✅ ${n} producto(s) de prueba insertados en la sección de adultos`);
    }

    const [[r]] = await c.query(
        'SELECT COUNT(*) AS n FROM products WHERE empresa_id = ? AND is_adult = 1', [EMPRESA_ID]
    );
    console.log(`📦 total de productos adultos ahora: ${r.n}`);
} finally {
    await c.end();
}
