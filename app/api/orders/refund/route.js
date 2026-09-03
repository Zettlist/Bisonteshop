import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/refund
 *
 * Called by TorlanPos when staff cancels an already-captured (confirmed) order.
 * Body: { saleId: number, apiKey: string, reason?: string }
 *
 * - Issues a full Stripe refund for the captured PaymentIntent
 * - Updates bisonte_orders.pago_estado = 'reembolsado' y guarda refund_id
 * - Does NOT modify stock (TorlanPos handles stock restoration)
 */
export async function POST(request) {
  // Fuera del try: el catch de abajo lo necesita para marcar el reembolso
  // cuando Stripe responde que el cargo ya estaba devuelto. Antes leia
  // `request._saleId`, que nunca existio, y ese UPDATE no tocaba ninguna fila.
  let saleId = null;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    const body = await request.json();
    const { apiKey, reason } = body;
    saleId = body.saleId;

    // Auth
    if (!apiKey || apiKey !== process.env.CAPTURE_API_KEY) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    if (!saleId) {
      return NextResponse.json({ success: false, error: 'saleId requerido' }, { status: 400 });
    }

    // Fetch order from bisonte_orders
    const [rows] = await pool.query(
      'SELECT * FROM bisonte_orders WHERE sale_id = ? LIMIT 1',
      [saleId]
    );

    if (!rows.length) {
      return NextResponse.json(
        { success: false, error: `No se encontró pedido web para sale_id ${saleId}` },
        { status: 404 }
      );
    }

    const order = rows[0];

    // Already refunded — idempotent
    if (order.pago_estado === 'reembolsado') {
      return NextResponse.json({ success: true, alreadyRefunded: true, saleId });
    }

    // Solo se devuelve dinero que se cobro. Una autorizacion sin capturar se
    // libera con /capture action=cancel, no se reembolsa.
    if (order.pago_estado !== 'capturado') {
      return NextResponse.json(
        { success: false, error: `No se puede reembolsar un pedido con pago en estado: ${order.pago_estado}` },
        { status: 409 }
      );
    }

    const paymentIntentId = order.payment_intent_id;

    // Issue full refund via Stripe
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: reason || 'requested_by_customer',
    });

    // Se guarda tambien el id del reembolso: la columna existe y sin ella no
    // hay forma de casar el movimiento con Stripe desde la base.
    await pool.query(
      'UPDATE bisonte_orders SET pago_estado = ?, refund_id = ? WHERE sale_id = ?',
      ['reembolsado', refund.id, saleId]
    );

    console.log(`[Refund] Pedido #${saleId} reembolsado. Refund ID: ${refund.id} | PI: ${paymentIntentId}`);

    return NextResponse.json({
      success: true,
      saleId,
      refund_id: refund.id,
      amount: refund.amount,
      status: refund.status,
    });

  } catch (error) {
    console.error('[Refund API Error]', error.message);

    // Stripe already refunded this charge
    if (error.code === 'charge_already_refunded' && saleId) {
      await pool.query(
        "UPDATE bisonte_orders SET pago_estado = 'reembolsado' WHERE sale_id = ?",
        [saleId]
      ).catch(() => {});
      return NextResponse.json({ success: true, alreadyRefunded: true, error: error.message });
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
