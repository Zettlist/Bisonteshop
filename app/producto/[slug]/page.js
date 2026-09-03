import { notFound } from 'next/navigation';
import { obtenerProducto, obtenerSimilares } from '@/lib/productos';
import { idDeSlug } from '@/lib/slug';
import FichaProducto from '@/components/producto/FichaProducto';

// La ficha se rehace cada cinco minutos. El precio y el stock los mueve el POS
// durante el dia, asi que no puede quedarse estatica; y no vale la pena
// pegarle a la base en cada visita para un catalogo que cambia por goteo.
export const revalidate = 300;

async function cargar(slug) {
    const id = idDeSlug(slug);
    if (!id) return null;
    return obtenerProducto(id);
}

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const producto = await cargar(slug);
    if (!producto) return { title: 'Producto no encontrado | Bisonte Manga' };

    // El +18 no se indexa: el buscador no pasa por la puerta de edad, asi que
    // una miniatura del catalogo adulto acabaria en resultados sin aviso.
    const robots = producto.is_adult ? { index: false, follow: false } : undefined;

    return {
        title: `${producto.title} | Bisonte Manga`,
        description: producto.sinopsis?.slice(0, 155) || `${producto.title} en Bisonte Manga.`,
        robots,
        openGraph: {
            title: producto.title,
            description: producto.sinopsis?.slice(0, 200) || undefined,
            images: producto.image_url && !producto.is_adult ? [producto.image_url] : undefined,
            type: 'website',
        },
    };
}

export default async function PaginaProducto({ params }) {
    const { slug } = await params;
    const producto = await cargar(slug);
    if (!producto) notFound();

    const similares = await obtenerSimilares(producto);

    return <FichaProducto producto={producto} similares={similares} />;
}
