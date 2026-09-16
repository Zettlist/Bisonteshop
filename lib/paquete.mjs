/**
 * El paquete que se le manda a Envia, armado con lo que pesa y mide de verdad
 * cada articulo del carrito.
 *
 * ── Lo que habia antes ──────────────────────────────────────────────────────
 *
 * Una tabla fija por NUMERO de articulos, sin mirar cuales:
 *
 *     1 pieza   -> 23x32x1 cm, 250 g
 *     2 o 3     -> 23x32x5 cm, 600 g
 *     4 o mas   -> 30x40x10 cm, 1.2 kg
 *
 * Las medidas estaban capturadas con cuidado en `product_formats` y nadie las
 * leia -- la cuenta de la tienda ni siquiera tenia permiso sobre esa tabla. La
 * tabla fija se equivocaba en las dos direcciones:
 *
 *   · las revistas se cobraban DE MENOS. Un Monthly Comic Alive pesa 1,067 g y
 *     se cotizaba como 250. Cuatro Shonen Jump son 2.5 kg contra los 1.2 de la
 *     tabla. La paqueteria pesa la caja real al recogerla, y el ajuste por
 *     sobrepeso lo paga la tienda, no el cliente.
 *   · los tankobon se cobraban DE MAS. Pesan 141 g y se cotizaban como 250:
 *     el envio se veia caro justo en lo que mas se vende.
 *
 * Se comprobo con un pedido de verdad: el #25 guardo 0.25 kg y 1 cm, un peso
 * que no corresponde a ninguno de los once formatos del catalogo. Solo podia
 * salir de la tabla.
 *
 * ── Sin imports, a proposito ───────────────────────────────────────────────
 *
 * Igual que lib/reserva.mjs: la consulta recibe la conexion como parametro. Asi
 * las pruebas de db/tests/ la corren contra un MySQL de verdad sin tener que
 * resolver el alias `@/` de Next.
 */

/**
 * Lo que añade la caja. SUPUESTO, no medido: conviene pesar una caja con su
 * relleno y ajustar esto.
 *
 * Existe porque la paqueteria no pesa la revista, pesa el paquete. Cotizar con
 * el peso desnudo del articulo seria volver a cobrar de menos, solo que por
 * menos margen que antes.
 */
export const EMPAQUE = { pesoG: 100, holguraCm: 2 };

/**
 * Para un articulo del que no se sabe cuanto pesa.
 *
 * Hoy son los once doujinshi con `dimensions = 'B5'` y sin peso: B5 dice el
 * tamaño del papel, no lo que pesa el tomo. No hay dato que leer y no se
 * inventa uno.
 *
 * Los numeros estan elegidos para que una pieza sola, ya con el empaque encima,
 * pese exactamente lo mismo que cotizaba la tabla fija (150 + 100 = 250 g). O
 * sea: estos articulos cotizan igual que antes, ni mas ni menos, hasta que
 * alguien les ponga un formato. Lo que se arregla aqui no empeora lo que no se
 * puede arreglar.
 */
export const SIN_DATOS = { lados: [21, 30, 1], pesoG: 150 };

const positivo = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Las medidas de UN articulo, y de donde salieron.
 *
 * Tres fuentes, en este orden:
 *
 *   formato    `product_formats`. La buena: la eligio quien dio de alta el
 *              producto, de una lista, y la base rechaza un cero en cualquier
 *              lado (CHECK > 0).
 *   medidas    `products.dimensions` como JSON ({"length","width","height"})
 *              mas `products.weight` en gramos. Tres productos viejos, de antes
 *              de que existieran los formatos.
 *   supuesto   nada usable. Ver SIN_DATOS.
 *
 * Se exigen las CUATRO cifras de una fuente para usarla. Mezclar el peso de un
 * sitio con las medidas de otro daria un paquete que no describe a nada.
 *
 * `fuente` va en la respuesta para poder ver, en un pedido concreto, si se
 * cotizo con datos o con el supuesto.
 */
export function medidasDe(p = {}) {
    const formato = [positivo(p.f_largo), positivo(p.f_ancho), positivo(p.f_alto)];
    const pesoFormato = positivo(p.f_peso_g);
    if (formato.every(Boolean) && pesoFormato) {
        return { lados: formato, pesoG: pesoFormato, fuente: 'formato' };
    }

    let json = null;
    if (typeof p.dimensions === 'string' && p.dimensions.trim().startsWith('{')) {
        try { json = JSON.parse(p.dimensions); } catch { json = null; }
    }
    const medidas = json ? [positivo(json.length), positivo(json.width), positivo(json.height)] : null;
    const peso = positivo(p.weight);
    if (medidas && medidas.every(Boolean) && peso) {
        return { lados: medidas, pesoG: peso, fuente: 'medidas' };
    }

    return { lados: [...SIN_DATOS.lados], pesoG: SIN_DATOS.pesoG, fuente: 'supuesto' };
}

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Apila los articulos en una caja.
 *
 * Mangas y revistas viajan uno encima de otro, asi que la caja mide lo que el
 * articulo mas grande de largo y de ancho, y la SUMA de los grosores.
 *
 * El grosor no se toma de una columna fija: se ordenan los tres lados de cada
 * articulo y el mas corto es el grosor. Hace falta porque los formatos no estan
 * capturados con la misma orientacion -- Shonen Jump es 18x2.5x26 (el grosor
 * en el medio) y otros lo llevan al final. Leer "alto" como grosor habria
 * apilado revistas de pie.
 *
 * El peso es la suma, mas el empaque una sola vez: es una caja, no una por
 * articulo.
 *
 * @param {Array<{medidas: object, cantidad: number}>} renglones
 * @returns {{length:number, width:number, height:number, weight:number}}
 *          cm y kg, que son las unidades que espera Envia.
 */
export function armarPaquete(renglones) {
    let largo = 0, ancho = 0, grosor = 0, pesoG = 0;

    for (const { medidas, cantidad } of renglones) {
        const [delgado, medio, mayor] = [...medidas.lados].sort((a, b) => a - b);
        const piezas = Math.max(1, Math.floor(Number(cantidad)) || 1);
        largo = Math.max(largo, mayor);
        ancho = Math.max(ancho, medio);
        grosor += delgado * piezas;
        pesoG += medidas.pesoG * piezas;
    }

    const h = EMPAQUE.holguraCm;
    return {
        length: r1(largo + h),
        width: r1(ancho + h),
        height: r1(grosor + h),
        weight: r2((pesoG + EMPAQUE.pesoG) / 1000),
    };
}

/**
 * Las medidas de cada renglon del carrito, leidas de la base.
 *
 * Un id que no existe no revienta la cotizacion: cae al supuesto. Quien decide
 * si ese producto se puede comprar es priceCart, en /api/checkout, y ahi si se
 * rechaza; la cotizacion solo pone precio a una caja.
 *
 * La cantidad se acota a 1..99, igual que priceCart. Si no coincidieran, la
 * caja cotizada y la cobrada tendrian piezas distintas.
 *
 * @param db     algo con .query(): el pool de la tienda, o una conexion.
 * @param items  lo que manda el navegador: [{id, quantity}]
 */
export async function medidasDelCarrito(db, items) {
    const ids = [...new Set((items || []).map((i) => Number(i.id)).filter(Boolean))];
    if (!ids.length) return [];

    const [filas] = await db.query(
        `SELECT p.id, p.dimensions, p.weight,
                f.length_cm AS f_largo, f.width_cm AS f_ancho,
                f.height_cm AS f_alto,  f.weight_g AS f_peso_g
           FROM products p
           LEFT JOIN product_formats f ON f.id = p.format_id
          WHERE p.id IN (?)`,
        [ids]
    );
    const porId = new Map(filas.map((f) => [Number(f.id), medidasDe(f)]));

    return items.map((i) => ({
        id: Number(i.id),
        medidas: porId.get(Number(i.id)) || medidasDe(),
        cantidad: Math.max(1, Math.min(Math.floor(Number(i.quantity)) || 1, 99)),
    }));
}
