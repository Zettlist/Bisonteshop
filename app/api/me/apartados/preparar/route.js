import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { crearIntento } from '@/lib/intentoFresco';
import { priceCart } from '@/lib/pricing';
import { calcularApartado, DIAS_APARTADO } from '@/lib/apartado';
import { vencimiento, MAX_ABIERTOS } from '@/lib/apartadoServidor';

export const dynamic = 'force-dynamic';

/**
 * Prepara el cobro de un apartado nuevo hecho desde la tienda.
 *
 * Aqui NO se escribe nada: si la persona cierra la pestana despues de este
 * paso, no queda un apartado a medias ni una pieza separada que nadie va a
 * pagar. La fila nace en /crear, cuando la tarjeta ya autorizo.
 *
 * El importe lo elige el cliente, entre el anticipo minimo de su tipo y el
 * total. Lo que no elige es el precio: sale de la base por el mismo camino que
 * el carrito (priceCart), porque lo que mande el navegador es manipulable.
 *
 * El dinero se autoriza y se cobra en /crear, cuando el apartado ya esta
 * escrito. Al reves —cobrar y luego apuntar— un fallo de la base dejaria un
 * cargo sin apartado que lo explique.
 */
export async function POST(request) {
    const clienteId = await getClienteId();
    if (!clienteId) {
        return NextResponse.json({ success: false, error: 'Inicia sesión para apartar.' }, { status: 401 });
    }

    const { allowed } = rateLimit(`apartado-nuevo:${clienteId}`, 10, 60_000);
    if (!allowed) {
        return NextResponse.json({ success: false, error: 'Demasiados intentos. Espera un minuto.' }, { status: 429 });
    }

    let cuerpo;
    try {
        cuerpo = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    const productoId = Number(cuerpo?.productoId);
    if (!Number.isInteger(productoId) || productoId <= 0) {
        return NextResponse.json({ success: false, error: 'Artículo inválido.' }, { status: 400 });
    }

    try {
        // Una pieza por apartado en esta primera version. La tabla admite
        // varias y el POS las crea asi desde el mostrador; lo que no existe es
        // la pantalla para pedirlas, y aceptar una cantidad que nadie puede
        // escribir seria codigo sin usar.
        const { lines, errors } = await priceCart([{ id: productoId, quantity: 1 }]);
        if (errors.length || !lines.length) {
            return NextResponse.json(
                { success: false, error: errors[0] || 'Ese artículo no está disponible.' },
                { status: 404 }
            );
        }

        const linea = lines[0];

        // La preventa se aparta contra `preventa_reservada` y su plazo arranca
        // cuando el pedido llega a la tienda, cosa que la web no sabe. Va por
        // su propio camino (pre_orders) y todavia no esta hecho.
        if (linea.esPreventa) {
            return NextResponse.json(
                { success: false, error: 'Las preventas todavía no se pueden apartar por internet. Escríbenos.' },
                { status: 409 }
            );
        }

        if (linea.disponible < 1) {
            return NextResponse.json({ success: false, error: 'Se acabó este artículo.' }, { status: 409 });
        }

        const [[cuenta]] = await pool.query(
            "SELECT COUNT(*) AS abiertos FROM anticipos WHERE cliente_id = ? AND status = 'pending'",
            [clienteId]
        );
        if (Number(cuenta.abiertos) >= MAX_ABIERTOS) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Ya tienes ${MAX_ABIERTOS} apartados abiertos. Liquida alguno para apartar otra cosa.`,
                },
                { status: 409 }
            );
        }

        const { total, anticipo: minimo } = calcularApartado(linea.lineTotal, 'normal');

        // Lo que paga hoy: desde el minimo hasta el total. Se admite pagarlo
        // entero — hay quien prefiere no deber nada — y por debajo del minimo
        // no, porque ese piso existe para que la comision de la tarjeta no se
        // coma el anticipo.
        const pedido = cuerpo?.monto === undefined || cuerpo?.monto === null
            ? minimo
            : Math.round(Number(cuerpo.monto) * 100) / 100;

        if (!(pedido > 0) || pedido < minimo || pedido > total) {
            return NextResponse.json(
                { success: false, error: `El anticipo va de $${minimo.toFixed(2)} a $${total.toFixed(2)}.` },
                { status: 400 }
            );
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

        // Idempotencia con ventana de diez minutos: dos clics seguidos reusan
        // la misma autorizacion en vez de retener el dinero dos veces, y quien
        // vuelva manana a apartar otra pieza igual por el mismo importe recibe
        // una nueva. /crear sabe atender un cobro que ya venia cobrado.
        const ventana = Math.floor(Date.now() / 600_000);
        const huella = JSON.stringify({ c: clienteId, p: productoId, m: pedido, v: ventana });
        const idempotencyKey = `apartado-nuevo:${crypto.createHash('sha256').update(huella).digest('hex').slice(0, 48)}`;

        // crearIntento y no .create a secas: ver lib/intentoFresco.js.
        const paymentIntent = await crearIntento(stripe, {
            amount: Math.round(pedido * 100),
            currency: 'mxn',
            capture_method: 'manual',
            automatic_payment_methods: { enabled: true },
            description: `Anticipo de apartado · ${linea.name}`,
            // Esto es lo unico que /crear se cree: lo escribio el servidor y
            // vuelve de Stripe sin que el navegador lo haya podido tocar.
            metadata: {
                clienteId: String(clienteId),
                productoId: String(productoId),
                cantidad: '1',
                precioMXN: Number(linea.unitPrice).toFixed(2),
                totalMXN: total.toFixed(2),
                anticipoMXN: pedido.toFixed(2),
            },
        }, idempotencyKey);

        return NextResponse.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            articulo: linea.name,
            total,
            minimo,
            anticipo: pedido,
            saldo: Number((total - pedido).toFixed(2)),
            dias: DIAS_APARTADO,
            vence: vencimiento(),
        });
    } catch (error) {
        console.error('[Apartado/preparar]', error);
        return NextResponse.json({ success: false, error: 'No pudimos preparar el apartado.' }, { status: 500 });
    }
}
