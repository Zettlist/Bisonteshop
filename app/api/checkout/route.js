import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { priceCart, priceCoupon, round2, huellaCarrito } from '@/lib/pricing';
import { getUsdRate } from '@/lib/fx';
import { firmarPedidoSaldo } from '@/lib/pedidoSaldo';
import { leerEnvio } from '@/lib/envioFirmado';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Lo minimo que Stripe acepta cobrar, por moneda. No es una politica de la
// tienda: es un limite de la pasarela, y por debajo contesta `amount_too_small`.
const MINIMO_STRIPE = { mxn: 10, usd: 0.5 };

export async function POST(request) {
  // Auth guard — rechaza peticiones sin sesión (valida firma + revocación)
  const userId = await getClienteId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Debes iniciar sesión para comprar.' }, { status: 401 });
  }

  // Cada llamada crea un PaymentIntent en Stripe y pide el tipo de cambio.
  // Nadie paga diez veces por minuto, y sin freno una sesion en bucle -- un bug
  // del checkout, o alguien probando -- llena la cuenta de Stripe de intentos
  // muertos y nos acerca a sus limites justo cuando alguien quiere pagar de
  // verdad. Va por cuenta, que es lo que autoriza el gasto: es el mismo freno
  // que ya tenian la recarga de saldo y el apartado.
  const { allowed, retryAfter } = rateLimit(`checkout:${userId}`, 15, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: `Demasiados intentos seguidos. Espera ${retryAfter} segundos.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  // Perfil completo — la tienda es 18+ y las cuentas creadas con Google entran
  // sin fecha de nacimiento. Este es el corte de verdad: el aviso de la interfaz
  // se puede ignorar, esto no.
  const [perfil] = await pool.query('SELECT fecha_nac FROM clientes WHERE id = ? LIMIT 1', [userId]);
  if (!perfil.length || !perfil[0].fecha_nac) {
    return NextResponse.json(
      { success: false, needsProfile: true, error: 'Agrega tu fecha de nacimiento para poder comprar.' },
      { status: 403 }
    );
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  try {
    const body = await request.json();
    const { items, discountCode, saveCard, currency: clientCurrency, shippingToken } = body;

    // ── 1. Precios DESDE LA BD (nunca del cliente) ───────────────────────
    const { lines, subtotal, errors, sinExistencia } = await priceCart(items);
    if (errors.length) {
      return NextResponse.json({ success: false, error: errors[0] }, { status: 400 });
    }

    // ── 1-bis. Y que quede mercancia ─────────────────────────────────────
    // Esta es la puerta que faltaba. Con nueve piezas entraban nueve pedidos
    // y tambien el decimo: `stock` no descuenta lo que ya tiene dueño, y la
    // tienda no apartaba nada, asi que los nueve anteriores eran invisibles
    // para el que llegaba despues. El decimo cliente pagaba, esperaba, y se
    // enteraba dias mas tarde por un correo de cancelacion.
    //
    // `stock_disponible` (stock - stock_reservado) si los ve, y el corte va
    // ANTES de crear el PaymentIntent: mas vale un "se agoto" en la pantalla
    // del carrito que una autorizacion que hay que deshacer.
    //
    // No es la ultima palabra -- dos clientes pueden llegar aqui a la vez y
    // pasar los dos. La decision de verdad la toma la reserva atomica de
    // /api/checkout/confirm (lib/reserva.js). Esto es lo que evita que el caso
    // normal llegue siquiera a plantearselo.
    if (sinExistencia.length) {
      const nombres = sinExistencia.map(f => `"${f.name}"`).join(', ');
      return NextResponse.json({
        success: false,
        sinExistencia,
        error: sinExistencia.length === 1
          ? `Ya no queda ${nombres}. Quita el artículo del carrito para continuar.`
          : `Ya no quedan estos artículos: ${nombres}. Quítalos del carrito para continuar.`,
      }, { status: 409 });
    }

    // La mercancia cotizada, resumida en un hash. Viaja con los totales (en el
    // metadata o en el token) y /api/checkout/confirm la vuelve a calcular
    // sobre lo que le manden: sin esto el carrito que se paga y el que se
    // empaca podian ser dos carritos distintos.
    const itemsHash = huellaCarrito(lines);

    // ── 2. Envío: el precio lo pone la COTIZACION, no el navegador ───────
    // Antes llegaba como un numero suelto (`shippingCost`) y aqui solo se
    // comprobaba que cayera entre $10 y $2,000. Mandar `10` donde la
    // cotizacion decia `220` salia gratis: la tienda le paga a la paqueteria
    // los $220 igual. Ahora se exige el vale que firmo /api/shipping/quote.
    //
    // Se falla cerrado a proposito. Sin vale no hay pedido, y no se cae de
    // vuelta a los $220 de antes: un valor por defecto es exactamente el
    // agujero que esto viene a tapar.
    const cotizacion = await leerEnvio(shippingToken);
    if (!cotizacion) {
      return NextResponse.json(
        { success: false, envioInvalido: true, error: 'Vuelve a elegir el envío: la cotización expiró o no es válida.' },
        { status: 400 }
      );
    }
    // Y el vale tiene que ser de ESTE carrito: el precio depende del tamaño del
    // paquete, asi que el de un solo manga no puede pagar una caja de veinte.
    if (cotizacion.itemsHash !== itemsHash) {
      return NextResponse.json(
        { success: false, envioInvalido: true, error: 'Tu carrito cambió. Vuelve a elegir el envío.' },
        { status: 409 }
      );
    }
    // El vale tiene que decir A DONDE se cotizo. Un vale sin destino salio de
    // /api/shipping/quote antes de que esto existiera; caduca a la hora, asi
    // que exigirlo solo cuesta una recotizacion a quien tenga la pestaña
    // abierta desde antes del despliegue.
    if (!cotizacion.destino) {
      return NextResponse.json(
        { success: false, envioInvalido: true, error: 'Vuelve a elegir el envío: la cotización expiró o no es válida.' },
        { status: 400 }
      );
    }
    const shippingCost = round2(cotizacion.precio);

    let totalCharge = round2(subtotal + shippingCost);

    // ── 3. Cupón validado en BD (sobre el subtotal real) ─────────────────
    // Nota: usage_count y el límite por usuario se aplican en la CAPTURA (no aquí),
    // para no quemar cupones en carritos abandonados o pagos fallidos.
    const { coupon, amount: appliedDiscount, error: couponError } = await priceCoupon(discountCode, subtotal, userId);
    if (discountCode && couponError) {
      return NextResponse.json({ success: false, error: couponError }, { status: 400 });
    }
    if (appliedDiscount > 0) totalCharge = round2(totalCharge - appliedDiscount);

    // ── 4. Moneda y tipo de cambio SERVER-SIDE ───────────────────────────
    // Va antes del crédito porque el mínimo que Stripe acepta cobrar depende
    // de la moneda, y ese mínimo condiciona cuánto saldo se puede aplicar.
    const stripeCurrency = (clientCurrency === 'USD') ? 'usd' : 'mxn';
    const usdRate = await getUsdRate();
    // El mínimo, traído a pesos: es en MXN donde se decide el saldo a aplicar.
    const minimoCobrableMXN = stripeCurrency === 'usd'
      ? round2(MINIMO_STRIPE.usd / usdRate) + 0.01
      : MINIMO_STRIPE.mxn;

    // ── 5. Crédito de tienda (el saldo real lo tiene la BD) ──────────────
    // Se "aplica" para reducir el cargo; se DESCUENTA del saldo al registrar
    // el pedido, en /api/checkout/confirm.
    //
    // El saldo puede dejar el cargo en cero, y ese es su caso de uso central:
    // comprar sin poner tarjeta. Lo que NO puede es dejarlo en una cifra que
    // Stripe rechace — por debajo de su mínimo contesta `amount_too_small` y
    // el checkout entero se cae con un error que no dice nada. Así que hay
    // tres desenlaces y no dos:
    //
    //   · el saldo cubre todo          → cargo 0, sin PaymentIntent
    //   · el saldo deja menos del mín. → se aplica un poco menos de saldo y
    //                                    la tarjeta paga el mínimo
    //   · el saldo no llega            → lo de siempre
    //
    // El del medio le deja al cliente unos pesos de saldo sin gastar, que es
    // preferible a cobrarle de más o a no dejarle comprar.
    let appliedCreditFinal = 0;
    const [creditRows] = await pool.query(`SELECT store_credit FROM clientes WHERE id = ?`, [userId]);
    const saldo = parseFloat(creditRows[0]?.store_credit) || 0;
    if (saldo > 0) {
      if (saldo >= totalCharge) {
        appliedCreditFinal = totalCharge;
      } else {
        const resto = round2(totalCharge - saldo);
        appliedCreditFinal = resto < minimoCobrableMXN
          ? round2(totalCharge - minimoCobrableMXN)
          : saldo;
      }
      appliedCreditFinal = round2(Math.max(0, appliedCreditFinal));
      totalCharge = round2(totalCharge - appliedCreditFinal);
    }

    // ── 6. El pedido que no pasa por la tarjeta ──────────────────────────
    // Sin cargo no hay PaymentIntent que crear, y sin PaymentIntent no hay
    // metadata donde apoyar los totales. Ese papel lo hace un token firmado
    // por el servidor: mismo efecto, cero dependencia de Stripe.
    if (totalCharge <= 0) {
      const { token, ref } = await firmarPedidoSaldo({
        clienteId: userId,
        itemsHash,
        subtotal,
        discount: appliedDiscount,
        credit: appliedCreditFinal,
        shipping: shippingCost,
        envioDestino: cotizacion.destino,
        total: 0,
        couponId: coupon?.id || null,
      });
      return NextResponse.json({
        success: true,
        sinCargo: true,
        pedidoToken: token,
        referencia: ref,
        appliedDiscount,
        appliedCredit: appliedCreditFinal,
        totalCharge: 0,
      });
    }

    // ── 7. Stripe Customer (para tarjetas guardadas) ─────────────────────
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

    // ── 8. El importe que ve la tarjeta ──────────────────────────────────
    // Sin el `Math.max(..., 10)` que habia aqui: aquel clamp eran 10 CENTAVOS
    // y el minimo de Stripe en MXN son $10.00 — mil centavos. No salvaba nada;
    // solo convertia un cargo demasiado pequeño en un error de Stripe. Ahora el
    // minimo se respeta arriba, al decidir cuanto saldo se aplica.
    const chargeAmount = stripeCurrency === 'usd' ? totalCharge * usdRate : totalCharge;
    const amountInCents = Math.round(chargeAmount * 100);

    // ── Idempotencia: doble-clic / reintento no debe crear PaymentIntents duplicados.
    // La llave depende del usuario + carrito + cupón + envío + moneda: mismo pedido →
    // Stripe devuelve el MISMO PaymentIntent. Si el carrito cambia, la llave cambia.
    //
    // `v` es la version de la FORMA del PaymentIntent, y sube cada vez que
    // cambia lo que se le manda a Stripe con la misma llave. Sin ella, un
    // carrito cotizado antes de un despliegue que toque el metadata da la
    // misma llave con parametros distintos, y Stripe contesta
    // `idempotency_error`: un 500 y "Error al procesar el pago" para un
    // cliente que no hizo nada raro. Paso de verdad al añadir `itemsHash`.
    //
    // `saveCard` va dentro por lo mismo: cambia `setup_future_usage`, asi que
    // dos intentos del mismo carrito que solo se diferencian en la casilla de
    // guardar la tarjeta son dos peticiones distintas.
    // ── Meses sin intereses ─────────────────────────────────────────────────
    //
    // Los financia el comercio, no el banco: Stripe cobra un 5% a 3 meses, 7.5%
    // a 6, 10% a 9 y 12.5% a 12, ENCIMA de su comision normal. En un pedido de
    // $1,000 a doce meses son $125 que salen del margen.
    //
    // Por eso hay monto minimo: ofrecer meses en un manga de $350 cuesta mas de
    // lo que deja. MSI_MONTO_MINIMO esta en pesos y MSI_ACTIVO enciende o apaga
    // todo, las dos como variables de entorno para poder cambiarlas sin
    // desplegar -- una decision de margen no deberia pedir un despliegue.
    //
    // Stripe decide que plazos ofrece: solo salen en tarjetas de credito
    // mexicanas de consumo, y las de debito o corporativas no los ven. Nosotros
    // solo decimos que si. Comprobado contra la API que acepta meses junto con
    // capture_method 'manual', que es como cobra esta tienda.
    // El corte va sobre el SUBTOTAL de la mercancia -- el carrito completo --
    // y no sobre lo que acaba pasando por la tarjeta. Son cosas distintas en
    // cuanto hay saldo de tienda o un cupon de por medio: un carrito de $3,200
    // con $500 de saldo cobra $2,700, y medir ahi dejaria sin meses a un pedido
    // que si llega al minimo. La regla es del carrito, asi que se mide el
    // carrito.
    //
    // Y `subtotal` esta siempre en pesos. `amountInCents`, que es lo que se
    // miraba antes, va en la moneda del cargo: con la tienda en USD comparaba
    // centavos de dolar contra un minimo en pesos, asi que los meses no salian
    // nunca. No se noto porque son de tarjetas mexicanas, que pagan en MXN.
    const msiActivo = process.env.MSI_ACTIVO === '1';
    const msiMinimo = Number(process.env.MSI_MONTO_MINIMO || 3000);
    const conMeses = msiActivo && subtotal >= msiMinimo;

    const fingerprint = JSON.stringify({
      v: 3,
      u: userId,
      items: lines.map(l => [l.id, l.quantity, l.unitPrice]).sort(),
      cupon: coupon?.code || '',
      envio: shippingCost,
      cur: stripeCurrency,
      cents: amountInCents,
      guardar: Boolean(saveCard),
      // Va dentro por lo mismo que `guardar`: un intento con meses y otro sin
      // ellos son dos PaymentIntents distintos. Sin esto, encender MSI dejaria
      // a los carritos ya cotizados reusando el intento viejo, sin la opcion.
      meses: conMeses,
    });
    const idempotencyKey = `checkout:${crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 48)}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: stripeCurrency,
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      ...(conMeses && { payment_method_options: { card: { installments: { enabled: true } } } }),
      ...(stripeCustomerId && { customer: stripeCustomerId }),
      ...(stripeCustomerId && saveCard && { setup_future_usage: 'off_session' }),
      metadata: {
        userId: String(userId),
        discountCode: coupon?.code || '',
        couponId: coupon ? String(coupon.id) : '',
        appliedDiscount: appliedDiscount.toFixed(2),
        appliedCredit: appliedCreditFinal.toFixed(2),
        // La mercancia que se cotizo. /confirm la exige y la compara.
        itemsHash,
        // Y el destino al que se cotizo, por lo mismo: el precio del envio
        // depende de a donde va, y /confirm es quien recibe la direccion.
        envioDestino: cotizacion.destino,
        // La paqueteria y el servicio que se cotizaron. Van aqui porque el
        // objeto de la cotizacion llega a /confirm en el cuerpo, y de el saca
        // el POS con quien genera la guia: sin fijarlos, se puede pagar el
        // terrestre y pedir el expres, que la tienda paga igual.
        envioCarrier: cotizacion.carrier || '',
        envioService: cotizacion.service || '',
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
