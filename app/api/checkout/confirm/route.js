import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { sendOrderConfirmation } from '@/lib/mailer';
import { priceCart, round2 } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  try {
    const { paymentIntentId, items, userId, userEmail, userName, shippingMethod, envia_quote_data, shipping_address } = await request.json();

    if (!paymentIntentId || !items?.length) {
      return NextResponse.json({ success: false, error: 'Datos incompletos' }, { status: 400 });
    }

    // 1. Verificar con Stripe que la autorización fue exitosa
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'requires_capture') {
      return NextResponse.json({ success: false, error: `Estado de pago inválido: ${paymentIntent.status}` }, { status: 400 });
    }

    // 2. Montos AUTORITATIVOS: del metadata del PaymentIntent (lo fijó el server en /checkout),
    //    nunca de lo que mande el cliente aquí.
    const md = paymentIntent.metadata || {};
    const subtotal = parseFloat(md.subtotalMXN) || 0;
    const discount = parseFloat(md.appliedDiscount) || 0;
    const credit = parseFloat(md.appliedCredit) || 0;
    const shipping = parseFloat(md.shippingMXN) || 0;
    const totalFinal = parseFloat(md.totalMXN) || round2(subtotal - discount + shipping - credit);

    // Precios reales por línea desde la BD (para sale_items)
    const { lines } = await priceCart(items);
    const lineById = new Map(lines.map(l => [l.id, l]));

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 3. user_id válido de PosTorlan
      let resolvedUserId = process.env.WEB_USER_ID ? Number(process.env.WEB_USER_ID) : null;
      if (!resolvedUserId) {
        const [usersRows] = await conn.query(
          'SELECT id FROM users WHERE empresa_id = ? ORDER BY id ASC LIMIT 1',
          [EMPRESA_ID]
        );
        if (!usersRows.length) throw new Error(`No hay usuarios para empresa_id ${EMPRESA_ID}`);
        resolvedUserId = usersRows[0].id;
      }

      // 4. Insertar en sales
      const [saleResult] = await conn.query(
        `INSERT INTO sales (empresa_id, user_id, cliente_id, subtotal, discount, surcharge, total, payment_method, web_status, shipping_method, envia_quote_data, shipping_address_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'card', 'pendiente', 'envia', ?, ?, NOW())`,
        [
          EMPRESA_ID,
          resolvedUserId,
          userId || null,
          subtotal,
          discount,
          shipping,
          totalFinal,
          envia_quote_data ? JSON.stringify(envia_quote_data) : null,
          shipping_address ? JSON.stringify(shipping_address) : null,
        ]
      );
      const saleId = saleResult.insertId;

      // 5. sale_items con precios reales de BD
      for (const item of items) {
        const line = lineById.get(Number(item.id));
        if (!line) continue; // producto inexistente: ya no factura
        await conn.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)`,
          [saleId, line.id, line.quantity, line.unitPrice]
        );
      }

      // 6. bisonte_orders
      await conn.query(
        `INSERT INTO bisonte_orders (sale_id, payment_intent_id, status, cliente_id, items_json)
         VALUES (?, ?, 'pending', ?, ?)`,
        [saleId, paymentIntentId, userId || null, JSON.stringify(items)]
      );

      await conn.commit();

      // 7. Correo de confirmación
      if (userEmail) {
        sendOrderConfirmation({
          to: userEmail,
          nombre: userName || 'Cliente',
          saleId,
          items: items.map(i => ({ ...i, stockOk: true })),
          subtotal,
          discount,
          shipping,
          total: totalFinal,
        }).catch(err => console.error('[Mailer]', err.message));
      }

      console.log(`[Confirm] Pedido #${saleId} registrado. PI ${paymentIntentId}`);
      // La guía Envia.com y la captura del cobro ocurren en el POS al confirmar existencia.

      return NextResponse.json({ success: true, saleId });

    } catch (dbError) {
      await conn.rollback();
      throw dbError;
    } finally {
      conn.release();
    }

  } catch (error) {
    console.error('Confirm API Error:', error);
    return NextResponse.json({ success: false, error: 'Error al confirmar el pedido' }, { status: 500 });
  }
}
