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
 * Los empaques que se usan, del mas chico al mas grande. Medidas INTERIORES en
 * cm: [alto, ancho, largo].
 *
 * Existen porque la paqueteria cobra por la caja que recoge, no por el hueco
 * exacto que dejan los mangas. Cotizar con una caja de 14.3 x 20.1 x 3.4 cm
 * describe un paquete que no existe; el que sale del local es un sobre o una
 * caja de medida fija.
 *
 * SUPUESTOS, igual que el peso del empaque: son medidas comunes de sobre de
 * burbuja y caja de carton para manga. Si las cajas de la tienda son otras,
 * se cambian aqui.
 *
 *   Sobre          un tankobon o dos, un doujinshi o un par
 *   Caja chica     de tres a ocho tankobon
 *   Caja plana     una o dos revistas (Jump, B5): la mediana es demasiado alta,
 *                  y Envia cobra tambien por el volumen de la caja
 *   Caja mediana   carritos mezclados
 *   Caja grande    pedidos grandes
 *   Caja extra     lo que no cabe en la grande
 */
export const EMPAQUES = [
    { nombre: 'Sobre', medidas: [4, 24, 32] },
    { nombre: 'Caja chica', medidas: [10, 16, 22] },
    { nombre: 'Caja plana', medidas: [8, 22, 32] },
    { nombre: 'Caja mediana', medidas: [15, 23, 30] },
    { nombre: 'Caja grande', medidas: [20, 30, 40] },
    { nombre: 'Caja extra grande', medidas: [30, 40, 50] },
];

const volumen = ([a, b, c]) => a * b * c;

/**
 * El empaque mas chico donde cabe el contenido. Se comparan los lados
 * ordenados, asi que una pila acostada o de pie da lo mismo.
 *
 * Si no cabe en ninguno -- un pedido de treinta revistas -- se cotiza con la
 * medida del contenido y se dice: es un pedido que alguien va a tener que
 * empacar a mano, y mejor cotizarlo con su tamaño que meterlo en una caja
 * donde no entra.
 */
export function elegirEmpaque(contenido) {
    const pedido = [...contenido].sort((a, b) => a - b);
    const cabe = EMPAQUES
        .filter((e) => {
            const caja = [...e.medidas].sort((a, b) => a - b);
            return pedido.every((lado, i) => lado <= caja[i]);
        })
        .sort((a, b) => volumen(a.medidas) - volumen(b.medidas));
    if (cabe.length) return { nombre: cabe[0].nombre, medidas: [...cabe[0].medidas].sort((a, b) => a - b) };
    return { nombre: 'Caja a la medida', medidas: pedido.map((n) => Math.ceil(n)) };
}

/**
 * Apila los articulos y elige el empaque donde caben.
 *
 * Mangas y revistas viajan uno encima de otro, asi que el contenido mide lo
 * que el articulo mas grande de largo y de ancho, y la SUMA de los grosores,
 * mas la holgura.
 *
 * El grosor no se toma de una columna fija: se ordenan los tres lados de cada
 * articulo y el mas corto es el grosor. Hace falta porque los formatos no estan
 * capturados con la misma orientacion -- Shonen Jump es 18x2.5x26 (el grosor
 * en el medio) y otros lo llevan al final. Leer "alto" como grosor habria
 * apilado revistas de pie.
 *
 * El peso es la suma de TODOS los articulos por su cantidad, mas el empaque una
 * sola vez: es un paquete, no uno por articulo.
 *
 * @param {Array<{medidas: object, cantidad: number}>} renglones
 * @returns {{length, width, height, weight, empaque, contenido}}
 *          length/width/height son las del EMPAQUE, en cm, y weight en kg:
 *          es lo que espera Envia. `contenido` es la pila de articulos.
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
    const contenido = { length: r1(largo + h), width: r1(ancho + h), height: r1(grosor + h) };
    const empaque = elegirEmpaque([contenido.height, contenido.width, contenido.length]);
    const [alto, anchoCaja, largoCaja] = empaque.medidas;

    return {
        length: largoCaja,
        width: anchoCaja,
        height: alto,
        weight: r2((pesoG + EMPAQUE.pesoG) / 1000),
        empaque: empaque.nombre,
        contenido,
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
