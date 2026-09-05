import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';

/**
 * La calificacion que deja un cliente en un producto.
 *
 * Una opinion por persona y producto: PUT la pone o la cambia, DELETE la quita.
 * No se acumulan, por eso no hay POST — mandar dos veces la misma nota no puede
 * inflar el promedio.
 *
 * `products.rating` y `products.rating_count` se recalculan aqui dentro de la
 * misma transaccion. Es lo que hace que no haya que tocar nada mas: la tarjeta
 * del catalogo, el estante del landing y la ficha ya leen esas dos columnas.
 *
 * Los productos de prueba de lib/demo.js no se pueden calificar: no existen en
 * la tabla `products`, sus notas son literales del archivo, y guardar una
 * opinion contra un id que no esta reventaria la llave foranea. Se contesta 404
 * antes de llegar ahi.
 */

const SIN_SESION = { success: false, error: 'Inicia sesión para calificar' };

async function existeProducto(id) {
    const [filas] = await pool.query('SELECT id FROM products WHERE id = ? LIMIT 1', [id]);
    return filas.length > 0;
}

/**
 * Deja products.rating al dia con lo que haya en product_reviews.
 *
 * AVG sobre cero filas devuelve NULL, que es justo el estado "sin calificar":
 * quitar la unica opinion de un producto lo devuelve a no tener estrellas, no a
 * tener un cero.
 */
async function recalcular(conn, productId) {
    await conn.query(
        `UPDATE products p
            SET p.rating       = (SELECT ROUND(AVG(v.rating), 1) FROM product_reviews v WHERE v.product_id = p.id),
                p.rating_count = (SELECT COUNT(*)                FROM product_reviews v WHERE v.product_id = p.id)
          WHERE p.id = ?`,
        [productId]
    );
    const [filas] = await conn.query(
        'SELECT rating, rating_count FROM products WHERE id = ? LIMIT 1',
        [productId]
    );
    return {
        rating: filas[0]?.rating != null ? Number(filas[0].rating) : null,
        rating_count: filas[0]?.rating_count ?? 0,
    };
}

/** La nota de quien pregunta, para que la ficha pinte marcadas las suyas. */
export async function GET(_req, { params }) {
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isInteger(productId)) {
        return NextResponse.json({ success: false, error: 'Id inválido' }, { status: 400 });
    }

    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ success: true, autenticado: false, nota: null });

    const [filas] = await pool.query(
        'SELECT rating FROM product_reviews WHERE product_id = ? AND cliente_id = ? LIMIT 1',
        [productId, clienteId]
    );
    return NextResponse.json({
        success: true,
        autenticado: true,
        nota: filas.length ? Number(filas[0].rating) : null,
    });
}

export async function PUT(req, { params }) {
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isInteger(productId)) {
        return NextResponse.json({ success: false, error: 'Id inválido' }, { status: 400 });
    }

    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json(SIN_SESION, { status: 401 });

    // Por cuenta, no por IP: la nota exige sesion, asi que el limite util es el
    // que frena a una cuenta recorriendo el catalogo a golpe de script.
    const { allowed, retryAfter } = rateLimit(`opinion:${clienteId}`, 30, 60_000);
    if (!allowed) {
        return NextResponse.json(
            { success: false, error: 'Demasiadas calificaciones seguidas. Espera un momento.' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    let body;
    try { body = await req.json(); } catch { body = {}; }
    const nota = Number(body?.nota);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
        return NextResponse.json(
            { success: false, error: 'La calificación va de 1 a 5 estrellas' },
            { status: 400 }
        );
    }

    if (!await existeProducto(productId)) {
        return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            `INSERT INTO product_reviews (product_id, cliente_id, rating)
                  VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating)`,
            [productId, clienteId, nota]
        );
        const resumen = await recalcular(conn, productId);
        await conn.commit();
        return NextResponse.json({ success: true, nota, ...resumen });
    } catch (e) {
        await conn.rollback();
        console.error('PUT /api/productos/[id]/opinion:', e);
        return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
    } finally {
        conn.release();
    }
}

export async function DELETE(_req, { params }) {
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isInteger(productId)) {
        return NextResponse.json({ success: false, error: 'Id inválido' }, { status: 400 });
    }

    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json(SIN_SESION, { status: 401 });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            'DELETE FROM product_reviews WHERE product_id = ? AND cliente_id = ?',
            [productId, clienteId]
        );
        const resumen = await recalcular(conn, productId);
        await conn.commit();
        return NextResponse.json({ success: true, nota: null, ...resumen });
    } catch (e) {
        await conn.rollback();
        console.error('DELETE /api/productos/[id]/opinion:', e);
        return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
    } finally {
        conn.release();
    }
}
