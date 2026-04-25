import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { sendOrderConfirmation } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const POS_URL = process.env.POS_TORLAN_URL || 'http://localhost:3001';
const POS_API_KEY = process.env.CAPTURE_API_KEY;
const EMPRESA_ID = process.env.EMPRESA_ID || 122;

export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  try {
    const { paymentIntentId, items, userId, userEmail, userName, subtotal, discount, shipping, total } = await request.json();

    if (!paymentIntentId || !items?.length) {
      return NextResponse.json({ success: false, error: 'Datos incompletos' }, { status: 400 });
    }

    // 1. Verificar con Stripe que la autorización fue exitosa
    // Con capture_method: 'manual', el estado es 'requires_capture' (fondos reservados, no cobrados)
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'requires_capture') {
      return NextResponse.json({ success: false, error: `Estado de pago inválido: ${paymentIntent.status}` }, { status: 400 });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const surcharge = Number(shipping) || 150;
      const totalFinal = Number(total) || (Number(subtotal) - Number(discount) + surcharge);

      // 2. Obtener user_id válido de PosTorlan (NO es el cliente, es el cajero/sistema)
      let resolvedUserId = process.env.WEB_USER_ID ? Number(process.env.WEB_USER_ID) : null;
      if (!resolvedUserId) {
        const [usersRows] = await conn.query(
          'SELECT id FROM users WHERE empresa_id = ? ORDER BY id ASC LIMIT 1',
          [EMPRESA_ID]
        );
        if (!usersRows.length) throw new Error(`No hay usuarios para empresa_id ${EMPRESA_ID}`);
        resolvedUserId = usersRows[0].id;
      }

      // 3. Insertar en sales (pedido visible en PosTorlan)
      const [saleResult] = await conn.query(
        `INSERT INTO sales (empresa_id, user_id, cliente_id, subtotal, discount, surcharge, total, payment_method, web_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'card', 'pendiente', NOW())`,
        [
          EMPRESA_ID,
          resolvedUserId,
          userId || null,
          Number(subtotal) || 0,
          Number(discount) || 0,
          surcharge,
          totalFinal,
        ]
      );
      const saleId = saleResult.insertId;

      // 4. Insertar sale_items (stock NO se descuenta aquí, se descuenta al capturar)
      for (const item of items) {
        await conn.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)`,
          [saleId, item.id, Number(item.quantity) || 1, Number(item.price) || 0]
        );
      }

      // 5. Registrar en bisonte_orders: vincula sale_id ↔ payment_intent_id para captura posterior
      await conn.query(
        `INSERT INTO bisonte_orders (sale_id, payment_intent_id, status, cliente_id, items_json)
         VALUES (?, ?, 'pending', ?, ?)`,
        [saleId, paymentIntentId, userId || null, JSON.stringify(items)]
      );

      await conn.commit();

      // 6. Correo de confirmación al cliente (fondos reservados, verificando existencias)
      if (userEmail) {
        sendOrderConfirmation({
          to: userEmail,
          nombre: userName || 'Cliente',
          saleId,
          items: items.map(i => ({ ...i, stockOk: true })),
          subtotal: Number(subtotal) || 0,
          discount: Number(discount) || 0,
          shipping: surcharge,
          total: totalFinal,
        }).catch(err => console.error('[Mailer]', err.message));
      }

      console.log(`[Confirm] Pedido #${saleId} registrado. PI ${paymentIntentId} — iniciando auto-process...`);

      // Disparar auto-process en POS Torlan (sin bloquear la respuesta al cliente)
      fetch(`${POS_URL}/api/web-orders/${saleId}/auto-process`, {
        method: 'POST',
        headers: { 'x-api-key': POS_API_KEY },
      }).then(r => r.json()).then(d => {
        console.log(`[AutoProcess] Pedido #${saleId}:`, d);
      }).catch(err => {
        console.error(`[AutoProcess] Error llamando POS para pedido #${saleId}:`, err.message);
      });

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
