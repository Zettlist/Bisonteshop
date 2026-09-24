import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { cotizarEnvio } from '@/lib/cotizarEnvio';
import { apartadosParaEnviar } from '@/lib/apartadoEnvio';

export const dynamic = 'force-dynamic';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

/**
 * Cuanto cuesta mandar uno o varios apartados ya pagados, a la direccion que
 * ponga el cliente.
 *
 * La mercancia NO llega en el cuerpo de la peticion: se lee de los apartados.
 * De ella depende el tamaño del paquete y por tanto el precio, asi que dejarla
 * en manos del navegador seria dejar que cotizara una caja mas chica que la que
 * de verdad hay que mandar.
 *
 * Cada opcion sale con su vale firmado, atado a esa mercancia y a ese destino.
 * Es el mismo vale del checkout y lo lee la misma funcion.
 */
export async function POST(request) {
    const clienteId = await getClienteId();
    if (!clienteId) {
        return NextResponse.json({ success: false, error: 'No has iniciado sesión.' }, { status: 401 });
    }

    // Cada cotizacion son cuatro peticiones a Envia, que se pagan. El freno va
    // por cuenta y no por IP porque aqui ya hay sesion: es mas preciso.
    const { allowed, retryAfter } = rateLimit(`cotizar-apartado:${clienteId}`, 15, 60_000);
    if (!allowed) {
        return NextResponse.json(
            { success: false, error: `Demasiadas cotizaciones seguidas. Espera ${retryAfter} segundos.` },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    let cuerpo;
    try {
        cuerpo = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    const { apartadoIds, direccion } = cuerpo || {};

    const faltan = ['calle', 'colonia', 'cp', 'municipio', 'estado']
        .filter((campo) => !String(direccion?.[campo] || '').trim());
    if (faltan.length) {
        return NextResponse.json(
            { success: false, error: 'Completa la dirección de entrega.' },
            { status: 400 }
        );
    }

    try {
        const elegibles = await apartadosParaEnviar(pool, {
            clienteId, empresaId: EMPRESA_ID, ids: apartadoIds,
        });
        if (elegibles.error) {
            // 409 y no 400: la peticion esta bien formada, lo que no cuadra es
            // el estado del apartado. El cliente tiene que hacer algo (liquidar,
            // mirar sus pedidos), no corregir un campo.
            return NextResponse.json(
                { success: false, error: elegibles.error, codigo: elegibles.codigo },
                { status: elegibles.codigo === 'vacio' ? 400 : 409 }
            );
        }

        const items = elegibles.items.map((i) => ({ id: i.productId, quantity: i.quantity }));
        const { carriers, estadoInvalido } = await cotizarEnvio({ items, destination: direccion });
        if (estadoInvalido) {
            return NextResponse.json({ success: false, error: 'Elige el estado de la lista.' }, { status: 400 });
        }

        if (!carriers.length) {
            return NextResponse.json({
                success: false,
                error: 'No hay opciones de paquetería disponibles para ese destino. Revisa el código postal o escríbenos.',
            });
        }

        return NextResponse.json({
            success: true,
            carriers,
            mercancia: elegibles.mercancia,
            folios: elegibles.apartados.map((a) => a.folio),
        });
    } catch (error) {
        console.error('[Apartado/envio/cotizar]', error);
        return NextResponse.json(
            { success: false, error: 'No pudimos cotizar el envío. Intenta de nuevo.' },
            { status: 500 }
        );
    }
}
