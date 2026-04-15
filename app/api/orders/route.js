import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

const getJwtSecretKey = () => new TextEncoder().encode(process.env.JWT_SECRET || 'bisonte_super_secret_key_123!');

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('bisonte_session')?.value;
        if (!token) return NextResponse.json({ orders: [] });

        const { payload } = await jwtVerify(token, getJwtSecretKey());
        const clienteId = payload.id;

        const [sales] = await pool.query(
            `SELECT s.id, s.subtotal, s.discount, s.surcharge, s.total, s.payment_method, s.created_at,
                    bo.status AS web_status, bo.items_json
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

            // Mapear status de bisonte_orders a status visible
            const statusMap = {
                pending:   'verificando',
                captured:  'preparando',
                cancelled: 'cancelado',
            };
            const status = statusMap[sale.web_status] || 'verificando';

            return {
                id: String(sale.id),
                date: sale.created_at,
                status,
                itemName: firstItem?.name || 'Artículo',
                itemsCount: saleItems.reduce((a, i) => a + i.quantity, 0),
                type: isPreventa ? 'Preventa' : 'Pedido Normal',
                image: firstItem?.image_url || null,
                total: Number(sale.total),
                subtotal: Number(sale.subtotal),
                discount: Number(sale.discount),
                shipping: Number(sale.surcharge),
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
