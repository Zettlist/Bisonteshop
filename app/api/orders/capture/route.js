import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { sendOrderConfirmation } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/capture
 *
 * Llamado por PosTorlan cuando el staff verifica las existencias.
 * Body: { saleId: number, action: 'capture' | 'cancel', apiKey: string }
 *
 * - 'capture': cobra al cliente y descuenta stock
 * - 'cancel':  libera la autorización, no se cobra nada
 */
export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  try {
    const { saleId, action, apiKey } = await request.json();

    // Verificar API key
    if (!apiKey || apiKey !== process.env.CAPTURE_API_KEY) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    if (!saleId || !['capture', 'cancel'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Parámetros inválidos' }, { status: 400 });
    }

    // Obtener el registro de bisonte_orders
    const [rows] = await pool.query(
      'SELECT * FROM bisonte_orders WHERE sale_id = ? LIMIT 1',
      [saleId]
    );

    if (!rows.length) {
      return NextResponse.json({ success: false, error: `No se encontró pedido web para sale_id ${saleId}` }, { status: 404 });
    }

    const order = rows[0];

    if (order.status !== 'pending') {
      return NextResponse.json({ success: false, error: `El pedido ya fue procesado (status: ${order.status})` }, { status: 409 });
    }

    const paymentIntentId = order.payment_intent_id;
    const items = JSON.parse(order.items_json || '[]');

    if (action === 'capture') {
      // ── CAPTURAR: cobrar al cliente ──────────────────────────────
      // Stock deduction is handled exclusively by TorlanPos (deductStock with stock_deducted guard).
      // Bisonte only handles the Stripe capture and status update.
      await stripe.paymentIntents.capture(paymentIntentId);

      await pool.query(
        "UPDATE bisonte_orders SET status = 'captured', updated_at = NOW() WHERE sale_id = ?",
        [saleId]
      );

      console.log(`[Capture] Pedido #${saleId} capturado exitosamente. PI: ${paymentIntentId}`);
      return NextResponse.json({ success: true, action: 'captured', saleId, stockErrors: [] });

    } else {
      // ── CANCELAR: liberar autorización, no cobrar ────────────────
      await stripe.paymentIntents.cancel(paymentIntentId);

      await pool.query(
        "UPDATE bisonte_orders SET status = 'cancelled', updated_at = NOW() WHERE sale_id = ?",
        [saleId]
      );

      console.log(`[Capture] Pedido #${saleId} CANCELADO. PI ${paymentIntentId} liberado.`);
      return NextResponse.json({ success: true, action: 'cancelled', saleId });
    }

  } catch (error) {
    console.error('[Capture API Error]', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
