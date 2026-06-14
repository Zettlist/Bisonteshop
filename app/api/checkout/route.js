import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { priceCart, priceCoupon, round2 } from '@/lib/pricing';
import { getUsdRate } from '@/lib/fx';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  // Auth guard — rechaza peticiones sin sesión (valida firma + revocación)
  const userId = await getClienteId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Debes iniciar sesión para comprar.' }, { status: 401 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  try {
    const body = await request.json();
    const { items, discountCode, saveCard, currency: clientCurrency, shippingCost: clientShippingCost } = body;

    // ── 1. Precios DESDE LA BD (nunca del cliente) ───────────────────────
    const { lines, subtotal, errors } = await priceCart(items);
    if (errors.length) {
      return NextResponse.json({ success: false, error: errors[0] }, { status: 400 });
    }

    // Envío: acotado server-side (el cliente solo elige entre cotizaciones reales)
    const rawShipping = parseFloat(clientShippingCost);
    const shippingCost = (rawShipping >= 10 && rawShipping <= 2000) ? rawShipping : 220;

    let totalCharge = round2(subtotal + shippingCost);

    // ── 2. Cupón validado en BD (sobre el subtotal real) ─────────────────
    // Nota: usage_count y el límite por usuario se aplican en la CAPTURA (no aquí),
    // para no quemar cupones en carritos abandonados o pagos fallidos.
    const { coupon, amount: appliedDiscount, error: couponError } = await priceCoupon(discountCode, subtotal, userId);
    if (discountCode && couponError) {
      return NextResponse.json({ success: false, error: couponError }, { status: 400 });
    }
    if (appliedDiscount > 0) totalCharge = round2(totalCharge - appliedDiscount);

    // ── 3. Crédito de tienda (el saldo real lo tiene la BD) ──────────────
    // Se "aplica" para reducir el cargo; se DESCUENTA del saldo en la captura.
    let appliedCreditFinal = 0;
    const [creditRows] = await pool.query(`SELECT store_credit FROM clientes WHERE id = ?`, [userId]);
    const saldo = parseFloat(creditRows[0]?.store_credit) || 0;
    if (saldo > 0) {
      appliedCreditFinal = round2(Math.min(saldo, totalCharge));
      totalCharge = round2(totalCharge - appliedCreditFinal);
    }

    // ── 4. Stripe Customer (para tarjetas guardadas) ─────────────────────
    let stripeCustomerId = null;
    const [clienteRows] = await pool.query('SELECT stripe_customer_id, nombre, apellido, email FROM clientes WHERE id = ? LIMIT 1', [userId]);
    if (clienteRows.length) {
      const cliente = clienteRows[0];
      if (cliente.stripe_customer_id) {
        stripeCustomerId = cliente.stripe_customer_id;
      } else if (saveCard) {
        const customer = await stripe.customers.create({
          email: cliente.email,
          name: `${cliente.nombre} ${cliente.apellido || ''}`.trim(),
          metadata: { bisonte_cliente_id: String(userId) },
        });
        stripeCustomerId = customer.id;
        await pool.query('UPDATE clientes SET stripe_customer_id = ? WHERE id = ?', [stripeCustomerId, userId]);
      }
    }

    // ── 5. Moneda y tipo de cambio SERVER-SIDE ───────────────────────────
    const stripeCurrency = (clientCurrency === 'USD') ? 'usd' : 'mxn';
    const usdRate = await getUsdRate();
    const chargeAmount = stripeCurrency === 'usd' ? totalCharge * usdRate : totalCharge;
    const amountInCents = Math.max(Math.round(chargeAmount * 100), 10);

    // ── Idempotencia: doble-clic / reintento no debe crear PaymentIntents duplicados.
    // La llave depende del usuario + carrito + cupón + envío + moneda: mismo pedido →
    // Stripe devuelve el MISMO PaymentIntent. Si el carrito cambia, la llave cambia.
    const fingerprint = JSON.stringify({
      u: userId,
      items: lines.map(l => [l.id, l.quantity, l.unitPrice]).sort(),
      cupon: coupon?.code || '',
      envio: shippingCost,
      cur: stripeCurrency,
      cents: amountInCents,
    });
    const idempotencyKey = `checkout:${crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 48)}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: stripeCurrency,
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      ...(stripeCustomerId && { customer: stripeCustomerId }),
      ...(stripeCustomerId && saveCard && { setup_future_usage: 'off_session' }),
      metadata: {
        userId: String(userId),
        discountCode: coupon?.code || '',
        couponId: coupon ? String(coupon.id) : '',
        appliedDiscount: appliedDiscount.toFixed(2),
        appliedCredit: appliedCreditFinal.toFixed(2),
        // Totales MXN autoritativos (para el registro del pedido en la confirmación)
        subtotalMXN: subtotal.toFixed(2),
        shippingMXN: shippingCost.toFixed(2),
        totalMXN: totalCharge.toFixed(2),
      },
    }, { idempotencyKey });

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
