import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { round2 } from '@/lib/pricing';
import { acreditarRecarga } from '@/lib/credito';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/credit/confirm — acredita una recarga ya cobrada.
//
// Lo llama el dialogo del perfil en cuanto Stripe aprueba la tarjeta. Nada de
// lo que manda el navegador se cree salvo el id del PaymentIntent: el monto, el
// dueño y el hecho mismo de que el cobro ocurrio se leen de Stripe.
//
// Es idempotente por la base: `credit_topups.payment_intent_id` es UNIQUE, asi
// que la segunda llamada con el mismo cobro rebota y contesta el saldo que ya
// hay. Eso importa porque esta llamada se repite sola — doble clic, reintento
// tras un error de red, un F5 con el dialogo abierto.
// ─────────────────────────────────────────────────────────────────────────────

async function saldoDe(clienteId) {
    const [rows] = await pool.query('SELECT store_credit FROM clientes WHERE id = ? LIMIT 1', [clienteId]);
    return rows.length ? Number(rows[0].store_credit || 0) : 0;
}

export async function POST(request) {
    const clienteId = await getClienteId();
    if (!clienteId) {
        return NextResponse.json({ success: false, error: 'Debes iniciar sesión.' }, { status: 401 });
    }

    let paymentIntentId;
    try {
        ({ paymentIntentId } = await request.json());
    } catch {
        return NextResponse.json({ success: false, error: 'Petición inválida.' }, { status: 400 });
    }
    if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
        return NextResponse.json({ success: false, error: 'Pago no identificado.' }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    let pi;
    try {
        pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
        return NextResponse.json({ success: false, error: 'Pago no encontrado.' }, { status: 404 });
    }

    const md = pi.metadata || {};

    // Las tres puertas, en orden de gravedad:
    //
    //   · El tipo — sin el, el id de CUALQUIER cobro de la tienda (el pedido de
    //     ayer, por ejemplo) se podria mandar aqui para convertirlo en saldo.
    //   · El dueño — el id de un PaymentIntent no es secreto; el saldo se abona
    //     a quien lo pago, no a quien manda la peticion.
    //   · El estado — 'succeeded' es lo unico que significa que el dinero entro.
    if (md.tipo !== 'credit_topup') {
        return NextResponse.json({ success: false, error: 'Este pago no es una recarga de saldo.' }, { status: 400 });
    }
    if (Number(md.userId) !== Number(clienteId)) {
        return NextResponse.json({ success: false, error: 'Este pago no es tuyo.' }, { status: 403 });
    }
    if (pi.status !== 'succeeded') {
        return NextResponse.json(
            { success: false, error: 'El pago aún no se ha completado.', status: pi.status },
            { status: 409 }
        );
    }

    // El monto autoritativo es el del metadata, que lo escribio /topup ya
    // acotado. `pi.amount` no sirve: viene en centavos y, si el cargo salio en
    // dolares, no es la cifra que hay que abonar.
    const amount = round2(Number(md.creditMXN));
    if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ success: false, error: 'Monto de recarga inválido.' }, { status: 400 });
    }

    const moneda = md.cargoMoneda === 'USD' ? 'USD' : 'MXN';
    const cargo = round2(Number(md.cargoMonto)) || amount;

    // El abono vive en lib/credito.js porque esta ruta ya no es la unica que
    // lo hace: /api/stripe/webhook llega al mismo sitio cuando Stripe avisa por
    // su cuenta. Los dos caminos pueden llegar en cualquier orden, o a la vez;
    // quien resuelve el empate es el UNIQUE de `credit_topups`, alla dentro.
    try {
        const r = await acreditarRecarga({
            clienteId, paymentIntentId, amount, moneda, cargo,
            motivo: 'Recarga de saldo con tarjeta',
        });
        return NextResponse.json({
            success: true,
            ...(r.yaEstaba && { yaAplicado: true }),
            amount: r.amount,
            balance: r.balance,
        });
    } catch (e) {
        // El dinero YA se cobro: esto no se puede quedar en un log y ya. Si esta
        // linea aparece, hay un cargo en Stripe sin saldo abonado -- aunque
        // ahora el webhook lo reintenta solo, que es justo para lo que esta.
        console.error(`[credit/confirm] Cobro sin acreditar ${paymentIntentId} (cliente ${clienteId}):`, e.message);
        return NextResponse.json(
            { success: false, error: 'Tu pago se realizó, pero no pudimos abonarlo. Escríbenos y lo resolvemos.' },
            { status: 500 }
        );
    }
}
