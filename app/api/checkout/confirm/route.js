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
    // `userId` ya no se lee del body a proposito: ver el comentario de clienteId.
    const { paymentIntentId, items, userEmail, userName, shippingMethod, envia_quote_data, shipping_address } = await request.json();

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

    // El cliente tambien es autoritativo: `userId` del body lo escribe el
    // navegador y se puede cambiar, y con el se decide a quien se le descuenta
    // el credito de tienda en /capture. El del metadata lo fijo el servidor.
    const clienteId = parseInt(md.userId) || null;

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

      // 4. Insertar en sales. Esta tabla es la venta contable y nada mas: el
      //    cliente web, el estado del pedido y los datos de envio se guardaban
      //    aqui (cliente_id, web_status, shipping_method, envia_quote_data,
      //    shipping_address_json) y ninguna de esas columnas existe. Todas
      //    viven en bisonte_orders. `origen` es lo que separa la venta web de
      //    la del mostrador en los cortes del POS.
      const [saleResult] = await conn.query(
        `INSERT INTO sales (empresa_id, user_id, origen, subtotal, discount, surcharge, total, payment_method, created_at)
         VALUES (?, ?, 'web', ?, ?, ?, ?, 'card', NOW())`,
        [
          EMPRESA_ID,
          resolvedUserId,
          subtotal,
          discount,
          shipping,
          totalFinal,
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

      // 6. bisonte_orders: el pedido web. Dos ejes separados, no uno solo
      //    (`status`) como antes: `pago_estado` es lo que pasa en Stripe y
      //    `estado` es donde va el paquete. Aqui nace autorizado y pendiente:
      //    el dinero esta retenido y el POS aun no confirma existencias.
      //    Los renglones no se copian a items_json (columna que ya no existe);
      //    estan normalizados en sale_items, que es de donde los lee todo lo
      //    demas.
      await conn.query(
        `INSERT INTO bisonte_orders
            (sale_id, cliente_id, payment_intent_id, pago_estado, estado,
             shipping_method, shipping_address_json, envia_quote_data)
         VALUES (?, ?, ?, 'autorizado', 'pendiente', ?, ?, ?)`,
        [
          saleId,
          clienteId,
          paymentIntentId,
          shippingMethod || 'envia',
          shipping_address ? JSON.stringify(shipping_address) : null,
          envia_quote_data ? JSON.stringify(envia_quote_data) : null,
        ]
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

      // Reintento del mismo pago (doble clic, reintento de red): el UNIQUE de
      // payment_intent_id lo rechaza y antes eso salia como un 500 generico
      // DESPUES de haber cobrado, con el cliente viendo un error por un pedido
      // que si existe. La unicidad la impone la base; aqui solo se traduce a
      // la respuesta que corresponde: el pedido que ya se habia registrado.
      if (dbError.code === 'ER_DUP_ENTRY') {
        const [previo] = await conn.query(
          'SELECT sale_id FROM bisonte_orders WHERE payment_intent_id = ? LIMIT 1',
          [paymentIntentId]
        );
        if (previo.length) {
          console.log(`[Confirm] PI ${paymentIntentId} ya estaba registrado como pedido #${previo[0].sale_id}`);
          return NextResponse.json({ success: true, saleId: previo[0].sale_id, repetido: true });
        }
      }

      throw dbError;
    } finally {
      conn.release();
    }

  } catch (error) {
    console.error('Confirm API Error:', error);
    return NextResponse.json({ success: false, error: 'Error al confirmar el pedido' }, { status: 500 });
  }
}
