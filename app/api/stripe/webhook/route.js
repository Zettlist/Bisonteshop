import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { round2 } from '@/lib/pricing';
import { acreditarRecarga, cerrarReembolso } from '@/lib/credito';

export const dynamic = 'force-dynamic';
// El runtime de node hace falta por dos cosas: el cuerpo crudo y la verificacion
// de firma, que usa crypto.
export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stripe/webhook — lo que Stripe nos cuenta por su cuenta.
//
// Todo lo demas de la tienda se entera de los pagos porque el NAVEGADOR avisa:
// Stripe cobra, la pagina llama a /api/credit/confirm, el saldo sube. Esa
// cadena tiene un eslabon que no controlamos. Si el cliente cierra la pestaña,
// se le cae la red o se le apaga el telefono entre el cobro y el aviso, el
// dinero entro y el saldo no. Hay una nota en localStorage que reintenta, pero
// vive en ESE navegador: quien compro en el movil y entra desde la computadora
// se queda sin ella.
//
// Esta ruta quita al navegador de la cadena. Stripe llama aqui directo y, si no
// contestamos 2xx, reintenta durante dias. Por eso los fallos de verdad tienen
// que salir con 500: un 200 le dice a Stripe "recibido, no vuelvas", y eso
// convierte un error temporal de la base en un cobro perdido para siempre.
//
// Nada de lo que llega se cree por venir en el cuerpo: la firma es lo que dice
// que quien llama es Stripe. Sin STRIPE_WEBHOOK_SECRET no se procesa nada, y es
// a proposito -- esta URL es publica.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request) {
    const secreto = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secreto) {
        // Sin secreto no hay forma de distinguir a Stripe de cualquiera. Se
        // contesta 500 y no 200: que Stripe reintente y que el fallo se vea en
        // su panel, en vez de tragarse los eventos en silencio.
        console.error('[webhook] STRIPE_WEBHOOK_SECRET no está configurado: no se puede verificar nada.');
        return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 });
    }

    const firma = request.headers.get('stripe-signature');
    if (!firma) {
        return NextResponse.json({ error: 'Sin firma' }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    // El cuerpo CRUDO, sin parsear: la firma se calcula sobre los bytes exactos
    // que mando Stripe, y un JSON.parse + stringify los cambia.
    let evento;
    try {
        const crudo = await request.text();
        evento = stripe.webhooks.constructEvent(crudo, firma, secreto);
    } catch (e) {
        // Firma mala = no es Stripe, o el secreto es el del otro entorno. 400 y
        // no 500: reintentar no lo va a arreglar.
        console.error('[webhook] Firma inválida:', e.message);
        return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
    }

    try {
        switch (evento.type) {
            case 'payment_intent.succeeded':
                await recargaCobrada(await desdeStripe(stripe, evento.data.object, 'paymentIntents'));
                break;

            case 'charge.refunded':
                await cargoDevuelto(await desdeStripe(stripe, evento.data.object, 'charges'));
                break;

            case 'charge.dispute.created':
                await contracargoAbierto(await desdeStripe(stripe, evento.data.object, 'disputes'));
                break;

            default:
                // Cualquier otro evento se acepta y se ignora. 200 a proposito:
                // un 4xx aqui haria que Stripe marcase el destino como roto.
                break;
        }
    } catch (e) {
        // Un fallo PERMANENTE no se reintenta: el cobro apunta a un cliente que
        // no existe, o trae datos que ningun reintento va a arreglar. Con 500,
        // Stripe insiste durante dias y el panel se llena de rojo por algo que
        // no se puede resolver solo. Se contesta 200 y queda el log, que es
        // donde una persona lo tiene que ver.
        if (e.permanente) {
            console.error(`[webhook] ${evento.type} (${evento.id}) NO se puede procesar nunca: ${e.message}. Requiere revisión manual.`);
            return NextResponse.json({ recibido: true, revisar: true });
        }

        // Lo demas si es temporal (la base, casi siempre). 500 para que Stripe
        // vuelva a intentarlo: es justo la red de seguridad por la que existe
        // esta ruta.
        console.error(`[webhook] ${evento.type} (${evento.id}) falló:`, e.message);
        return NextResponse.json({ error: 'Fallo al procesar' }, { status: 500 });
    }

    return NextResponse.json({ recibido: true });
}

/**
 * El objeto, pedido SIEMPRE a Stripe. Del evento solo se usa el id.
 *
 * La firma demuestra que el mensaje viene de Stripe, y por un rato eso me
 * parecio suficiente para creerme tambien su contenido. No lo es. El secreto de
 * firma es una cadena que vive en dos paneles y en una variable de entorno: se
 * copia mal, se pega donde no debe, se queda en un historial. Y quien lo tenga
 * puede firmar un `payment_intent.succeeded` inventado —con el cliente que
 * quiera y el monto que quiera— y eso, leyendo la metadata del cuerpo, era
 * saldo regalado sin limite.
 *
 * Pidiendole el objeto a Stripe, el secreto filtrado deja de bastar: el
 * atacante tendria que conseguir ademas que exista un cobro de verdad, con esa
 * metadata, a nombre de su victima. Firmar deja de ser inventar.
 *
 * Cuesta una llamada por evento. Estos eventos llegan de uno en uno y mueven
 * dinero; es el intercambio mas facil de la ruta. De paso resuelve lo del
 * "estilo de carga util" resumido, que era de donde vino la idea.
 */
async function desdeStripe(stripe, objeto, recurso) {
    if (!objeto?.id) throw new Error(`Evento de ${recurso} sin id`);
    try {
        return await stripe[recurso].retrieve(objeto.id);
    } catch (e) {
        console.error(`[webhook] No se pudo recuperar ${recurso}/${objeto.id}:`, e.message);
        throw e;   // 500 → Stripe reintenta
    }
}

/**
 * Una recarga de saldo que Stripe ya cobro.
 *
 * Es el mismo trabajo que hace /api/credit/confirm cuando el navegador avisa, y
 * los dos caminos pueden llegar en cualquier orden o a la vez. Quien resuelve
 * el empate no es este codigo sino el UNIQUE de `credit_topups`, dentro de
 * `acreditarRecarga`.
 */
async function recargaCobrada(pi) {
    const md = pi.metadata || {};

    // El tipo es lo que separa una recarga del cobro de un pedido. Sin esta
    // linea, el PaymentIntent de una compra de mercancia se convertiria en
    // saldo regalado.
    if (md.tipo !== 'credit_topup') return;

    // El estado se comprueba contra lo que dice Stripe AHORA, no contra el
    // nombre del evento. Un `payment_intent.succeeded` firmado para un cobro
    // que nunca se completo abonaria saldo que nadie pago.
    if (pi.status !== 'succeeded') {
        console.error(`[webhook] ${pi.id} llegó como succeeded pero Stripe lo tiene en "${pi.status}". No se abona.`);
        return;
    }

    const clienteId = parseInt(md.userId) || null;
    const amount = round2(Number(md.creditMXN));
    if (!clienteId || !Number.isFinite(amount) || amount <= 0) {
        // No se lanza: reintentar no va a arreglar un metadata mal escrito, y
        // un 500 eterno solo llena el panel de Stripe de rojo. Queda en el log
        // porque significa que hay un cobro sin acreditar.
        console.error(`[webhook] Recarga ${pi.id} con metadata inservible (cliente ${md.userId}, monto ${md.creditMXN}).`);
        return;
    }

    const r = await acreditarRecarga({
        clienteId,
        paymentIntentId: pi.id,
        amount,
        moneda: md.cargoMoneda === 'USD' ? 'USD' : 'MXN',
        cargo: round2(Number(md.cargoMonto)) || amount,
        motivo: 'Recarga de saldo con tarjeta',
    });

    if (r.abonado) {
        // Que esta linea aparezca significa que el navegador NO aviso: el
        // cliente cerro la pestaña, se quedo sin red, o cambio de dispositivo.
        // Es el caso entero por el que existe el webhook.
        console.log(`[webhook] Recarga ${pi.id} abonada aquí (cliente ${clienteId}, $${amount}). El navegador no avisó.`);
    }
}

/**
 * Un cargo devuelto en Stripe.
 *
 * Normalmente el reembolso lo pide el POS y pasa por /api/orders/refund, que ya
 * deja la base en su sitio. Este camino cubre el otro: alguien devuelve el
 * dinero desde el panel de Stripe. Sin esto, el pedido se queda en `capturado`
 * para siempre y el saldo de tienda que consumio no vuelve nunca.
 */
async function cargoDevuelto(charge) {
    // Solo interesan las devoluciones completas: una parcial no cancela el
    // pedido y decidir cuanto saldo devolver no es cosa de un automatismo.
    if (charge.amount_refunded < charge.amount) {
        console.log(`[webhook] Devolución parcial de ${charge.payment_intent}: se deja para revisión manual.`);
        return;
    }
    if (!charge.payment_intent) return;

    const [rows] = await pool.query(
        'SELECT sale_id, pago_estado FROM bisonte_orders WHERE payment_intent_id = ? LIMIT 1',
        [charge.payment_intent]
    );
    if (!rows.length) return;

    const cerrado = await cerrarReembolso(rows[0].sale_id, charge.refunds?.data?.[0]?.id || null);
    if (cerrado) {
        console.log(`[webhook] Pedido #${rows[0].sale_id} marcado reembolsado desde Stripe (no pasó por el POS).`);
    }
}

/**
 * Un contracargo: el cliente le dijo a su banco que no reconoce el cobro.
 *
 * No se toca nada — quien decide que hacer con un contracargo es una persona, y
 * hay un plazo para responder con pruebas. Lo unico que hace falta es que no se
 * entere solo el correo de Stripe: queda anotado contra el pedido para que se
 * vea desde la tienda.
 */
async function contracargoAbierto(dispute) {
    if (!dispute.payment_intent) return;
    const [rows] = await pool.query(
        'SELECT sale_id FROM bisonte_orders WHERE payment_intent_id = ? LIMIT 1',
        [dispute.payment_intent]
    );
    const pedido = rows.length ? `pedido #${rows[0].sale_id}` : 'pedido desconocido';
    console.error(
        `[webhook] CONTRACARGO abierto en ${dispute.payment_intent} (${pedido}): ` +
        `$${(dispute.amount / 100).toFixed(2)} ${String(dispute.currency).toUpperCase()}, motivo "${dispute.reason}". ` +
        `Hay plazo para responder en el panel de Stripe.`
    );
}
