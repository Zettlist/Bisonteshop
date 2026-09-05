import pool from '@/lib/db';
import { productoDemo, similaresDemo } from '@/lib/demo';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

// Las mismas columnas que sirve /api/mangas, con los alias que ya espera el
// resto de la tienda (`title`, `price`, `pages`). Cambiarlos aqui obligaria a
// tocar MangaCard, el carrito y el checkout.
const COLUMNAS = `
    p.id,
    p.name             AS title,
    p.sale_price       AS price,
    p.stock,
    p.stock_disponible,
    p.category,
    p.gender,
    p.barcode,
    p.isbn,
    p.publication_date,
    p.publisher,
    p.page_count       AS pages,
    p.dimensions,
    p.weight,
    p.language,
    p.artist,
    p.group_name,
    p.series,
    p.volume,
    p.image_url,
    p.is_adult,
    p.sinopsis,
    p.sinopsis_fuente,
    p.rating,
    p.rating_count
`;

function normalizar(fila) {
    if (!fila) return null;
    return {
        ...fila,
        is_adult: Number(fila.is_adult) === 1,
        tags: fila.tags ? String(fila.tags).split(',').filter(Boolean) : [],
    };
}

export async function obtenerProducto(id) {
    if (!id) return null;
    // Antes de ir a la base: los ids de la vitrina no existen en `products`, la
    // consulta volveria vacia y la ficha contestaria 404.
    const prueba = productoDemo(id);
    if (prueba) return prueba;
    const [filas] = await pool.query(
        `SELECT ${COLUMNAS},
                GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') AS tags
         FROM products p
         LEFT JOIN product_tags pt ON p.id = pt.product_id
         LEFT JOIN tags t ON pt.tag_id = t.id
         WHERE p.empresa_id = ? AND p.id = ?
         GROUP BY p.id`,
        [EMPRESA_ID, id]
    );
    return normalizar(filas[0]);
}

/**
 * "Productos similares": misma categoria o alguna etiqueta en comun.
 *
 * `is_adult` se filtra al mismo valor que el producto de origen a proposito: la
 * ficha de un tomo normal no puede terminar recomendando +18, ni al reves, que
 * romperia la puerta de edad por la puerta de atras.
 *
 * El orden es fijo (etiquetas en comun, luego categoria, luego disponibilidad)
 * en vez de RAND(): con un orden estable la respuesta se puede cachear y la
 * fila de recomendados no baila entre recargas.
 */
export async function obtenerSimilares(producto, limite = 4) {
    if (!producto?.id) return [];
    if (producto.demo) return similaresDemo(producto, limite);

    const tags = producto.tags || [];
    const conTags = tags.length > 0;

    // Sin etiquetas no se puede armar el IN (...): mysql2 expandiria un array
    // vacio a `IN ()`, que es error de sintaxis. Se cae a solo-categoria.
    const puntajeTags = conTags
        ? 'COUNT(DISTINCT CASE WHEN t.name IN (?) THEN t.name END)'
        : '0';

    const parametros = [producto.category ?? null];
    if (conTags) parametros.push(tags);
    parametros.push(EMPRESA_ID, producto.id, producto.is_adult ? 1 : 0, limite);

    const [filas] = await pool.query(
        `SELECT ${COLUMNAS},
                (p.category <=> ?) AS misma_categoria,
                ${puntajeTags}     AS etiquetas_comunes
         FROM products p
         LEFT JOIN product_tags pt ON p.id = pt.product_id
         LEFT JOIN tags t ON pt.tag_id = t.id
         WHERE p.empresa_id = ?
           AND p.id <> ?
           AND p.is_adult = ?
         GROUP BY p.id
         HAVING misma_categoria = 1 OR etiquetas_comunes > 0
         ORDER BY etiquetas_comunes DESC, misma_categoria DESC, (p.stock > 0) DESC, p.id DESC
         LIMIT ?`,
        parametros
    );

    return filas.map(f => normalizar({ ...f, tags: null }));
}
