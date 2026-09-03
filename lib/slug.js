/**
 * URL de producto: `<id>-<titulo>`.
 *
 * El id va delante y es lo unico que se lee para resolver la ficha. Asi el
 * titulo puede cambiar en el POS sin romper los enlaces que ya circulan, y no
 * hace falta una columna `slug` en `products` — que es tabla compartida con el
 * POS y no toca ensancharla por una necesidad de la web.
 */

// Sin acentos ni signos: NFD separa la letra de su tilde y el rango \u0300-\u036f
// borra las tildes sueltas. Lo que no sea a-z0-9 se vuelve guion.
export function slugDeProducto(producto) {
    if (!producto?.id) return '';
    const titulo = (producto.title || producto.name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 70);
    return titulo ? `${producto.id}-${titulo}` : String(producto.id);
}

export function rutaDeProducto(producto) {
    return `/producto/${slugDeProducto(producto)}`;
}

// Solo el numero de cabeza. Devuelve null si no lo hay, para que la pagina
// conteste 404 en vez de mandar un NaN a la consulta.
export function idDeSlug(slug) {
    const m = /^(\d+)/.exec(String(slug || ''));
    return m ? Number(m[1]) : null;
}
