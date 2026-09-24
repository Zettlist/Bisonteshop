import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { priceCart, huellaCarrito, round2 } from '@/lib/pricing';
import { huellaDestino } from '@/lib/envioFirmado';
import { estadoCanonico } from '@/lib/estadosMx';
import { medidasDelCarrito, armarPaquete } from '@/lib/paquete';
import { usuarioWeb } from '@/lib/usuarioWeb';
import { apartadosParaEnviar, cerrarApartadosPorEnvio } from '@/lib/apartadoEnvio';
import { sendApartadoEnvioCliente, sendApartadoEnvioAlert } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

/**
 * Lo que se guarda de la tarjeta. Nada sensible: la marca y los cuatro ultimos
 * son lo que el cliente ve en su estado de cuenta, y el dia del reclamo
 * "tarjeta" no contesta nada. El numero completo vive en Stripe.
 */
function detalleDeTarjeta(cargo) {
    const card = cargo?.payment_method_details?.card;
    if (!card) return null;
    const tipos = { credit: 'credito', debit: 'debito', prepaid: 'prepago' };
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
 * Un renglon por producto, con la cantidad sumada.
 *
 * No es cosmetico. El POS baja el stock con un UPDATE ... JOIN sale_items, y en
 * un UPDATE de varias tablas MySQL toca cada fila de `products` UNA vez aunque
 * empareje con dos renglones. Dos apartados del mismo tomo, mandados en la
 * misma caja, dejarian dos renglones de una pieza y el almacen descontaria
 * solo una: una pieza fantasma en el inventario.
 *
 * El precio de un producto que se aparto dos veces a precios distintos se
 * promedia, y el subtotal de la venta se calcula DESDE estos renglones para que
 * la suma cuadre al centavo con lo que se guarda.
 */
function renglonesDeVenta(items) {
    const porProducto = new Map();
    for (const i of items) {
        const previo = porProducto.get(i.productId) || { productId: i.productId, quantity: 0, importe: 0, name: i.name };
        previo.quantity += i.quantity;
        previo.importe += i.unitPrice * i.quantity;
        porProducto.set(i.productId, previo);
    }
    const renglones = [...porProducto.values()].map((r) => ({
        productId: r.productId,
        name: r.name,
        quantity: r.quantity,
        price: round2(r.importe / r.quantity),
    }));
    const subtotal = round2(renglones.reduce((s, r) => s + r.price * r.quantity, 0));
    return { renglones, subtotal };
}

/**
 * Registra el envio de uno o varios apartados ya pagados.
 *
 * Lo que nace aqui es un pedido web como cualquier otro: una venta, sus
 * renglones y una fila en `bisonte_orders`. Entra a «Pedidos Página Web» del
 * POS, se empaca, se le genera la guia y se cobra el envio al confirmar
 * existencias. La tienda no tiene mostrador: esta es la unica forma de que un
 * apartado llegue a manos del cliente.
 *
 * Dos cosas que esta ruta NO hace, y las dos a proposito:
 *
 *   - no reserva inventario. La pieza esta separada desde que nacio el
 *     apartado; reservarla otra vez la contaria dos veces. El pedido HEREDA esa
 *     reserva, y el POS la consuma al confirmar con la misma sentencia que usa
 *     para cualquier pedido web.
 *   - no cobra. El cargo del envio queda autorizado, igual que en el checkout,
 *     y se cobra cuando alguien confirma que la mercancia esta ahi. Si no
 *     estuviera, el POS cancela el pedido y la autorizacion se suelta sin que
 *     el cliente pague un envio que no ocurrio.
 */
export async function POST(request) {
    const clienteId = await getClienteId();
    if (!clienteId) {
        return NextResponse.json({ success: false, error: 'No has iniciado sesión.' }, { status: 401 });
    }

    let cuerpo;
    try {
        cuerpo = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    const { paymentIntentId, direccion, envia_quote_data } = cuerpo || {};
    if (!paymentIntentId) {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    // Los dos JSON se guardan tal cual vienen del navegador. La columna los
    // acepta enormes y nadie los mira: un tope evita que un envio meta
    // megabytes en la tabla que comparte con el POS.
    for (const [nombre, valor] of [['direccion', direccion], ['envia_quote_data', envia_quote_data]]) {
        if (valor && JSON.stringify(valor).length > 8000) {
            return NextResponse.json({ success: false, error: `El campo ${nombre} es demasiado grande.` }, { status: 400 });
        }
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    // Suelta la autorizacion cuando el envio no se llega a registrar. Dejarla
    // colgada tendria el dinero retenido en la tarjeta hasta que Stripe la
    // caduque sola, por un paquete que no existe.
    //
    // Con una regla que no se salta: NUNCA se suelta un cobro que ya tiene
    // pedido. Dos clics al mismo tiempo pasan los dos la revision de arriba; el
    // primero registra el envio y el segundo choca con la puerta de los
    // apartados ("ya enviado"). Si ese segundo soltara el cobro, soltaria el del
    // primero. Asi que antes de cancelar se mira de quien es, y si ya tiene
    // pedido se devuelve ese pedido para contestar como un reintento.
    const soltarCargo = async (motivo) => {
        try {
            const [dueno] = await pool.query(
                'SELECT sale_id FROM bisonte_orders WHERE payment_intent_id = ? LIMIT 1',
                [paymentIntentId]
            );
            if (dueno.length) return dueno[0].sale_id;
            await stripe.paymentIntents.cancel(paymentIntentId);
        } catch (err) {
            console.error(`[Apartado/envio] No se pudo liberar el cargo ${paymentIntentId} (${motivo}): ${err.message}`);
        }
        return null;
    };
    const comoReintento = (saleId) => NextResponse.json({ success: true, saleId, repetido: true });

    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
        const md = paymentIntent.metadata || {};

        // El cobro tiene que ser de ESTA sesion. Sin esto, el id de un cobro
        // ajeno —que no es un secreto, viaja en el clientSecret— registraria un
        // envio a nombre de otra persona con la direccion de quien llama.
        if (md.clienteId !== String(clienteId)) {
            return NextResponse.json({ success: false, error: 'Este pago no es tuyo.' }, { status: 403 });
        }
        if (!md.apartadoIds) {
            return NextResponse.json({ success: false, error: 'Este pago no corresponde a un envío de apartados.' }, { status: 400 });
        }

        // ¿Este cobro ya tiene su pedido? Tiene que ser lo primero, antes de la
        // puerta de los apartados. Un reintento del mismo envio (doble clic, se
        // corto la red) llegaba a esa puerta, veia los apartados "ya enviados"
        // -- por el propio pedido que acababa de nacer -- y SOLTABA EL COBRO de
        // ese pedido: el paquete salia y el envio no se cobraba nunca. Lo
        // encontro scripts/prueba-cobros.mjs confirmando dos veces.
        const [yaRegistrado] = await pool.query(
            'SELECT sale_id FROM bisonte_orders WHERE payment_intent_id = ? AND cliente_id = ? LIMIT 1',
            [paymentIntentId, clienteId]
        );
        if (yaRegistrado.length) {
            return NextResponse.json({ success: true, saleId: yaRegistrado[0].sale_id, repetido: true });
        }
        if (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded') {
            return NextResponse.json(
                { success: false, error: `El pago no se completó (${paymentIntent.status}).` },
                { status: 400 }
            );
        }

        const envio = round2(Number(md.envioMXN));
        if (!(envio > 0) || Math.round(envio * 100) !== paymentIntent.amount) {
            console.error('[Apartado/envio/confirmar] Importe inconsistente', { paymentIntentId, md, amount: paymentIntent.amount });
            return NextResponse.json({ success: false, error: 'No pudimos registrar el envío.' }, { status: 500 });
        }

        // El paquete tiene que ir a donde se cotizo, y con la paqueteria que se
        // pago. El precio depende de las dos cosas, y las dos llegan en el
        // cuerpo: sin esto se podria pagar el envio terrestre de la colonia de
        // al lado y pedir el expres a Tijuana.
        if (md.envioDestino !== huellaDestino(direccion)) {
            return NextResponse.json(
                { success: false, envioInvalido: true, error: 'La dirección no coincide con el envío que pagaste.' },
                { status: 409 }
            );
        }
        const cotizacion = envia_quote_data || {};
        if (String(cotizacion.carrier || '') !== String(md.carrier || '')
            || String(cotizacion.service || '') !== String(md.service || '')) {
            return NextResponse.json(
                { success: false, envioInvalido: true, error: 'La paquetería no coincide con el envío que pagaste.' },
                { status: 409 }
            );
        }

        const telefono = String(direccion?.telefono || '').replace(/\D/g, '');
        if (telefono.length < 10) {
            return NextResponse.json({ success: false, error: 'Falta un teléfono de contacto de 10 dígitos.' }, { status: 400 });
        }

        const idsPagados = md.apartadoIds.split(',').map(Number);
        const tarjeta = detalleDeTarjeta(paymentIntent.latest_charge);

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // La misma puerta que en los dos pasos anteriores, ahora dentro de
            // la transaccion: entre preparar el cobro y llegar aqui el apartado
            // pudo vencer, o pudo mandarse desde otra pestaña.
            const elegibles = await apartadosParaEnviar(conn, {
                clienteId, empresaId: EMPRESA_ID, ids: idsPagados,
            });
            if (elegibles.error) {
                await conn.rollback();
                const dueno = await soltarCargo(elegibles.codigo);
                if (dueno) return comoReintento(dueno);
                console.warn('[Apartado/envio/confirmar] rechazado:', elegibles.codigo, { clienteId, idsPagados });
                return NextResponse.json(
                    { success: false, error: `${elegibles.error} No te cobramos el envío.`, codigo: elegibles.codigo },
                    { status: 409 }
                );
            }

            // Y la mercancia tiene que ser la que se cotizo: de ella salio el
            // tamaño del paquete y por tanto el precio del envio.
            const items = elegibles.items.map((i) => ({ id: i.productId, quantity: i.quantity }));
            const { lines } = await priceCart(items);
            if (md.itemsHash !== huellaCarrito(lines)) {
                await conn.rollback();
                const dueno = await soltarCargo('mercancia_distinta');
                if (dueno) return comoReintento(dueno);
                console.error('[Apartado/envio/confirmar] La mercancia cambio', { clienteId, paymentIntentId });
                return NextResponse.json(
                    { success: false, error: 'Cambió lo que ibas a enviar. No te cobramos el envío; vuelve a cotizar.' },
                    { status: 409 }
                );
            }

            // ── La caja que se le declara a la paqueteria ─────────────────
            // `envia_quote_data` llega del navegador y el POS saca de ahi las
            // medidas y el peso con los que genera la guia. Guardarlo tal cual
            // deja que el cliente declare un paquete de 200 gramos para una
            // caja de dos kilos: el precio seria el correcto (lo fija el vale)
            // pero la guia no, y el ajuste por sobrepeso lo paga la tienda.
            //
            // Asi que lo que decide dinero se reescribe aqui con lo que dice la
            // base: la paqueteria y el servicio salen del cobro, el precio del
            // cobro, y el paquete se vuelve a armar con lo que pesa y mide de
            // verdad cada articulo. Del objeto del cliente solo sobrevive lo
            // que no cuesta nada (el nombre para pintarlo, y `raw`, de donde el
            // POS saca la sucursal de recoleccion).
            let paquete;
            try {
                paquete = armarPaquete(await medidasDelCarrito(conn, items));
            } catch (err) {
                console.error('[Apartado/envio/confirmar] Sin medidas reales para la guia:', err.message);
                paquete = null;
            }
            const cotizacionFirme = {
                ...cotizacion,
                carrier: md.carrier,
                service: md.service,
                price: envio,
                ...(paquete && { pkg: paquete }),
            };

            const { renglones, subtotal } = renglonesDeVenta(elegibles.items);
            if (Math.abs(subtotal - elegibles.mercancia) > 0.01) {
                // Solo pasa si el mismo titulo se aparto a dos precios distintos.
                // No cambia lo que se cobra (el envio), solo el importe con el
                // que queda registrada la venta; se apunta y se sigue.
                console.warn(
                    `[Apartado/envio/confirmar] Mercancia redondeada: apartados $${elegibles.mercancia.toFixed(2)}, venta $${subtotal.toFixed(2)}`
                );
            }
            const total = round2(subtotal + envio);

            const resolvedUserId = await usuarioWeb(conn, EMPRESA_ID);

            // La venta. `subtotal` es la mercancia (ya pagada en los anticipos) y
            // `surcharge` el envio, igual que en cualquier pedido web. El dinero
            // de la mercancia entro en su dia por `anticipo_payments`, que es el
            // reporte donde cuadra el efectivo; la venta cuenta entera en los
            // reportes de ventas, exactamente como cuando el apartado se
            // liquidaba en el mostrador.
            const [venta] = await conn.query(
                `INSERT INTO sales (empresa_id, user_id, origen, subtotal, discount, surcharge, total, payment_method, created_at)
                 VALUES (?, ?, 'web', ?, 0, ?, ?, 'card', NOW())`,
                [EMPRESA_ID, resolvedUserId, subtotal, envio, total]
            );
            const saleId = venta.insertId;

            for (const r of renglones) {
                await conn.query(
                    'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                    [saleId, r.productId, r.quantity, r.price]
                );
            }

            // Los apartados se cierran aqui, y este UPDATE condicional es el
            // candado: si otra pestaña se adelanto, no cuadran todas las filas y
            // la transaccion se deshace sin cobrar nada.
            const cerrados = await cerrarApartadosPorEnvio(conn, {
                ids: elegibles.ids, clienteId, empresaId: EMPRESA_ID, saleId,
            });
            if (cerrados !== elegibles.ids.length) {
                await conn.rollback();
                const dueno = await soltarCargo('carrera');
                if (dueno) return comoReintento(dueno);
                console.warn('[Apartado/envio/confirmar] carrera al cerrar apartados', { clienteId, ids: elegibles.ids, cerrados });
                return NextResponse.json(
                    { success: false, error: 'Alguien ya pidió el envío de ese apartado. No te cobramos nada.' },
                    { status: 409 }
                );
            }

            // El pedido web. Nace autorizado y pendiente, como el del checkout:
            // el dinero del envio esta retenido y nadie ha tocado el paquete.
            await conn.query(
                `INSERT INTO bisonte_orders
                    (sale_id, cliente_id, payment_intent_id, pago_estado, estado,
                     credito_aplicado, shipping_method, shipping_address_json, envia_quote_data,
                     pago_tipo, tarjeta_marca, tarjeta_ultimos4, tarjeta_tipo, tarjeta_meses, pago_detalle)
                 VALUES (?, ?, ?, 'autorizado', 'pendiente', 0, 'envia', ?, ?, 'tarjeta', ?, ?, ?, ?, ?)`,
                [
                    saleId,
                    clienteId,
                    paymentIntentId,
                    // El estado con el nombre de la lista: de aqui lo lee el POS.
                    JSON.stringify({ ...direccion, estado: estadoCanonico(direccion.estado) || direccion.estado }),
                    JSON.stringify(cotizacionFirme),
                    tarjeta?.marca || null,
                    tarjeta?.ultimos4 || null,
                    tarjeta?.tipo || null,
                    tarjeta?.meses || 0,
                    tarjeta?.detalle ? JSON.stringify(tarjeta.detalle) : null,
                ]
            );

            await conn.commit();

            const folios = elegibles.apartados.map((a) => a.folio);

            // Pasado el commit, NADA puede tumbar esta respuesta. El envio ya
            // esta registrado y el cargo tiene que seguir autorizado: dejar que
            // un fallo de aqui caiga al catch de abajo soltaria el cobro de un
            // pedido que si existe, y el POS no tendria nada que capturar.
            try {
                const [correo] = await pool.query('SELECT email, nombre FROM clientes WHERE id = ? LIMIT 1', [clienteId]);
                const destinatario = correo[0]?.email || null;
                const nombre = correo[0]?.nombre || 'Cliente';

                // Los dos correos, sin esperarlos: un fallo de correo no puede
                // convertirse en un error para quien acaba de pagar.
                if (destinatario) {
                    sendApartadoEnvioCliente({
                        to: destinatario, nombre, saleId, folios,
                        items: renglones.map((r) => ({ title: r.name, quantity: r.quantity })),
                        envio, direccion,
                        paqueteria: cotizacion.name || cotizacion.carrier || null,
                    }).catch((err) => console.error('[Mailer]', err.message));
                }
                sendApartadoEnvioAlert({
                    saleId, folios, cliente: nombre, email: destinatario,
                    items: renglones.map((r) => ({ title: r.name, quantity: r.quantity, price: r.price })),
                    mercancia: subtotal, envio, direccion,
                    paqueteria: cotizacion.carrier || null, servicio: cotizacion.service || null,
                }).catch((err) => console.error('[Mailer] aviso de envío de apartado:', err.message));
            } catch (avisoErr) {
                console.error(`[Apartado/envio] Pedido #${saleId} registrado, pero sin avisar:`, avisoErr.message);
            }

            console.log(`[Apartado/envio] Pedido #${saleId} por ${folios.join(', ')}. Envío $${envio} · PI ${paymentIntentId}`);
            return NextResponse.json({ success: true, saleId, envio, folios });

        } catch (dbError) {
            await conn.rollback();

            // El mismo cobro llegando dos veces (doble clic, F5, reintento de
            // red). El UNIQUE de `payment_intent_id` lo para aqui: el envio ya
            // estaba registrado y la respuesta correcta es la de un pago que
            // salio bien, no un error sobre dinero que si se cobro.
            if (dbError.code === 'ER_DUP_ENTRY') {
                const [previo] = await pool.query(
                    'SELECT sale_id FROM bisonte_orders WHERE payment_intent_id = ? LIMIT 1',
                    [paymentIntentId]
                );
                if (previo.length) {
                    console.log(`[Apartado/envio] PI ${paymentIntentId} ya estaba registrado como pedido #${previo[0].sale_id}`);
                    return NextResponse.json({ success: true, saleId: previo[0].sale_id, envio, repetido: true });
                }
            }

            throw dbError;
        } finally {
            conn.release();
        }
    } catch (error) {
        // Nada se cobro: el cargo sigue autorizado y sin capturar. Se suelta
        // para no dejarlo retenido, y queda en el log lo necesario para
        // entenderlo: cliente, cobro y motivo.
        console.error('[Apartado/envio/confirmar]', { clienteId, paymentIntentId }, error);
        const dueno = await soltarCargo('error');
        if (dueno) return comoReintento(dueno);
        return NextResponse.json(
            { success: false, error: 'No pudimos registrar el envío y no te cobramos nada. Intenta de nuevo o escríbenos.' },
            { status: 500 }
        );
    }
}
