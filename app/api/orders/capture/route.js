import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { sendOrderConfirmation } from '@/lib/mailer';
import { devolverCredito } from '@/lib/credito';

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
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
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

    // El eje del dinero es `pago_estado`, no `status` (columna que no existe).
    // Solo se puede cobrar o liberar lo que sigue autorizado: si ya se capturo,
    // cancelo o reembolso, reintentar aqui seria cobrar dos veces.
    if (order.pago_estado !== 'autorizado') {
      return NextResponse.json({ success: false, error: `El pedido ya fue procesado (pago: ${order.pago_estado})` }, { status: 409 });
    }

    const paymentIntentId = order.payment_intent_id;

    if (action === 'capture') {
      // ── CAPTURAR: cobrar al cliente ──────────────────────────────
      // Stock deduction is handled exclusively by TorlanPos (deductStock with stock_deducted guard).
      // Bisonte only handles the Stripe capture and status update.
      await stripe.paymentIntents.capture(paymentIntentId);

      // Solo se mueve el eje del cobro. El eje de la entrega (`estado`) lo
      // escribe el POS cuando confirma existencias y prepara el envio: si la
      // tienda lo adelantara aqui, el pedido se veria confirmado antes de que
      // nadie haya tocado el paquete. `updated_at` se actualiza sola.
      //
      // El `AND pago_estado = 'autorizado'` repite la comprobacion de arriba a
      // proposito: aquella leyo y solto la fila, y dos llamadas del POS a la
      // vez la pasan las dos. La condicion del UPDATE es la que de verdad deja
      // pasar a una sola.
      await pool.query(
        "UPDATE bisonte_orders SET pago_estado = 'capturado' WHERE sale_id = ? AND pago_estado = 'autorizado'",
        [saleId]
      );

      // Efectos que SOLO deben ocurrir cuando el dinero se cobra de verdad
      // (no en autorizaciones abandonadas o canceladas):
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const md = pi.metadata || {};
        // El cliente autoritativo lo fijó /checkout en el metadata (no confiar en order.cliente_id,
        // que viene del body de /confirm y es manipulable).
        const clienteId = parseInt(md.userId) || order.cliente_id || null;

        // El saldo de tienda YA NO se toca aqui. Se descuenta al registrar el
        // pedido (/api/checkout/confirm), porque entre autorizar y capturar
        // pasan dias y durante esos dias el saldo seguia entero en la cuenta:
        // el mismo credito se aplicaba a un segundo pedido y a un tercero, y
        // el GREATEST(0, ...) que habia aqui se tragaba la diferencia en
        // silencio en vez de impedirla. Lo que este pedido consumio esta en
        // `bisonte_orders.credito_aplicado`, y la rama de cancelar lo devuelve.

        // Cupón: registrar el canje (un canje por cliente y cupón) e incrementar el uso
        //    SOLO si el canje es nuevo. Antes se quemaba al crear el PI (carritos abandonados)
        //    y un mismo cliente podía reusar un cupón global en varios pedidos.
        const couponId = parseInt(md.couponId) || null;
        if (couponId && clienteId) {
          // `coupon_redemptions` esta en db/schema.sql; ya no se crea aqui.
          // El INSERT IGNORE de abajo se apoya en su UNIQUE (coupon_id, cliente_id).
          const [ins] = await pool.query(
            'INSERT IGNORE INTO coupon_redemptions (coupon_id, cliente_id, sale_id) VALUES (?, ?, ?)',
            [couponId, clienteId, saleId]
          );
          if (ins.affectedRows === 1) {
            await pool.query(
              'UPDATE coupons SET usage_count = usage_count + 1 WHERE id = ? AND (usage_limit IS NULL OR usage_count < usage_limit)',
              [couponId]
            );
          }
        }
      } catch (sideErr) {
        // El cobro ya ocurrió; estos ajustes no deben tumbar la respuesta.
        console.error('[Capture] Ajuste post-cobro falló:', sideErr.message);
      }

      console.log(`[Capture] Pedido #${saleId} capturado exitosamente. PI: ${paymentIntentId}`);
      return NextResponse.json({ success: true, action: 'captured', saleId, stockErrors: [] });

    } else {
      // ── CANCELAR: liberar autorización, no cobrar ────────────────
      await stripe.paymentIntents.cancel(paymentIntentId);

      // Aqui si se mueven los dos ejes: una autorizacion liberada no deja
      // pedido que entregar, y `cancelled_at` es lo que fecha la cancelacion.
      //
      // Y con ellos vuelve el saldo. El pedido se lo comio al nacer
      // (/api/checkout/confirm) y ya no va a existir: dejarlo descontado seria
      // quedarse con un dinero que el cliente pago hace semanas por un pedido
      // que la tienda misma cancelo. Va en una transaccion con el cambio de
      // estado, y el `AND pago_estado = 'autorizado'` es lo que hace que dos
      // cancelaciones seguidas devuelvan el saldo UNA vez.
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [upd] = await conn.query(
          `UPDATE bisonte_orders
              SET pago_estado = 'cancelado', estado = 'cancelado', cancelled_at = NOW()
            WHERE sale_id = ? AND pago_estado = 'autorizado'`,
          [saleId]
        );
        if (upd.affectedRows === 1 && order.credito_aplicado > 0) {
          await devolverCredito(
            conn, order.cliente_id, order.credito_aplicado,
            `Saldo devuelto: pedido #${saleId} cancelado`
          );
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        // La autorizacion ya se libero en Stripe. Si esto falla, el pedido
        // queda marcado como autorizado sin nada que capturar y el saldo sin
        // devolver: las dos cosas se arreglan a mano y hay que verlas.
        console.error(`[Capture] Pedido #${saleId} liberado en Stripe pero sin cerrar en la base:`, e.message);
        throw e;
      } finally {
        conn.release();
      }

      console.log(`[Capture] Pedido #${saleId} CANCELADO. PI ${paymentIntentId} liberado.`);
      return NextResponse.json({ success: true, action: 'cancelled', saleId });
    }

  } catch (error) {
    console.error('[Capture API Error]', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
