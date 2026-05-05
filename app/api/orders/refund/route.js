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
 * - Updates bisonte_orders.status = 'refunded'
 * - Does NOT modify stock (TorlanPos handles stock restoration)
 */
export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

  try {
    const { saleId, apiKey, reason } = await request.json();

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
    if (order.status === 'refunded') {
      return NextResponse.json({ success: true, alreadyRefunded: true, saleId });
    }

    // Only captured orders can be refunded
    if (order.status !== 'captured') {
      return NextResponse.json(
        { success: false, error: `No se puede reembolsar un pedido en estado: ${order.status}` },
        { status: 409 }
      );
    }

    const paymentIntentId = order.payment_intent_id;

    // Issue full refund via Stripe
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: reason || 'requested_by_customer',
    });

    // Update bisonte_orders status
    await pool.query(
      "UPDATE bisonte_orders SET status = 'refunded', updated_at = NOW() WHERE sale_id = ?",
      [saleId]
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
    if (error.code === 'charge_already_refunded') {
      await pool.query(
        "UPDATE bisonte_orders SET status = 'refunded', updated_at = NOW() WHERE sale_id = ?",
        [request._saleId]
      ).catch(() => {});
      return NextResponse.json({ success: true, alreadyRefunded: true, error: error.message });
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
