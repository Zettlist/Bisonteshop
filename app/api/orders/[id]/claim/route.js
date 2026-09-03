import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';

// POST /api/orders/[id]/claim
export async function POST(req, { params }) {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { id } = await params;
    const { claim_reason, claim_notes } = await req.json();

    if (!claim_reason) {
        return NextResponse.json({ error: 'Motivo requerido' }, { status: 400 });
    }

    try {
        // El pedido web vive en bisonte_orders: ahi estan el cliente, el estado
        // de entrega y el eje del reclamo. La consulta anterior los pedia como
        // columnas de `sales` (s.web_status, s.cliente_id) — columnas que el
        // esquema actual no tiene — y la ruta devolvia 500 siempre.
        const [[order]] = await pool.query(
            `SELECT bo.sale_id, bo.estado, bo.claim_status, c.nombre, c.apellido, c.email
             FROM bisonte_orders bo
             INNER JOIN clientes c ON c.id = bo.cliente_id
             WHERE bo.sale_id = ? AND bo.cliente_id = ?`,
            [id, clienteId]
        );

        if (!order) {
            return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
        }

        // El reclamo abierto se descarta primero: antes esta rama iba despues
        // del filtro de estados claimables y no se alcanzaba nunca.
        if (order.estado === 'reclamo') {
            return NextResponse.json({ error: 'Ya existe un reclamo activo para este pedido' }, { status: 400 });
        }

        // `envio` y `entregado` son los valores del enum; la tienda los muestra
        // como "En tránsito" y "Entregado".
        if (!['envio', 'entregado'].includes(order.estado)) {
            return NextResponse.json({ error: 'Solo puedes levantar un reclamo para pedidos en tránsito o entregados' }, { status: 400 });
        }

        const fullNotes = `[${claim_reason}] ${claim_notes || ''}`.trim();

        await pool.query(
            `UPDATE bisonte_orders
             SET estado = 'reclamo',
                 claim_status = 'disputa',
                 claim_type = 'cliente',
                 claim_notes = ?
             WHERE sale_id = ? AND cliente_id = ?`,
            [fullNotes, id, clienteId]
        );

        // Send email via Resend directly
        await sendClaimEmail(order, id, fullNotes);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Claim POST]', err.message);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}

async function sendClaimEmail(cliente, orderId, notes) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !cliente.email) return;

    const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f4f5;padding:32px 16px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#dc2626">BISONTE MANGA</div>
          </div>
          <div style="background:#fff;border-radius:16px;padding:32px;border-top:3px solid #f59e0b">
            <h2 style="color:#f59e0b;margin:0 0 12px">Hemos recibido tu reclamo</h2>
            <p style="color:#374151">Hola <strong>${cliente.nombre} ${cliente.apellido}</strong>,</p>
            <p style="color:#374151">Tu reclamo para el pedido <strong>#${orderId}</strong> ha sido registrado.</p>
            ${notes ? `<div style="background:#fffbeb;padding:16px;border-radius:10px;border-left:4px solid #f59e0b;margin:16px 0">
              <p style="margin:0;font-size:14px;color:#92400e">${notes}</p>
            </div>` : ''}
            <p style="color:#374151">Nuestro equipo revisará tu caso y <strong>nos comunicaremos contigo</strong> a la brevedad para darte seguimiento.</p>
            <p style="color:#6b7280;font-size:14px">Si tienes alguna pregunta urgente puedes escribirnos a <a href="mailto:soporte@bisontemanga.com" style="color:#dc2626">soporte@bisontemanga.com</a></p>
          </div>
          <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">© 2026 Bisonte Manga · Este es un correo automático</p>
        </div>`;

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Bisonte Manga <noreply@bisontemanga.com>',
                to: cliente.email,
                subject: `⚠️ Reclamo recibido — Pedido #${orderId} — Bisonte Manga`,
                html,
            }),
        });
        const data = await res.json();
        console.log('[Claim email]', data.id || data.error);
    } catch (e) {
        console.error('[Claim email error]', e.message);
    }
}
