import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Los apartados del cliente que tiene la sesion abierta.
 *
 * La tabla `anticipos` la escribe el POS: aqui solo se lee. Un apartado se
 * enlaza a la cuenta por `cliente_id`, que el mostrador rellena cuando la
 * persona da su correo o su numero de cliente; los de quien nunca se registro
 * no aparecen aqui porque no hay a que cuenta atarlos.
 *
 * Los dias restantes se calculan en SQL y no en el navegador: el reloj del
 * telefono de quien consulta puede estar en otra zona horaria o simplemente
 * mal, y de ese numero depende que alguien crea que le quedan dos dias.
 */
export async function GET() {
    const clienteId = await getClienteId();
    if (!clienteId) {
        return NextResponse.json({ success: false, error: 'No has iniciado sesión.' }, { status: 401 });
    }

    const [apartados] = await pool.query(`
        SELECT a.id, a.folio, a.tipo, a.status, a.created_at, a.expires_at,
               a.total_amount, a.paid_amount,
               (a.total_amount - a.paid_amount) AS saldo,
               DATEDIFF(DATE(a.expires_at), CURDATE()) AS dias_restantes
          FROM anticipos a
         WHERE a.cliente_id = ?
         ORDER BY (a.status = 'pending') DESC, a.expires_at ASC, a.id DESC
         LIMIT 50
    `, [clienteId]);

    if (apartados.length === 0) {
        return NextResponse.json({ success: true, apartados: [] });
    }

    // Los articulos de todos los apartados en una consulta: el listado del
    // perfil los pinta todos y una consulta por apartado seria N+1.
    const ids = apartados.map((a) => a.id);
    const [items] = await pool.query(`
        SELECT ai.anticipo_id, ai.quantity, ai.unit_price,
               p.id AS product_id, p.name AS title, p.image_url
          FROM anticipo_items ai
          JOIN products p ON p.id = ai.product_id
         WHERE ai.anticipo_id IN (?)
    `, [ids]);

    const porApartado = new Map(ids.map((id) => [id, []]));
    for (const item of items) {
        porApartado.get(item.anticipo_id)?.push({
            product_id: item.product_id,
            title: item.title,
            image_url: item.image_url,
            quantity: item.quantity,
            unit_price: Number(item.unit_price),
        });
    }

    return NextResponse.json({
        success: true,
        apartados: apartados.map((a) => ({
            id: a.id,
            folio: a.folio,
            tipo: a.tipo,
            status: a.status,
            created_at: a.created_at,
            expires_at: a.expires_at,
            total: Number(a.total_amount),
            pagado: Number(a.paid_amount),
            saldo: Number(a.saldo),
            dias_restantes: a.status === 'pending' ? Number(a.dias_restantes) : null,
            items: porApartado.get(a.id) ?? [],
        })),
    });
}
