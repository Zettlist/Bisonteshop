import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export async function POST(request) {
  try {
    const { items, userId, discountCode, appliedCredit: clientCredit, saveCard } = await request.json();

    // 1. Calcular totales en el backend (no confiar en el cliente)
    let subtotalStock = 0;
    let subtotalAnticipos = 0;

    for (const item of items) {
      const price = parseFloat(item.price);
      if (item.type === 'preventa') {
        subtotalAnticipos += price * (parseFloat(item.anticipo_percent) / 100) * item.quantity;
      } else {
        subtotalStock += price * item.quantity;
      }
    }

    const shippingCost = 150;
    let totalCharge = subtotalStock + subtotalAnticipos + shippingCost;

    // 2. Validar cupón en DB
    let appliedDiscount = 0;
    if (discountCode) {
      const empresaId = process.env.EMPRESA_ID || null;
      const [coupons] = await pool.query(
        `SELECT * FROM coupons
         WHERE code = ?
           AND status = 'active'
           AND (empresa_id = ? OR empresa_id IS NULL)
           AND (expiration_date IS NULL OR expiration_date > NOW())
           AND (usage_limit IS NULL OR usage_count < usage_limit)
         LIMIT 1`,
        [discountCode.toUpperCase(), empresaId]
      );

      if (coupons.length > 0) {
        const coupon = coupons[0];
        const base = subtotalStock + subtotalAnticipos;
        if (coupon.discount_type === 'percentage') {
          appliedDiscount = (base * parseFloat(coupon.discount_value)) / 100;
        } else {
          appliedDiscount = parseFloat(coupon.discount_value);
        }
        appliedDiscount = Math.min(appliedDiscount, totalCharge);
        totalCharge -= appliedDiscount;

        // Incrementar usage_count
        await pool.query(`UPDATE coupons SET usage_count = usage_count + 1 WHERE id = ?`, [coupon.id]);
      }
    }

    // 3. Aplicar crédito de tienda
    let appliedCreditFinal = 0;
    if (userId) {
      const [rows] = await pool.query(`SELECT store_credit FROM clientes WHERE id = ?`, [userId]);
      if (rows.length > 0 && rows[0].store_credit > 0) {
        appliedCreditFinal = Math.min(rows[0].store_credit, totalCharge);
        totalCharge -= appliedCreditFinal;
      }
    }

    // 4. Obtener/crear Stripe Customer si el usuario quiere guardar tarjeta
    let stripeCustomerId = null;
    if (userId && saveCard) {
      const [clienteRows] = await pool.query('SELECT stripe_customer_id, nombre, apellido, email FROM clientes WHERE id = ? LIMIT 1', [userId]);
      if (clienteRows.length) {
        const cliente = clienteRows[0];
        if (cliente.stripe_customer_id) {
          stripeCustomerId = cliente.stripe_customer_id;
        } else {
          const customer = await stripe.customers.create({
            email: cliente.email,
            name: `${cliente.nombre} ${cliente.apellido || ''}`.trim(),
            metadata: { bisonte_cliente_id: String(userId) },
          });
          stripeCustomerId = customer.id;
          await pool.query('UPDATE clientes SET stripe_customer_id = ? WHERE id = ?', [stripeCustomerId, userId]);
        }
      }
    }

    // 5. Crear PaymentIntent en Stripe (mínimo 10 centavos)
    const amountInCents = Math.max(Math.round(totalCharge * 100), 10);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'mxn',
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      ...(stripeCustomerId && { customer: stripeCustomerId, setup_future_usage: 'off_session' }),
      metadata: {
        userId: userId?.toString() || 'guest',
        discountCode: discountCode || '',
        appliedDiscount: appliedDiscount.toFixed(2),
        appliedCredit: appliedCreditFinal.toFixed(2),
      }
    });

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      appliedDiscount,
      appliedCredit: appliedCreditFinal,
      totalCharge,
    });

  } catch (error) {
    console.error('Checkout API Error:', error);
    return NextResponse.json({ success: false, error: 'Error al procesar el pago' }, { status: 500 });
  }
}
