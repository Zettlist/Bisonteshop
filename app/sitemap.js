import pool from '@/lib/db';
import { rutaDeProducto } from '@/lib/slug';

// Se arma en cada peticion y no al construir la imagen: al construir no hay
// base de datos a la que preguntar, y un mapa congelado en el despliegue
// dejaria fuera todo lo que se dé de alta despues.
export const dynamic = 'force-dynamic';

const BASE = 'https://bisontemanga.com';
const EMPRESA_ID = process.env.EMPRESA_ID || 122;

/**
 * El mapa del sitio que se le da a Google: las paginas de la tienda y una
 * entrada por producto a la venta.
 *
 * Los productos salen con el mismo filtro que la vitrina -- nada de prueba y
 * nada +18 -- porque lo que no se enseña en el catalogo tampoco se anuncia al
 * buscador.
 */
export default async function sitemap() {
    const fijas = [
        { url: `${BASE}/`, changeFrequency: 'daily', priority: 1 },
        { url: `${BASE}/mangas`, changeFrequency: 'daily', priority: 0.9 },
        { url: `${BASE}/figuras`, changeFrequency: 'weekly', priority: 0.8 },
        { url: `${BASE}/contacto`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/privacidad`, changeFrequency: 'yearly', priority: 0.2 },
    ];

    // Si la base no contesta, el mapa sale con las paginas fijas en vez de
    // tumbarse: un mapa corto es mejor que un error que Google reintenta.
    try {
        const [filas] = await pool.query(
            `SELECT id, name, created_at
               FROM products
              WHERE empresa_id = ? AND es_prueba = 0 AND is_adult = 0`,
            [EMPRESA_ID]
        );
        const productos = filas.map((p) => ({
            url: `${BASE}${rutaDeProducto({ id: p.id, name: p.name })}`,
            lastModified: p.created_at || undefined,
            changeFrequency: 'weekly',
            priority: 0.7,
        }));
        return [...fijas, ...productos];
    } catch (err) {
        console.error('[sitemap] Sin productos:', err.message);
        return fijas;
    }
}
