// El paquete que se cotiza, armado con las medidas reales.
//
// Antes la cotizacion usaba una tabla fija por numero de articulos: una pieza
// eran 250 g fuera un tankobon de 141 g o un Monthly Comic Alive de 1,067 g.
// Estas pruebas van contra un MySQL de verdad porque la mitad del arreglo es la
// consulta: que el LEFT JOIN encuentre el formato, y que un producto sin formato
// caiga donde debe.
import { test, sql, assertEqual, assert, seed } from './harness.mjs';
// .mjs por lo mismo que lib/reserva.mjs: el package.json de la tienda no
// declara "type": "module".
import { medidasDelCarrito, armarPaquete, medidasDe, elegirEmpaque, EMPAQUE, SIN_DATOS } from '../../lib/paquete.mjs';

const G = 'PAQUETE DE ENVIO';
const conexion = { query: (...a) => sql(...a) };

let n = 0;
/** Un formato con sus medidas, y el id del producto que lo usa. */
async function conFormato(f, { largo, ancho, alto, pesoG }) {
    const [fmt] = await sql(
        `INSERT INTO product_formats (empresa_id, name, length_cm, width_cm, height_cm, weight_g)
         VALUES (?,?,?,?,?,?)`,
        [f.empresaId, `Formato ${++n}`, largo, ancho, alto, pesoG]);
    await sql('UPDATE products SET format_id = ? WHERE id = ?', [fmt.insertId, f.productId]);
    return f.productId;
}

async function otroProducto(f, extra = {}) {
    const [p] = await sql(
        `INSERT INTO products (empresa_id, name, cost_price, sale_price, stock, dimensions, weight)
         VALUES (?,?,?,?,?,?,?)`,
        [f.empresaId, `Producto ${++n}`, 50, 100, 5, extra.dimensions ?? null, extra.weight ?? null]);
    return p.insertId;
}

const cotizar = async (items) => armarPaquete(await medidasDelCarrito(conexion, items));

// ── El caso por el que existe esto ──────────────────────────────────────────
test(G, 'una revista pesa lo que pesa, no los 250 g de la tabla', async () => {
    // Shonen Jump, tal cual esta en el catalogo: 18 x 2.5 x 26 cm, 622 g.
    const f = await seed();
    const id = await conFormato(f, { largo: 18, ancho: 2.5, alto: 26, pesoG: 622 });

    const pkg = await cotizar([{ id, quantity: 1 }]);
    assertEqual(pkg.weight, 0.72, 'los 622 g mas los 100 g de la caja');
    assert(pkg.weight > 0.25, 'tiene que pesar mas que lo que cotizaba la tabla');
});

test(G, 'un tankobon deja de cobrarse de mas', async () => {
    // El otro lado del mismo error: 141 g cotizados como 250.
    const f = await seed();
    const id = await conFormato(f, { largo: 12, ancho: 1, alto: 18, pesoG: 141 });

    const pkg = await cotizar([{ id, quantity: 1 }]);
    assertEqual(pkg.weight, 0.24, 'los 141 g mas la caja');
    assert(pkg.weight < 0.25, 'tiene que salir mas ligero que la tabla');
});

// ── Apilar ──────────────────────────────────────────────────────────────────
test(G, 'cuatro revistas se apilan: suma el grosor y el peso, no el largo', async () => {
    // Cuatro Shonen Jump son 2,488 g. La tabla decia 1.2 kg para "4 o mas".
    const f = await seed();
    const id = await conFormato(f, { largo: 18, ancho: 2.5, alto: 26, pesoG: 622 });

    const pkg = await cotizar([{ id, quantity: 4 }]);
    assertEqual(pkg.weight, 2.59, '4 x 622 g mas una sola caja');
    assertEqual(pkg.contenido.height, 12, 'cuatro grosores de 2.5 cm mas la holgura');
    assertEqual(pkg.contenido.length, 28, 'el largo es el de UNA revista, no el de cuatro');
});

test(G, 'el grosor es el lado mas corto, este en la columna que este', async () => {
    // Los formatos no estan capturados con la misma orientacion: Shonen Jump
    // lleva el grosor en medio (18x2.5x26). Leer "alto" como grosor apilaria
    // las revistas de pie y la caja mediria un metro de alto.
    const f1 = await seed();
    const a = await conFormato(f1, { largo: 18, ancho: 2.5, alto: 26, pesoG: 622 });
    const f2 = await seed();
    const b = await conFormato(f2, { largo: 26, ancho: 18, alto: 2.5, pesoG: 622 });

    const pa = await cotizar([{ id: a, quantity: 3 }]);
    const pb = await cotizar([{ id: b, quantity: 3 }]);
    assertEqual(JSON.stringify(pa), JSON.stringify(pb), 'la misma revista da la misma caja');
    assertEqual(pa.contenido.height, 9.5, 'tres grosores de 2.5 cm, no tres alturas de 26');
});

test(G, 'un carrito mixto toma el articulo mas grande y suma el resto', async () => {
    const f = await seed();
    const revista = await conFormato(f, { largo: 18, ancho: 2.5, alto: 26, pesoG: 622 });
    const tomo = await otroProducto(f);
    const [fmt] = await sql(
        `INSERT INTO product_formats (empresa_id, name, length_cm, width_cm, height_cm, weight_g)
         VALUES (?,?,?,?,?,?)`, [f.empresaId, `Tankobon ${++n}`, 12, 1, 18, 141]);
    await sql('UPDATE products SET format_id = ? WHERE id = ?', [fmt.insertId, tomo]);

    const pkg = await cotizar([{ id: revista, quantity: 1 }, { id: tomo, quantity: 2 }]);
    assertEqual(pkg.contenido.length, 28, 'el largo de la revista, que es la mas grande');
    assertEqual(pkg.contenido.height, 6.5, '2.5 de la revista + 2x1 de los tomos + holgura');
    assertEqual(pkg.weight, 1.00, '622 + 2x141 + 100 de la caja');
});

// ── El empaque ──────────────────────────────────────────────────────────────
const TANKOBON = { largo: 12, ancho: 1, alto: 18, pesoG: 141 };
const REVISTA = { largo: 18, ancho: 2.5, alto: 26, pesoG: 622 };
const DOUJINSHI = { largo: 18.2, ancho: 0.3, alto: 25.7, pesoG: 105 };

async function formatoSuelto(f, m) {
    const id = await otroProducto(f);
    const [fmt] = await sql(
        `INSERT INTO product_formats (empresa_id, name, length_cm, width_cm, height_cm, weight_g)
         VALUES (?,?,?,?,?,?)`, [f.empresaId, `Formato ${++n}`, m.largo, m.ancho, m.alto, m.pesoG]);
    await sql('UPDATE products SET format_id = ? WHERE id = ?', [fmt.insertId, id]);
    return id;
}

test(G, 'un manga solo va en sobre', async () => {
    const f = await seed();
    const pkg = await cotizar([{ id: await formatoSuelto(f, TANKOBON), quantity: 1 }]);
    assertEqual(pkg.empaque, 'Sobre', 'un tankobon');
    assertEqual([pkg.height, pkg.width, pkg.length].join('x'), '4x24x32',
        'a Envia van las medidas del sobre, no las del manga');
});

test(G, 'dos revistas y dos doujinshi: caja plana, con TODOS los pesos sumados', async () => {
    const f = await seed();
    const revista = await formatoSuelto(f, REVISTA);
    const doujin = await formatoSuelto(f, DOUJINSHI);
    const pkg = await cotizar([{ id: revista, quantity: 2 }, { id: doujin, quantity: 2 }]);
    assertEqual(pkg.empaque, 'Caja plana', '2x2.5 + 2x0.3 + holgura = 7.6 cm de alto, 28 de largo');
    assertEqual(pkg.weight, 1.55, '2x622 + 2x105 + 100 del empaque = 1,554 g');
});

test(G, 'tres tankobon ya no caben en el sobre: caja chica', async () => {
    const f = await seed();
    const pkg = await cotizar([{ id: await formatoSuelto(f, TANKOBON), quantity: 3 }]);
    assertEqual(pkg.empaque, 'Caja chica', '3 cm + holgura = 5, mas que los 4 del sobre');
    assertEqual(pkg.weight, 0.52, '3x141 + 100');
});

test(G, 'una revista sola no cabe en el sobre por grosor, y va en la plana', async () => {
    const f = await seed();
    const pkg = await cotizar([{ id: await formatoSuelto(f, REVISTA), quantity: 1 }]);
    assertEqual(pkg.empaque, 'Caja plana', '2.5 + 2 de holgura = 4.5 cm; y es muy larga para la chica');
    const tres = await cotizar([{ id: await formatoSuelto(f, REVISTA), quantity: 3 }]);
    assertEqual(tres.empaque, 'Caja mediana', 'tres ya son 9.5 cm, mas que los 8 de la plana');
});

test(G, 'se elige el MAS CHICO donde cabe, no el primero de la lista', async () => {
    assertEqual(elegirEmpaque([2, 15, 20]).nombre, 'Sobre', 'cabe en todos; gana el sobre');
    assertEqual(elegirEmpaque([20, 15, 2]).nombre, 'Sobre', 'el orden de los lados no importa');
    assertEqual(elegirEmpaque([9, 15, 21]).nombre, 'Caja chica');
    assertEqual(elegirEmpaque([16, 25, 35]).nombre, 'Caja grande');
});

test(G, 'lo que no cabe en ninguna caja se cotiza con su tamaño y lo dice', async () => {
    const f = await seed();
    const pkg = await cotizar([{ id: await formatoSuelto(f, REVISTA), quantity: 20 }]);
    assertEqual(pkg.empaque, 'Caja a la medida', '20 revistas son 52 cm de alto');
    assertEqual(pkg.height, 20, 'el lado mas corto de la pila');
    assertEqual(pkg.length, 52, '20x2.5 + 2 de holgura, redondeado hacia arriba');
    assertEqual(pkg.weight, 12.54, '20x622 + 100');
});

// ── Las otras fuentes ───────────────────────────────────────────────────────
test(G, 'sin formato, usa las medidas en JSON y el peso del producto', async () => {
    // Blue Lock #37, tal cual esta: {"length":"12","width":"3","height":"17"}, 209 g.
    const f = await seed();
    const id = await otroProducto(f, {
        dimensions: '{"length":"12","width":"3","height":"17"}', weight: 209 });

    const [renglon] = await medidasDelCarrito(conexion, [{ id, quantity: 1 }]);
    assertEqual(renglon.medidas.fuente, 'medidas', 'sale del JSON');
    assertEqual((await cotizar([{ id, quantity: 1 }])).weight, 0.31, '209 g mas la caja');
});

test(G, 'el formato manda sobre el JSON viejo', async () => {
    const f = await seed();
    await sql('UPDATE products SET dimensions = ?, weight = ? WHERE id = ?',
        ['{"length":"50","width":"50","height":"50"}', 5000, f.productId]);
    const id = await conFormato(f, { largo: 12, ancho: 1, alto: 18, pesoG: 141 });

    const [renglon] = await medidasDelCarrito(conexion, [{ id, quantity: 1 }]);
    assertEqual(renglon.medidas.fuente, 'formato', 'el formato lo eligio alguien de una lista');
    assertEqual(renglon.medidas.pesoG, 141, 'y no los 5 kg del dato viejo');
});

// ── Lo que no se sabe ───────────────────────────────────────────────────────
test(G, 'un doujinshi B5 sin peso cotiza igual que antes, ni mas ni menos', async () => {
    // Los once de verdad tienen dimensions = 'B5' y ningun peso. B5 es el
    // tamaño del papel, no lo que pesa. No se inventa: se deja como estaba.
    const f = await seed();
    const id = await otroProducto(f, { dimensions: 'B5' });

    const [renglon] = await medidasDelCarrito(conexion, [{ id, quantity: 1 }]);
    assertEqual(renglon.medidas.fuente, 'supuesto', 'no hay dato que leer');
    assertEqual((await cotizar([{ id, quantity: 1 }])).weight, 0.25,
        'el mismo 0.25 kg que cotizaba la tabla fija');
    assertEqual(SIN_DATOS.pesoG + EMPAQUE.pesoG, 250, 'y la cuenta cuadra a proposito');
});

test(G, 'medidas a medias no se usan a medias', async () => {
    // Un JSON sin peso, o con un lado vacio, no se completa con el peso de otro
    // sitio: la caja no describiria a nada.
    assertEqual(medidasDe({ dimensions: '{"length":"12","width":"3","height":"17"}' }).fuente,
        'supuesto', 'medidas sin peso');
    assertEqual(medidasDe({ dimensions: '{"length":"12","width":"","height":"17"}', weight: 209 }).fuente,
        'supuesto', 'un lado vacio');
    assertEqual(medidasDe({ dimensions: '{no es json', weight: 209 }).fuente,
        'supuesto', 'JSON roto');
});

test(G, 'un producto que no existe no tumba la cotizacion', async () => {
    const pkg = await cotizar([{ id: 999999, quantity: 1 }]);
    assertEqual(pkg.weight, 0.25, 'cae al supuesto');
});

test(G, 'la cantidad se acota igual que en priceCart', async () => {
    // Si no coincidieran, la caja cotizada y la cobrada tendrian piezas distintas.
    const f = await seed();
    const id = await conFormato(f, { largo: 12, ancho: 1, alto: 18, pesoG: 141 });

    const [mucho] = await medidasDelCarrito(conexion, [{ id, quantity: 500 }]);
    const [nada] = await medidasDelCarrito(conexion, [{ id, quantity: -3 }]);
    assertEqual(mucho.cantidad, 99, 'tope de 99');
    assertEqual(nada.cantidad, 1, 'minimo de 1');
});
