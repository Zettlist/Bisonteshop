import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';

export async function GET() {
    try {
        const clienteId = await getClienteId();
        if (!clienteId) return NextResponse.json({ orders: [] });

        const [sales] = await pool.query(
            `SELECT s.id, s.subtotal, s.discount, s.surcharge, s.total, s.payment_method, s.created_at,
                    s.web_status, s.claim_status, s.tracking_number, s.envia_quote_data, bo.items_json
             FROM sales s
             INNER JOIN bisonte_orders bo ON bo.sale_id = s.id
             WHERE s.cliente_id = ?
             ORDER BY s.created_at DESC`,
            [clienteId]
        );

        if (!sales.length) return NextResponse.json({ orders: [] });

        const saleIds = sales.map(s => s.id);

        const [dbItems] = await pool.query(
            `SELECT si.sale_id, si.quantity, si.price,
                    p.name, p.image_url
             FROM sale_items si
             LEFT JOIN products p ON p.id = si.product_id
             WHERE si.sale_id IN (?)`,
            [saleIds]
        );

        const itemsBySale = {};
        for (const item of dbItems) {
            if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = [];
            itemsBySale[item.sale_id].push(item);
        }

        const orders = sales.map(sale => {
            const saleItems = itemsBySale[sale.id] || [];
            const firstItem = saleItems[0];

            // Detectar preventa desde items_json de bisonte_orders
            let isPreventa = false;
            try {
                const parsed = JSON.parse(sale.items_json || '[]');
                isPreventa = parsed.some(i => i.type === 'preventa');
            } catch {}

            // Extraer carrier desde envia_quote_data
            let carrier = null;
            try {
                const qd = JSON.parse(sale.envia_quote_data || '{}');
                carrier = qd.carrier || qd.carrier_name || null;
                if (carrier) carrier = carrier.toLowerCase();
            } catch {}

            // Mapear web_status de sales a status visible en ecommerce
            const statusMap = {
                pendiente:  'verificando',
                confirmado: 'preparando',
                envio:      'transito',
                entregado:  'entregado',
                reclamo:    'reclamo',
                cancelado:  'cancelado',
            };
            const status = statusMap[sale.web_status] || 'verificando';

            return {
                id: String(sale.id),
                date: sale.created_at,
                status,
                claimStatus: sale.claim_status || null,
                itemName: firstItem?.name || 'Artículo',
                itemsCount: saleItems.reduce((a, i) => a + i.quantity, 0),
                type: isPreventa ? 'Preventa' : 'Pedido Normal',
                image: firstItem?.image_url || null,
                total: Number(sale.total),
                subtotal: Number(sale.subtotal),
                discount: Number(sale.discount),
                shipping: Number(sale.surcharge),
                trackingNumber: sale.tracking_number || null,
                carrier: carrier,
                payments: [{ id: `pay_${sale.id}`, amount: Number(sale.total), date: sale.created_at }],
                items: saleItems.map(i => ({
                    name: i.name,
                    quantity: i.quantity,
                    price: Number(i.price),
                    image: i.image_url,
                })),
            };
        });

        return NextResponse.json({ orders });
    } catch (err) {
        console.error('[Orders API]', err.message);
        return NextResponse.json({ orders: [] });
    }
}
