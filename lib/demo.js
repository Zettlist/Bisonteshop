/**
 * Vitrina de prueba.
 *
 * `products` es tabla compartida con el POS: cualquier fila que se escriba ahi
 * sale luego en los cortes de caja y en el inventario de la tienda fisica. Por
 * eso los productos de prueba no se dan de alta, se inyectan aqui en el camino
 * de lectura — asi se puede ver como queda el landing con Figuras y Accesorios
 * llenos sin ensuciar la contabilidad de nadie.
 *
 * Se enciende con DEMO_PRODUCTOS=1 en .env.local. Apagado por defecto: si la
 * variable no esta puesta, este archivo no existe para el resto de la tienda.
 */

export const DEMO_ACTIVO = process.env.DEMO_PRODUCTOS === '1';

/* Los ids arrancan bien lejos del rango del POS, que va por los tres digitos.
   Positivos y no negativos porque `idDeSlug` solo lee \d+ de la URL: con un id
   negativo la ficha contestaria 404 y las portadas no abririan. */
const BASE = 900000;

const figura = (n, title, archivo, price, extra = {}) => ({
    id: BASE + n,
    title,
    price,
    stock: 3,
    stock_disponible: 3,
    category: 'Figura',
    image_url: `/demo/figuras/${archivo}`,
    publisher: 'Riot Games',
    dimensions: '25 x 12 x 12 cm',
    weight: 0.8,
    language: 'Español',
    ...extra,
});

const accesorio = (n, title, archivo, price, extra = {}) => ({
    id: BASE + n,
    title,
    price,
    stock: 8,
    stock_disponible: 8,
    category: 'Accesorio',
    image_url: `/demo/accesorios/${archivo}`,
    ...extra,
});

/* El precio va en la misma moneda que el POS (MXN); el resto de la tienda lo
   convierte solo con `useCurrency`, asi que aqui no hay nada que hacer. */
const CATALOGO = [
    figura(1, 'Figura Reyna — Valorant', 'reyna.png', 2490, {
        sinopsis: 'Estatua coleccionable de Reyna en pose de combate, con los zarcillos de su Devorar en resina translucida. Base hexagonal con el logo del agente.',
        rating: 4.8, rating_count: 24,
    }),
    figura(2, 'Figura Jett — Valorant', 'jett.jpg', 2290, {
        sinopsis: 'Jett en pleno impulso, con la capa esculpida al vuelo y sus dagas de Tormenta incluidas como pieza intercambiable.',
        rating: 4.7, rating_count: 31,
    }),
    figura(3, 'Figura Killjoy — Valorant', 'killjoy.webp', 2390, {
        sinopsis: 'Killjoy con su torreta y el Alarmabot desmontables, pintada a mano y con el detalle de las gafas amarillas en acrilico.',
        rating: 4.6, rating_count: 18,
    }),
    figura(4, 'Figura Omen — Valorant', 'omen.jpg', 2590, {
        sinopsis: 'Omen emergiendo de su Salto Oscuro: la parte baja de la figura se funde con la base en resina ahumada.',
        rating: 4.9, rating_count: 12,
    }),
    figura(5, 'Figura Phoenix — Valorant', 'phoenix.png', 2390, {
        sinopsis: 'Phoenix encendiendo la Mano Caliente, con efecto de llama translucida y base de asfalto agrietado.',
        rating: 4.5, rating_count: 27,
    }),
    figura(6, 'Figura Viper — Valorant', 'viper.jpg', 2490, {
        sinopsis: 'Viper con la mascara puesta y el Pozo Toxico a los pies, en resina verde translucida.',
        rating: 4.7, rating_count: 15,
    }),

    accesorio(11, 'Cartera Luffy — One Piece', 'cartera-luffy.jpg', 449, {
        publisher: 'Toei Animation',
        dimensions: '19 x 9.5 cm',
        weight: 0.18,
        sinopsis: 'Cartera de piel sintetica con el sombrero de paja grabado, ocho ranuras para tarjetas y monedero con cierre.',
        rating: 4.4, rating_count: 42,
    }),
    accesorio(12, 'Collar Naruto — Hoja de Konoha', 'collar-naruto.jpg', 199, {
        publisher: 'Studio Pierrot',
        dimensions: 'Cadena 55 cm',
        weight: 0.03,
        sinopsis: 'Dije del simbolo de la Aldea Oculta de la Hoja en acero inoxidable, sobre cadena ajustable.',
        rating: 4.3, rating_count: 56,
    }),
    accesorio(13, 'Set de llaveros nichirin — Demon Slayer', 'espadas.jpeg', 389, {
        publisher: 'ufotable',
        dimensions: '12 cm cada uno',
        weight: 0.12,
        sinopsis: 'Cuatro espadas nichirin en miniatura — Tanjiro, Zenitsu, Nezuko y Shinobu — con vaina desmontable y argolla.',
        rating: 4.6, rating_count: 9,
    }),
    accesorio(14, 'Llavero 2B — NieR: Automata', 'llavero-nier-automata.jpg', 179, {
        publisher: 'Square Enix',
        dimensions: '7 cm',
        weight: 0.04,
        sinopsis: 'Llavero de acrilico de doble cara con 2B y su Pod, argolla y cadena metalica.',
        rating: 4.5, rating_count: 33,
    }),
    accesorio(15, 'Pulsera Naruto — Akatsuki', 'pulsera-naruto.jpg', 149, {
        publisher: 'Studio Pierrot',
        dimensions: 'Ajustable 16-21 cm',
        weight: 0.02,
        sinopsis: 'Pulsera trenzada con dije de la nube Akatsuki en esmalte rojo.',
        rating: 4.2, rating_count: 61,
    }),
    accesorio(16, 'Llavero chibi kendoka', 'llavero.jpg', 159, {
        dimensions: '5.5 cm',
        weight: 0.03,
        sinopsis: 'Figura chibi de PVC con el men de kendo levantado y shinai en mano. Correa para movil incluida.',
        rating: 4.1, rating_count: 14,
    }),
];

/* Todos los productos llevan los mismos campos que devuelve la consulta real,
   incluidos los que aqui no aplican: la ficha y la tarjeta leen `is_adult`,
   `tags` o `gender` sin preguntar, y una propiedad ausente se cuela como
   `undefined` hasta reventar en el render. */
const COMPLETO = {
    gender: null, barcode: null, isbn: null, publication_date: null,
    publisher: null, pages: null, dimensions: null, weight: null,
    language: null, artist: null, group_name: null, series: null,
    volume: null, sinopsis: null, sinopsis_fuente: null, events: null,
    rating: null, rating_count: 0, is_adult: false, tags: [],
};

const PRODUCTOS = CATALOGO.map(p => ({ ...COMPLETO, ...p, demo: true }));

/**
 * Anade a la lista los productos de prueba que pasen el mismo filtro que la
 * consulta acaba de aplicar en SQL. El filtro se pasa desde fuera porque cada
 * ruta recorta por su cuenta y duplicar aqui esa regla las desincronizaria.
 */
export function conDemo(filas, cumple = () => true) {
    if (!DEMO_ACTIVO) return filas;
    // Delante: los ids son los mas altos y las consultas ordenan por id DESC,
    // asi que este es el sitio que les tocaria de estar en la tabla.
    return [...PRODUCTOS.filter(cumple), ...filas];
}

export function productoDemo(id) {
    if (!DEMO_ACTIVO) return null;
    return PRODUCTOS.find(p => p.id === Number(id)) || null;
}

// Los similares de un producto de prueba solo pueden ser otros de prueba: los
// reales viven en la base y no comparten ni categoria ni etiquetas con estos.
export function similaresDemo(producto, limite = 4) {
    if (!DEMO_ACTIVO || !producto?.demo) return [];
    return PRODUCTOS.filter(p => p.id !== producto.id && p.category === producto.category).slice(0, limite);
}
