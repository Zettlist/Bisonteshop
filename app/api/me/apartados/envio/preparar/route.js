import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { priceCart, huellaCarrito, round2 } from '@/lib/pricing';
import { leerEnvio, huellaDestino } from '@/lib/envioFirmado';
import { apartadosParaEnviar } from '@/lib/apartadoEnvio';

export const dynamic = 'force-dynamic';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

// Lo minimo que Stripe acepta cobrar en pesos. No es politica de la tienda: por
// debajo contesta `amount_too_small`. Ningun envio nacional baja de ahi, pero
// una tarifa rara no debe convertirse en un error sin explicacion.
const MINIMO_MXN = 10;

/**
 * Prepara el cobro del ENVIO de uno o varios apartados ya pagados.
 *
 * Aqui no se escribe nada en la base: se crea el PaymentIntent y se devuelve su
 * `client_secret`. Si la persona cierra la pestaña despues de este paso no
 * queda rastro que limpiar, y la autorizacion caduca sola.
 *
 * Lo unico que se cobra es el envio. La mercancia ya esta pagada — es un
 * apartado liquidado — y volver a cobrarla seria cobrarla dos veces.
 *
 * El precio del envio NO llega como numero: llega como el vale firmado que
 * emitio /api/me/apartados/envio/cotizar, y se comprueba que sea de ESTA
 * mercancia y de ESTE destino. Es la misma proteccion del checkout, y por el
 * mismo motivo: la tienda le paga a la paqueteria la tarifa de verdad, mande el
 * navegador la cifra que quiera.
 */
export async function POST(request) {
    const clienteId = await getClienteId();
    if (!clienteId) {
        return NextResponse.json({ success: false, error: 'No has iniciado sesión.' }, { status: 401 });
    }

    const { allowed } = rateLimit(`apartado-envio:${clienteId}`, 10, 60_000);
    if (!allowed) {
        return NextResponse.json({ success: false, error: 'Demasiados intentos. Espera un minuto.' }, { status: 429 });
    }

    let cuerpo;
    try {
        cuerpo = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    const { apartadoIds, direccion, shippingToken } = cuerpo || {};

    // Sin telefono la paqueteria no puede avisar, y sin eso el pedido llega al
    // POS sin con que generar la guia. Va antes de tocar Stripe: aqui no hay
    // nada que deshacer.
    const telefono = String(direccion?.telefono || '').replace(/\D/g, '');
    if (telefono.length < 10) {
        return NextResponse.json({ success: false, error: 'Falta un teléfono de contacto de 10 dígitos.' }, { status: 400 });
    }
    const faltan = ['nombre_recibe', 'calle', 'colonia', 'cp', 'municipio', 'estado']
        .filter((campo) => !String(direccion?.[campo] || '').trim());
    if (faltan.length) {
        return NextResponse.json({ success: false, error: 'Completa la dirección de entrega.' }, { status: 400 });
    }

    try {
        const elegibles = await apartadosParaEnviar(pool, {
            clienteId, empresaId: EMPRESA_ID, ids: apartadoIds,
        });
        if (elegibles.error) {
            return NextResponse.json(
                { success: false, error: elegibles.error, codigo: elegibles.codigo },
                { status: elegibles.codigo === 'vacio' ? 400 : 409 }
            );
        }

        // ── El precio del envio, y que sea de este paquete ────────────────
        const cotizacion = await leerEnvio(shippingToken);
        if (!cotizacion) {
            return NextResponse.json(
                { success: false, envioInvalido: true, error: 'Vuelve a elegir el envío: la cotización expiró.' },
                { status: 400 }
            );
        }

        const items = elegibles.items.map((i) => ({ id: i.productId, quantity: i.quantity }));
        const { lines } = await priceCart(items);
        const itemsHash = huellaCarrito(lines);

        // El vale de un apartado de un tomo no puede pagar el envio de tres.
        if (cotizacion.itemsHash !== itemsHash) {
            return NextResponse.json(
                { success: false, envioInvalido: true, error: 'Cambió lo que vas a enviar. Vuelve a cotizar.' },
                { status: 409 }
            );
        }
        // Ni el vale cotizado a la colonia de al lado puede pagar un envio a la
        // otra punta del pais: el destino es la otra mitad de la tarifa.
        if (!cotizacion.destino || cotizacion.destino !== huellaDestino(direccion)) {
            return NextResponse.json(
                { success: false, envioInvalido: true, error: 'La dirección no coincide con el envío cotizado. Vuelve a cotizar.' },
                { status: 409 }
            );
        }

        const envio = round2(cotizacion.precio);
        if (!(envio >= MINIMO_MXN)) {
            console.error('[Apartado/envio/preparar] Tarifa por debajo del minimo de Stripe', { clienteId, envio });
            return NextResponse.json(
                { success: false, error: 'No pudimos preparar el cobro del envío. Escríbenos y lo resolvemos.' },
                { status: 500 }
            );
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

        // Idempotencia: dos clics seguidos devuelven el MISMO PaymentIntent en
        // vez de dejar dos autorizaciones sobre la tarjeta. La llave lleva los
        // apartados, el importe y el destino, asi que cambiar cualquiera de los
        // tres es un cobro distinto. La ventana de diez minutos evita que un
        // reintento de mañana reviva la llave de hoy.
        const ventana = Math.floor(Date.now() / 600_000);
        const huella = JSON.stringify({
            c: clienteId, a: elegibles.ids, e: envio, d: cotizacion.destino, w: ventana,
        });
        const idempotencyKey = `apenvio:${crypto.createHash('sha256').update(huella).digest('hex').slice(0, 48)}`;

        const folios = elegibles.apartados.map((a) => a.folio).join(', ');

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(envio * 100),
            currency: 'mxn',
            capture_method: 'manual',
            automatic_payment_methods: { enabled: true },
            description: `Envío de ${folios}`,
            // El metadata es la version autoritativa: lo escribio el servidor y
            // vuelve de Stripe sin que el navegador haya podido tocarlo. Es lo
            // unico que /confirmar se cree.
            metadata: {
                clienteId: String(clienteId),
                apartadoIds: elegibles.ids.join(','),
                folios,
                envioMXN: envio.toFixed(2),
                mercanciaMXN: elegibles.mercancia.toFixed(2),
                itemsHash,
                envioDestino: cotizacion.destino,
                carrier: cotizacion.carrier || '',
                service: cotizacion.service || '',
            },
        }, { idempotencyKey });

        return NextResponse.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            envio,
            mercancia: elegibles.mercancia,
            folios: elegibles.apartados.map((a) => a.folio),
        });
    } catch (error) {
        console.error('[Apartado/envio/preparar]', error);
        return NextResponse.json({ success: false, error: 'No pudimos preparar el cobro del envío.' }, { status: 500 });
    }
}
