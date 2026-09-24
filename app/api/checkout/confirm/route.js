import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { sendOrderConfirmation, sendNewOrderAlert } from '@/lib/mailer';
import { priceCart, round2, huellaCarrito } from '@/lib/pricing';
import { getClienteId } from '@/lib/auth';
import { gastarCredito } from '@/lib/credito';
import { leerPedidoSaldo } from '@/lib/pedidoSaldo';
import { huellaDestino } from '@/lib/envioFirmado';
import { reservarStock } from '@/lib/reserva';
import { medidasDelCarrito, armarPaquete } from '@/lib/paquete';
import { usuarioWeb } from '@/lib/usuarioWeb';

export const dynamic = 'force-dynamic';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

/**
 * Lo que se guarda de la tarjeta, sacado del cargo de Stripe.
 *
 * Nada de esto es sensible: la marca y los cuatro ultimos son justo lo que se
 * puede guardar, y es lo que el cliente ve en su estado de cuenta. El numero
 * completo vive en Stripe y ahi se queda.
 *
 * Si algo falla se devuelve null y el pedido sigue: saber que tarjeta fue es
 * util, no es motivo para tumbar una compra ya autorizada.
 */
function detalleDeTarjeta(cargo) {
  const card = cargo?.payment_method_details?.card;
  if (!card) return null;

  // Stripe llama `funding` a lo que aqui se pregunta como "credito o debito".
  const tipos = { credit: 'credito', debit: 'debito', prepaid: 'prepago' };

  // Meses sin intereses. Hoy siempre sale 0 porque el PaymentIntent no pide
  // `installments` -- la tienda no los ofrece todavia. Se lee igual para que el
  // dia que se activen no haya que tocar esto.
  const meses = Number(card.installments?.plan?.count) || 0;

  return {
    marca: card.brand || null,
    ultimos4: card.last4 || null,
    tipo: tipos[card.funding] || 'desconocido',
    meses: meses > 0 && meses < 256 ? meses : 0,
    detalle: card,
  };
}

/**
 * Como se pago, en una palabra.
 *
 * Antes esto era la cadena 'card' escrita a mano en el INSERT, pasara lo que
 * pasara. Veintitres pedidos pagados enteros con saldo decian "tarjeta", y el
 * desglose por metodo de pago del POS los sumaba en la columna equivocada.
 */
function comoSePago({ credito, total }) {
  if (credito > 0 && total <= 0) return 'saldo';
  if (credito > 0) return 'mixto';
  return 'tarjeta';
}

export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

  // Esta ruta registra pedidos y gasta saldo, y hasta ahora no miraba la
  // sesion: se apoyaba entera en que el pago fuera valido. El id de un
  // PaymentIntent no es un secreto —viaja al navegador dentro del
  // clientSecret—, asi que quien lo tuviera podia registrar el pedido desde
  // fuera de la sesion. El dueño autoritativo sigue siendo el del metadata;
  // esto es la puerta de antes.
  const sesionId = await getClienteId();
  if (!sesionId) {
    return NextResponse.json({ success: false, error: 'Debes iniciar sesión para comprar.' }, { status: 401 });
  }

  try {
    // `userId` ya no se lee del body a proposito: ver el comentario de clienteId.
    // `userEmail` y `userName` ya no se leen: el correo sale de la cuenta. Ver el paso 9.
    const { paymentIntentId, pedidoToken, items, shippingMethod, envia_quote_data, shipping_address } = await request.json();

    if ((!paymentIntentId && !pedidoToken) || !items?.length) {
      return NextResponse.json({ success: false, error: 'Datos incompletos' }, { status: 400 });
    }

    // Sin telefono la paqueteria no puede avisar, y sin paqueteria el pedido
    // llega al POS sin saber con quien se genera la guia. El checkout ya los
    // pide; esto es para que un pedido que no pase por el formulario tampoco
    // entre sin ellos. Va antes de tocar el pago: no hay nada que deshacer.
    const telefono = String(shipping_address?.telefono || '').replace(/\D/g, '');
    if (telefono.length < 10) {
      return NextResponse.json({ success: false, error: 'Falta un teléfono de contacto de 10 dígitos.' }, { status: 400 });
    }
    if (!envia_quote_data?.carrier) {
      return NextResponse.json({ success: false, envioInvalido: true, error: 'Elige una paquetería para el envío.' }, { status: 400 });
    }

    // 1. Comprobar que el pago existe y esta en regla.
    //
    //    Hay dos formas de llegar aqui con un pedido pagado, y las dos acaban
    //    en el mismo sitio: un `md` con los totales que fijo el servidor.
    //
    //      · con tarjeta — el metadata lo devuelve Stripe
    //      · pagado entero con saldo — no hay cargo ni PaymentIntent, y el
    //        metadata viaja en un token que firmo /api/checkout
    //
    //    Lo que importa de las dos es lo mismo: los importes NO los pone el
    //    navegador. Alli lo garantiza Stripe; aqui, la firma.
    let md, referencia, tarjeta = null;
    if (pedidoToken) {
      md = await leerPedidoSaldo(pedidoToken);
      if (!md) {
        return NextResponse.json({ success: false, error: 'Pedido no válido o expirado.' }, { status: 400 });
      }
      referencia = md.ref;
    } else {
      // `latest_charge` expandido: es lo unico que sabe QUE tarjeta fue. Con
      // captura manual el cargo ya existe aqui, en requires_capture, asi que no
      // hay que esperar al cobro para saberlo. Y el dia del reclamo "tarjeta"
      // no contesta nada -- "Visa terminada en 4242, credito" contesta todo.
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge'],
      });
      if (paymentIntent.status !== 'requires_capture') {
        return NextResponse.json({ success: false, error: `Estado de pago inválido: ${paymentIntent.status}` }, { status: 400 });
      }
      md = paymentIntent.metadata || {};
      referencia = paymentIntentId;
      tarjeta = detalleDeTarjeta(paymentIntent.latest_charge);
    }
    const subtotal = parseFloat(md.subtotalMXN) || 0;
    const discount = parseFloat(md.appliedDiscount) || 0;
    const credit = parseFloat(md.appliedCredit) || 0;
    const shipping = parseFloat(md.shippingMXN) || 0;
    const totalFinal = parseFloat(md.totalMXN) || round2(subtotal - discount + shipping - credit);

    // Se decide aqui, con los importes que fijo el servidor -- los del metadata
    // de Stripe o los del token firmado. No mas abajo con lo que diga el
    // navegador, que es de donde venia el 'card' de siempre.
    const pagoTipo = comoSePago({ credito: credit, total: totalFinal });

    // El cliente tambien es autoritativo: `userId` del body lo escribe el
    // navegador y se puede cambiar, y con el se decide a quien se le descuenta
    // el credito de tienda en /capture. El del metadata lo fijo el servidor.
    const clienteId = parseInt(md.userId) || null;

    // El pago tiene dueño y la sesion tambien: tienen que ser el mismo. Sin
    // esto, un pago ajeno registraria un pedido a nombre de su dueño con la
    // direccion de envio de quien manda la peticion.
    if (clienteId !== sesionId) {
      return NextResponse.json({ success: false, error: 'Este pago no es tuyo.' }, { status: 403 });
    }

    // ¿Este pago ya tiene su pedido? Se mira antes de tocar nada.
    //
    // El UNIQUE de payment_intent_id ya paraba el duplicado, pero al final de
    // la transaccion: antes pasaban la reserva de piezas y el descuento del
    // saldo. Si el reintento (doble clic, se corto la red) llegaba cuando la
    // pieza ya no alcanzaba -- porque la tenia apartada el propio pedido --
    // la reserva fallaba y la ruta SOLTABA EL COBRO del pedido que si existia.
    // Y en el pedido pagado con saldo, contestaba "tu saldo cambio" a quien ya
    // habia comprado. Lo encontro scripts/prueba-cobros.mjs.
    const [yaRegistrado] = await pool.query(
      'SELECT sale_id FROM bisonte_orders WHERE payment_intent_id = ? AND cliente_id = ? LIMIT 1',
      [referencia, clienteId]
    );
    if (yaRegistrado.length) {
      console.log(`[Confirm] pago ${referencia} ya estaba registrado como pedido #${yaRegistrado[0].sale_id}`);
      return NextResponse.json({ success: true, saleId: yaRegistrado[0].sale_id, repetido: true });
    }

    // Precios reales por línea desde la BD (para sale_items)
    const { lines } = await priceCart(items);
    const lineById = new Map(lines.map(l => [l.id, l]));

    // ── La mercancia tiene que ser la que se pago ────────────────────────
    // Los importes venian del servidor, pero `items` llega en el cuerpo y era
    // lo unico que decidia que se empaca. Cotizar un manga de $250, autorizar
    // $470 y confirmar dos figuras de $750 daba una venta de $470 con $1,500
    // de mercancia: el POS empacaba lo segundo. La huella la fijo /api/checkout
    // sobre el carrito que de verdad cotizo.
    //
    // Se exige presente: un metadata sin huella es un pago que no salio de
    // /api/checkout, o uno anterior a esta comprobacion. En ambos casos no hay
    // nada contra que contrastar y el pedido no se registra.
    if (!md.itemsHash || md.itemsHash !== huellaCarrito(lines)) {
      console.error(
        `[Confirm] Carrito distinto al pagado (cliente ${clienteId}, pago ${referencia}). ` +
        `Esperaba ${md.itemsHash || '(sin huella)'} y llego ${huellaCarrito(lines)}.`
      );
      return NextResponse.json(
        { success: false, error: 'El carrito no coincide con el pago. Vuelve a intentarlo.' },
        { status: 409 }
      );
    }

    // Los dos JSON que se guardan tal cual vienen del navegador. La columna
    // los acepta enormes y nadie los miraba: un tope evita que un pedido meta
    // megabytes en la tabla que comparte con el POS.
    for (const [nombre, valor] of [['shipping_address', shipping_address], ['envia_quote_data', envia_quote_data]]) {
      if (valor && JSON.stringify(valor).length > 8000) {
        return NextResponse.json({ success: false, error: `El campo ${nombre} es demasiado grande.` }, { status: 400 });
      }
    }

    // ── Y el paquete tiene que ir a donde se cotizo ──────────────────────
    // El costo del envio ya venia firmado desde /api/shipping/quote, pero el
    // vale solo ataba el carrito. La DIRECCION llega aqui, en el cuerpo, y
    // nadie la comparaba con la de la cotizacion: cotizar a la colonia de al
    // lado y confirmar con una direccion de la otra punta del pais daba un
    // envio de $99 que la tienda le paga a la paqueteria a $350.
    //
    // Solo se compara codigo postal y estado, que es lo que mueve la tarifa.
    // Un metadata sin destino es un pago de antes de esta comprobacion; queda
    // en el log y pasa, porque los PaymentIntent en vuelo son de clientes que
    // ya tienen la tarjeta autorizada y no tienen la culpa del despliegue.
    if (md.envioDestino) {
      if (md.envioDestino !== huellaDestino(shipping_address)) {
        console.error(
          `[Confirm] Direccion distinta a la cotizada (cliente ${clienteId}, pago ${referencia}).`
        );
        return NextResponse.json(
          { success: false, envioInvalido: true, error: 'La dirección no coincide con el envío cotizado. Vuelve a elegir el envío.' },
          { status: 409 }
        );
      }
    } else {
      console.warn(`[Confirm] Pago ${referencia} sin destino en el metadata (anterior a la comprobacion).`);
    }

    // ── La caja que se le declara a la paqueteria ────────────────────────
    // `envia_quote_data` llega en el cuerpo y el POS saca de ahi la paqueteria,
    // el servicio y las medidas con las que genera la guia. Guardarlo tal cual
    // deja dos cosas en manos del navegador: con que paqueteria se manda -- se
    // podia pagar el terrestre y pedir el expres -- y que tamaño se declara,
    // que es lo que decide el ajuste por sobrepeso. Las dos las paga la tienda.
    //
    // Lo que cuesta dinero se reescribe aqui: la paqueteria y el servicio salen
    // del metadata que firmo /api/checkout, el precio tambien, y el paquete se
    // vuelve a armar con lo que pesa y mide de verdad cada articulo. Del objeto
    // del cliente sobrevive lo que no cuesta nada: el nombre para pintarlo y
    // `raw`, de donde el POS saca la sucursal de recoleccion.
    //
    // Un metadata sin paqueteria es un pago anterior a esta comprobacion: se
    // deja pasar con la del cuerpo y queda en el log, porque esos clientes ya
    // tienen la tarjeta autorizada y no tienen la culpa del despliegue.
    let paquete = null;
    try {
      paquete = armarPaquete(await medidasDelCarrito(pool, lines.map(l => ({ id: l.id, quantity: l.quantity }))));
    } catch (err) {
      console.error('[Confirm] Sin medidas reales para la guia:', err.message);
    }
    if (!md.envioCarrier) {
      console.warn(`[Confirm] Pago ${referencia} sin paqueteria en el metadata (anterior a la comprobacion).`);
    }
    const cotizacionFirme = {
      ...(envia_quote_data || {}),
      ...(md.envioCarrier && { carrier: md.envioCarrier, service: md.envioService || '' }),
      price: shipping,
      ...(paquete && { pkg: paquete }),
    };

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 3. user_id válido de PosTorlan
      const resolvedUserId = await usuarioWeb(conn, EMPRESA_ID);

      // 4. Insertar en sales. Esta tabla es la venta contable y nada mas: el
      //    cliente web, el estado del pedido y los datos de envio se guardaban
      //    aqui (cliente_id, web_status, shipping_method, envia_quote_data,
      //    shipping_address_json) y ninguna de esas columnas existe. Todas
      //    viven en bisonte_orders. `origen` es lo que separa la venta web de
      //    la del mostrador en los cortes del POS.
      //    `payment_method` estaba escrito a mano como 'card' y ahora dice lo
      //    que paso: el saldo de la tienda no es efectivo -- no entra dinero al
      //    cajon -- ni es tarjeta, no pasa por Stripe. Es dinero que el cliente
      //    ya habia pagado antes. El desglose del panel del POS agrupa por esta
      //    columna, asi que mentir aqui es sumar en el renglon equivocado.
      const [saleResult] = await conn.query(
        `INSERT INTO sales (empresa_id, user_id, origen, subtotal, discount, surcharge, total, payment_method, created_at)
         VALUES (?, ?, 'web', ?, ?, ?, ?, ?, NOW())`,
        [
          EMPRESA_ID,
          resolvedUserId,
          subtotal,
          discount,
          shipping,
          totalFinal,
          pagoTipo === 'tarjeta' ? 'card' : pagoTipo,
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

      // 5-bis. Apartar la mercancia.
      //
      //   Aqui es donde el pedido deja de ser una intencion y se come piezas
      //   del inventario. Va DENTRO de la misma transaccion que los renglones
      //   a proposito: un pedido registrado sin su aparte es exactamente el
      //   estado que hasta hoy dejaba entrar el pedido numero diez.
      //
      //   La condicion vive dentro del UPDATE (ver lib/reserva.js) porque leer
      //   y despues escribir deja una ventana: dos clientes que leen "queda 1"
      //   a la vez leen los dos que si, y los dos pagan.
      const faltantes = await reservarStock(conn, lines);
      if (faltantes.length) {
        await conn.rollback();

        //   El cargo ya esta AUTORIZADO -- el dinero esta retenido en la
        //   tarjeta del cliente. Dejarlo asi lo tendria congelado hasta que
        //   Stripe suelte la autorizacion sola, que tarda dias, por una compra
        //   que no existe. Se cancela aqui y el banco lo libera enseguida.
        //
        //   Si falla, el pedido NO se registra igual: se prefiere una
        //   autorizacion huerfana (que caduca) a mercancia vendida dos veces
        //   (que no caduca). Queda en el log para el reembolso a mano.
        //
        //   Pero nunca si el cobro ya tiene pedido. Dos confirmaciones al mismo
        //   tiempo (doble clic) pasan las dos la revision del principio; la
        //   primera se lleva la ultima pieza y la segunda llega aqui por falta
        //   de existencias. Soltar el cobro seria soltar el de la primera, que
        //   si es un pedido. Se mira de quien es antes de cancelar.
        const [dueno] = await pool.query(
          'SELECT sale_id FROM bisonte_orders WHERE payment_intent_id = ? LIMIT 1', [referencia]
        );
        if (dueno.length) {
          return NextResponse.json({ success: true, saleId: dueno[0].sale_id, repetido: true });
        }
        if (paymentIntentId) {
          try {
            await stripe.paymentIntents.cancel(paymentIntentId);
          } catch (err) {
            console.error(`[Confirm] No se pudo liberar el cargo ${paymentIntentId}: ${err.message}`);
          }
        }

        const nombres = faltantes.map(f => `"${f.name}"`).join(', ');
        console.warn(`[Confirm] Pedido rechazado por existencias (cliente ${clienteId}, pago ${referencia}): ${nombres}.`);
        return NextResponse.json(
          {
            success: false,
            sinExistencia: faltantes,
            error: faltantes.length === 1
              ? `Se agotó ${nombres} mientras completabas la compra. No se te cobró.`
              : `Se agotaron estos artículos mientras completabas la compra: ${nombres}. No se te cobró.`,
          },
          { status: 409 }
        );
      }

      // 6. Saldo de tienda: se descuenta AQUI, al nacer el pedido.
      //    Antes se descontaba en /api/orders/capture, y entre autorizar y
      //    capturar pasan dias -- el POS verifica existencias a mano. Durante
      //    esos dias `store_credit` seguia entero, asi que /api/checkout volvia
      //    a aplicarlo al pedido siguiente, y al siguiente: un saldo de $500 se
      //    gastaba tres veces y solo se cobraba una (el GREATEST(0, ...) de la
      //    captura se comia el descuadre sin decir nada).
      //
      //    `gastarCredito` devuelve lo que de verdad salio de la cuenta. Puede
      //    ser menos de lo aplicado si dos pedidos se confirman en el mismo
      //    segundo: el candado de la fila deja pasar a uno primero. Cuando eso
      //    pasa el pedido sigue adelante -- la tarjeta ya esta autorizada por
      //    el total con descuento y no se puede subir -- pero queda en el log,
      //    que es lo unico que separa un descuadre de un misterio.
      const creditoAplicado = await gastarCredito(conn, clienteId, credit, saleId);
      if (credit > 0 && creditoAplicado < credit) {
        // El pedido pagado ENTERO con saldo no tiene tarjeta detras. Si el
        // saldo ya no esta -- se gasto en otra pestaña entre preparar y
        // confirmar -- registrarlo seria regalar la mercancia: no hay cobro
        // que lo respalde. Se tira atras, que aqui no cuesta nada porque no se
        // ha cobrado un peso.
        if (pedidoToken) {
          await conn.rollback();
          console.warn(`[Confirm] Pedido sin cargo rechazado (cliente ${clienteId}): pedia $${credit.toFixed(2)} de saldo y hay $${creditoAplicado.toFixed(2)}.`);
          return NextResponse.json(
            { success: false, saldoInsuficiente: true, error: 'Tu saldo cambió mientras completabas la compra. Vuelve a intentarlo.' },
            { status: 409 }
          );
        }
        // Con tarjeta si sigue adelante: ya esta autorizada por el total con el
        // descuento puesto y ese importe no se puede subir. La diferencia va al
        // log, que es lo unico que separa un descuadre de un misterio.
        console.error(
          `[Confirm] Pedido #${saleId} (cliente ${clienteId}): se cobro de menos. ` +
          `Aplico $${credit.toFixed(2)} de saldo y solo habia $${creditoAplicado.toFixed(2)}.`
        );
      }

      // 7. bisonte_orders: el pedido web. Dos ejes separados, no uno solo
      //    (`status`) como antes: `pago_estado` es lo que pasa en Stripe y
      //    `estado` es donde va el paquete. Aqui nace autorizado y pendiente:
      //    el dinero esta retenido y el POS aun no confirma existencias.
      //    Los renglones no se copian a items_json (columna que ya no existe);
      //    estan normalizados en sale_items, que es de donde los lee todo lo
      //    demas.
      //
      //    `credito_aplicado` guarda el saldo que este pedido se comio: es lo
      //    que hay que devolver si se cancela o se reembolsa.
      await conn.query(
        `INSERT INTO bisonte_orders
            (sale_id, cliente_id, payment_intent_id, pago_estado, estado,
             credito_aplicado, shipping_method, shipping_address_json, envia_quote_data,
             pago_tipo, tarjeta_marca, tarjeta_ultimos4, tarjeta_tipo, tarjeta_meses, pago_detalle)
         VALUES (?, ?, ?, 'autorizado', 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId,
          clienteId,
          referencia,
          creditoAplicado,
          shippingMethod || 'envia',
          shipping_address ? JSON.stringify(shipping_address) : null,
          JSON.stringify(cotizacionFirme),
          pagoTipo,
          tarjeta?.marca || null,
          tarjeta?.ultimos4 || null,
          tarjeta?.tipo || null,
          tarjeta?.meses || 0,
          tarjeta?.detalle ? JSON.stringify(tarjeta.detalle) : null,
        ]
      );

      // 8. Cupón, SOLO en el pedido sin cargo.
      //    En el camino con tarjeta esto lo hace /api/orders/capture leyendo el
      //    metadata del PaymentIntent, y se deja para entonces a proposito: un
      //    carrito abandonado no debe quemar el cupon. Aqui no hay metadata que
      //    leer luego, y tampoco hay carrito que abandonar -- el saldo ya salio
      //    de la cuenta y el pedido esta hecho -- asi que el canje se registra
      //    ahora, en la misma transaccion.
      const couponId = pedidoToken ? (parseInt(md.couponId) || null) : null;
      if (couponId && clienteId) {
        const [ins] = await conn.query(
          'INSERT IGNORE INTO coupon_redemptions (coupon_id, cliente_id, sale_id) VALUES (?, ?, ?)',
          [couponId, clienteId, saleId]
        );
        if (ins.affectedRows === 1) {
          await conn.query(
            'UPDATE coupons SET usage_count = usage_count + 1 WHERE id = ? AND (usage_limit IS NULL OR usage_count < usage_limit)',
            [couponId]
          );
        }
      }

      await conn.commit();

      // 9. Correo de confirmación
      //
      // Ni el destinatario ni los renglones salen ya del cuerpo. `userEmail` y
      // `userName` los escribia el navegador, y con ellos esta ruta mandaba un
      // correo firmado por bisontemanga.com, con el texto que quisiera el
      // remitente, a la direccion que quisiera. Cuesta un pedido pagado por
      // correo — no es gratis — pero es la reputacion del dominio la que se
      // arriesga, y no habia ninguna razon para dejarlo abierto: el correo de
      // la cuenta esta en la base y es el unico sitio donde tiene sentido
      // avisar. Los renglones salen de `lines`, que los precio la BD, y no del
      // `items` crudo, cuyos `title` y `price` se pintan tal cual en el HTML.
      const [correoRows] = await pool.query(
        'SELECT email, nombre FROM clientes WHERE id = ? LIMIT 1', [clienteId]
      );
      const destinatario = correoRows[0]?.email || null;
      if (destinatario) {
        sendOrderConfirmation({
          to: destinatario,
          nombre: correoRows[0]?.nombre || 'Cliente',
          saleId,
          items: lines.map(l => ({ title: l.name, quantity: l.quantity, price: l.unitPrice, stockOk: true })),
          subtotal,
          discount,
          shipping,
          total: totalFinal,
        }).catch(err => console.error('[Mailer]', err.message));
      }

      // 10. Aviso al mostrador. Va aqui y no en la captura a proposito: lo que
      //     interesa saber es que ENTRO un pedido, para ir a verificar
      //     existencias. Si esperara a la captura, el aviso llegaria cuando el
      //     trabajo ya esta hecho.
      //
      //     No se espera (`.catch` y seguir) por la misma razon que el correo
      //     del cliente: el pedido ya esta en la base y cobrado. Un fallo de
      //     correo no puede convertirse en un error para quien acaba de pagar.
      sendNewOrderAlert({
        saleId,
        cliente: correoRows[0]?.nombre || 'Cliente',
        email: destinatario,
        items: lines.map(l => ({ title: l.name, quantity: l.quantity, price: l.unitPrice })),
        subtotal,
        discount,
        shipping,
        credit: creditoAplicado,
        total: totalFinal,
        direccion: shipping_address,
        pagoCon: pedidoToken ? 'saldo' : 'tarjeta',
      }).catch(err => console.error('[Mailer] aviso de pedido:', err.message));

      console.log(`[Confirm] Pedido #${saleId} registrado. pago ${referencia}`);
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
          [referencia]
        );
        if (previo.length) {
          console.log(`[Confirm] pago ${referencia} ya estaba registrado como pedido #${previo[0].sale_id}`);
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
