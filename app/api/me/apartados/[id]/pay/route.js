import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * Prepara el cobro del saldo de un apartado.
 *
 * Crea el PaymentIntent y devuelve su `client_secret`; el cargo lo confirma el
 * navegador y lo registra /confirm. Aqui no se escribe nada en la base: si la
 * persona cierra la pestana despues de este paso, no queda rastro que limpiar.
 *
 * Tres decisiones que no son obvias:
 *
 * `capture_method: 'manual'`. El dinero se autoriza aqui y se cobra en
 * /confirm, cuando el abono ya esta escrito en la base. Al reves —cobrar y
 * luego apuntar— un fallo de la base dejaria a alguien pagado y sin constancia
 * de haberlo hecho, que es la peor de las dos averias posibles.
 *
 * El importe sale de la base, nunca del navegador, y es el saldo entero: el
 * apartado se liquida de una vez. El abono parcial existe en el mostrador (POS,
 * POST /apartados/:id/payment) y aqui no, porque cada cargo parcial paga su
 * comision a Stripe y el minimo de anticipo de lib/apartado.js esta puesto
 * justamente porque los importes pequenos no la justifican.
 *
 * Siempre en pesos. El resto de la tienda deja elegir USD, pero el saldo tiene
 * que cuadrar al centavo contra `anticipos.total_amount`, que esta en pesos;
 * pasar por un tipo de cambio dejaria diferencias en una cuenta que debe cerrar
 * exacta.
 */
export async function POST(request, { params }) {
    const clienteId = await getClienteId();
    if (!clienteId) {
        return NextResponse.json({ success: false, error: 'No has iniciado sesión.' }, { status: 401 });
    }

    // Por cuenta y no por IP: lo que se protege es el apartado, y quien pueda
    // tocarlo ya paso por la sesion.
    const { allowed } = rateLimit(`apartado-pago:${clienteId}`, 10, 60_000);
    if (!allowed) {
        return NextResponse.json({ success: false, error: 'Demasiados intentos. Espera un minuto.' }, { status: 429 });
    }

    const { id } = await params;
    const apartadoId = Number(id);
    if (!Number.isInteger(apartadoId) || apartadoId <= 0) {
        return NextResponse.json({ success: false, error: 'Apartado inválido.' }, { status: 400 });
    }

    try {
        // `cliente_id` va en el WHERE y no en una comprobacion posterior: asi el
        // apartado de otra persona no se llega a leer, y la respuesta es la
        // misma que si no existiera.
        const [filas] = await pool.query(
            `SELECT id, folio, status, total_amount, paid_amount
               FROM anticipos
              WHERE id = ? AND cliente_id = ?
              LIMIT 1`,
            [apartadoId, clienteId]
        );

        if (!filas.length) {
            return NextResponse.json({ success: false, error: 'Apartado no encontrado.' }, { status: 404 });
        }

        const apartado = filas[0];
        if (apartado.status !== 'pending') {
            return NextResponse.json(
                { success: false, error: 'Este apartado ya no admite pagos.' },
                { status: 409 }
            );
        }

        const saldo = Number((Number(apartado.total_amount) - Number(apartado.paid_amount)).toFixed(2));
        if (saldo <= 0) {
            return NextResponse.json(
                { success: false, error: 'Este apartado ya está pagado. Pasa a recogerlo.' },
                { status: 409 }
            );
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

        // Idempotencia: dos clics seguidos devuelven el MISMO PaymentIntent en
        // vez de dejar dos autorizaciones abiertas sobre la tarjeta. La llave
        // incluye el saldo, asi que si entre un intento y otro entrara un abono
        // por el mostrador, el importe cambia y la llave tambien.
        const huella = JSON.stringify({ c: clienteId, a: apartadoId, s: saldo });
        const idempotencyKey = `apartado:${crypto.createHash('sha256').update(huella).digest('hex').slice(0, 48)}`;

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(saldo * 100),
            currency: 'mxn',
            capture_method: 'manual',
            automatic_payment_methods: { enabled: true },
            description: `Liquidación apartado ${apartado.folio}`,
            // El metadata es la version autoritativa de estos datos: es lo unico
            // que /confirm se cree, porque lo escribio el servidor y vuelve de
            // Stripe sin que el navegador haya podido tocarlo.
            metadata: {
                clienteId: String(clienteId),
                apartadoId: String(apartadoId),
                folio: apartado.folio,
                saldoMXN: saldo.toFixed(2),
            },
        }, { idempotencyKey });

        return NextResponse.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            saldo,
            folio: apartado.folio,
        });
    } catch (error) {
        console.error('[Apartado/pay]', error);
        return NextResponse.json({ success: false, error: 'No pudimos preparar el pago.' }, { status: 500 });
    }
}
