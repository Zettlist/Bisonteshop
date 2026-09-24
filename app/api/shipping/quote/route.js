import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { ipCliente } from '@/lib/ipCliente';
import { cotizarEnvio } from '@/lib/cotizarEnvio';

export const dynamic = 'force-dynamic';

// El calculo del paquete, la llamada a Envia y la firma del vale viven en
// lib/cotizarEnvio.js: los usa tambien el envio de un apartado ya pagado, y con
// dos copias la que se quedara atras cobraria de menos. Aqui queda lo que es
// solo de esta puerta: quien puede pedir una cotizacion y cada cuanto.
export async function POST(request) {
    try {
        // Cada llamada dispara CUATRO peticiones a Envia, que es un servicio de
        // pago. Sin sesion y sin freno, esta ruta era el amplificador mas barato de
        // la tienda: un bucle desde una laptop se convierte en miles de
        // cotizaciones facturadas, y en que Envia nos corte por abuso justo cuando
        // un cliente de verdad quiere pagar. No se exige sesion a proposito — se
        // cotiza antes de entrar — asi que el freno va por IP.
        const ip = ipCliente(request);
        const { allowed, retryAfter } = rateLimit(`cotizar-envio:${ip}`, 20, 60_000);
        if (!allowed) {
            return NextResponse.json(
                { success: false, error: `Demasiadas cotizaciones seguidas. Espera ${retryAfter} segundos.` },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
        }

        const { items, destination } = await request.json();

        if (!items?.length || !destination?.cp || !destination?.estado) {
            return NextResponse.json({ success: false, error: 'Datos insuficientes' }, { status: 400 });
        }

        const { carriers, estadoInvalido } = await cotizarEnvio({ items, destination });
        if (estadoInvalido) {
            return NextResponse.json({ success: false, error: 'Elige el estado de la lista.' }, { status: 400 });
        }

        if (!carriers.length) {
            return NextResponse.json({ success: false, error: 'No hay opciones de paquetería disponibles para este destino.' }, { status: 200 });
        }

        return NextResponse.json({ success: true, carriers });
    } catch (err) {
        console.error('[ShippingQuote]', err);
        return NextResponse.json({ success: false, error: 'No pudimos cotizar el envío. Intenta de nuevo.' }, { status: 500 });
    }
}
