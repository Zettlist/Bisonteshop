import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { round2 } from '@/lib/pricing';
import { getUsdRate } from '@/lib/fx';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/credit/topup — prepara el cobro de una recarga de saldo.
//
// Solo crea el PaymentIntent y devuelve su clientSecret. Quien suma el saldo es
// /api/credit/confirm, DESPUES de que Stripe confirme el cargo: acreditar aqui
// seria regalar credito a cambio de una tarjeta que todavia puede rechazarse.
// ─────────────────────────────────────────────────────────────────────────────

// El monto vive en MXN porque `clientes.store_credit` esta en MXN: es lo que
// /api/checkout resta del total. El tope de arriba no es burocracia — un saldo
// no se puede devolver desde la tienda, asi que cargar diez mil pesos de mas es
// un problema que se resuelve a mano y en el mostrador.
const MIN_MXN = 100;
const MAX_MXN = 10000;

export async function POST(request) {
    const clienteId = await getClienteId();
    if (!clienteId) {
        return NextResponse.json({ success: false, error: 'Debes iniciar sesión.' }, { status: 401 });
    }

    // Cada llamada crea un PaymentIntent en Stripe. Nadie recarga saldo diez
    // veces por minuto, y sin freno una sesion en bucle -- un bug del dialogo,
    // o alguien probando -- llena la cuenta de Stripe de intentos muertos. Va
    // por cliente y no por IP: la sesion es lo que autoriza el gasto, y dos
    // clientes tras el mismo NAT no tienen por que estorbarse.
    const { allowed, retryAfter } = rateLimit(`credit-topup:${clienteId}`, 10, 60_000);
    if (!allowed) {
        return NextResponse.json(
            { success: false, error: `Demasiados intentos. Espera ${retryAfter} segundos.` },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Petición inválida.' }, { status: 400 });
    }

    // El monto NUNCA se toma tal cual: llega del navegador y es lo que se va a
    // cobrar. Se acota aqui y el numero que sobrevive es el que viaja en el
    // metadata del PaymentIntent, que es de donde lo lee /confirm.
    const amount = round2(Number(body?.amount));
    if (!Number.isFinite(amount) || amount < MIN_MXN || amount > MAX_MXN) {
        return NextResponse.json(
            { success: false, error: `El monto debe estar entre $${MIN_MXN} y $${MAX_MXN} MXN.` },
            { status: 400 }
        );
    }

    // Mismo corte que /api/checkout: la tienda es 18+ y una cuenta creada con
    // Google entra sin fecha de nacimiento. Sin ese dato el checkout no la deja
    // comprar, asi que cobrarle un saldo aqui seria quedarse con dinero que no
    // puede gastar en ninguna parte.
    const [perfil] = await pool.query('SELECT fecha_nac FROM clientes WHERE id = ? LIMIT 1', [clienteId]);
    if (!perfil.length || !perfil[0].fecha_nac) {
        return NextResponse.json(
            { success: false, needsProfile: true, error: 'Agrega tu fecha de nacimiento para poder comprar saldo.' },
            { status: 403 }
        );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    try {
        const saveCard = Boolean(body?.saveCard);

        // ── Stripe Customer (para tarjetas guardadas) ────────────────────
        // Mismo criterio que en el checkout: el cliente solo se crea si hace
        // falta, y las tarjetas ya guardadas alli sirven aqui sin volver a
        // teclearlas porque cuelgan del mismo customer.
        let stripeCustomerId = null;
        const [clienteRows] = await pool.query(
            'SELECT stripe_customer_id, nombre, apellido, email FROM clientes WHERE id = ? LIMIT 1',
            [clienteId]
        );
        if (clienteRows.length) {
            const cliente = clienteRows[0];
            if (cliente.stripe_customer_id) {
                stripeCustomerId = cliente.stripe_customer_id;
            } else if (saveCard) {
                const customer = await stripe.customers.create({
                    email: cliente.email,
                    name: `${cliente.nombre} ${cliente.apellido || ''}`.trim(),
                    metadata: { bisonte_cliente_id: String(clienteId) },
                });
                stripeCustomerId = customer.id;
                await pool.query('UPDATE clientes SET stripe_customer_id = ? WHERE id = ?', [stripeCustomerId, clienteId]);
            }
        }

        // ── Moneda y tipo de cambio SERVER-SIDE ──────────────────────────
        // El saldo abonado son `amount` pesos pase lo que pase; la moneda solo
        // decide en que se cobra la tarjeta. El rate sale de getUsdRate() y
        // nunca del cliente: con el rate del navegador, mil pesos de saldo se
        // podrian pagar con un dolar.
        const stripeCurrency = (body?.currency === 'USD') ? 'usd' : 'mxn';
        const usdRate = await getUsdRate();
        const chargeAmount = round2(stripeCurrency === 'usd' ? amount * usdRate : amount);
        const amountInCents = Math.max(Math.round(chargeAmount * 100), 50);

        // Sin idempotencyKey, a diferencia del checkout. Alli la llave se arma
        // con el carrito, que cambia entre pedidos; aqui dos recargas de $500
        // del mismo cliente son indistinguibles, y una llave devolveria el
        // PaymentIntent de la primera — ya cobrado — haciendo fallar la
        // segunda. El doble clic lo corta el dialogo, que reutiliza su
        // clientSecret mientras el monto no cambie.
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: stripeCurrency,
            // Se cobra de inmediato, sin autorizar y capturar despues: detras de
            // una recarga no hay mercancia que la tienda tenga que verificar, y
            // por tanto no hay nada que pueda cancelarla luego.
            automatic_payment_methods: { enabled: true },
            ...(stripeCustomerId && { customer: stripeCustomerId }),
            ...(stripeCustomerId && saveCard && { setup_future_usage: 'off_session' }),
            description: `Recarga de saldo Bisonte — $${amount.toFixed(2)} MXN`,
            metadata: {
                userId: String(clienteId),
                // /confirm exige este tipo antes de tocar el saldo: sin el, el
                // PaymentIntent de cualquier otro cobro de la tienda serviria
                // para acreditarse credito.
                tipo: 'credit_topup',
                creditMXN: amount.toFixed(2),
                cargoMoneda: stripeCurrency.toUpperCase(),
                cargoMonto: chargeAmount.toFixed(2),
            },
        });

        return NextResponse.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            amount,
            currency: stripeCurrency.toUpperCase(),
            chargeAmount,
        });
    } catch (error) {
        console.error('POST /api/credit/topup:', error.message);
        return NextResponse.json({ success: false, error: 'No se pudo preparar el pago.' }, { status: 500 });
    }
}
