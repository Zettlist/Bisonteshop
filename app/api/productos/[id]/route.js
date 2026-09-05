import { NextResponse } from 'next/server';
import { obtenerProducto, obtenerSimilares } from '@/lib/productos';

/**
 * Un producto suelto, con sus similares.
 *
 * La ficha en popup monta el mismo componente que la pagina, y ese componente
 * pide producto + similares. El listado del catalogo no sirve: trae menos
 * columnas y ningun recomendado, asi que la ficha saldria coja.
 *
 * Se cachea igual que la pagina (cinco minutos): el precio y el stock los
 * mueve el POS durante el dia, pero el catalogo cambia por goteo.
 */
export async function GET(_req, { params }) {
    const { id } = await params;
    const producto = await obtenerProducto(Number(id));

    if (!producto) {
        return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 });
    }

    // La puerta de edad vive en la ficha de /adultos. Si esta ruta sirviera un
    // +18, el popup del landing normal la saltaria por detras.
    if (producto.is_adult) {
        return NextResponse.json({ success: false, error: 'No disponible aqui' }, { status: 404 });
    }

    const similares = await obtenerSimilares(producto);

    return NextResponse.json(
        { success: true, producto, similares },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
}
