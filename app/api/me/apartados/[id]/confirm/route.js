import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Registra el abono web y cobra la autorizacion.
 *
 * El orden importa y es el motivo de que esta ruta exista aparte: primero se
 * escribe el abono en la base, dentro de una transaccion sin cerrar, y solo
 * cuando esta escrito se le dice a Stripe que cobre. Si la base falla, la
 * autorizacion se queda sin cobrar y a la persona no se le toca un peso. Al
 * reves —cobrar y luego apuntar— un fallo de la base dejaria un cargo en la
 * tarjeta que la tienda no sabria explicar, y esa es la averia que acaba en
 * disputa.
 *
 * Lo que esta ruta NO hace, a proposito:
 *
 *   - no pone `status = 'completed'`. Un apartado se cierra cuando alguien
 *     entrega la mercancia, no cuando entra el dinero. Eso lo hace el POS con
 *     POST /apartados/:id/complete, que ademas consuma la reserva de stock y
 *     registra la venta. Con el saldo ya cubierto, el mostrador lo liquida con
 *     `final_payment: 0` y no vuelve a cobrar nada.
 *   - no toca `products`. La mercancia ya estaba reservada desde que se creo el
 *     apartado; pagar no mueve inventario.
 */
export async function POST(request, { params }) {
    const clienteId = await getClienteId();
    if (!clienteId) {
        return NextResponse.json({ success: false, error: 'No has iniciado sesión.' }, { status: 401 });
    }

    const { id } = await params;
    const apartadoId = Number(id);

    let paymentIntentId;
    try {
        ({ paymentIntentId } = await request.json());
    } catch {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    if (!paymentIntentId || !Number.isInteger(apartadoId) || apartadoId <= 0) {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const md = paymentIntent.metadata || {};

        // El PaymentIntent tiene que ser el de ESTE apartado y el de ESTA
        // sesion. Sin esto, mandar el id de un cobro ajeno abonaria dinero de
        // otra persona a un apartado propio.
        if (md.apartadoId !== String(apartadoId) || md.clienteId !== String(clienteId)) {
            return NextResponse.json({ success: false, error: 'Este pago no corresponde a tu apartado.' }, { status: 403 });
        }

        // Dos estados validos. `requires_capture` es el camino normal: se
        // autorizo y falta cobrar. `succeeded` es el reintento de un cobro que
        // si llego a Stripe pero cuyo registro no se pudo cerrar; hay que
        // apuntarlo, no cobrarlo otra vez.
        const yaCobrado = paymentIntent.status === 'succeeded';
        if (!yaCobrado && paymentIntent.status !== 'requires_capture') {
            return NextResponse.json(
                { success: false, error: `El pago no se completó (${paymentIntent.status}).` },
                { status: 400 }
            );
        }

        const monto = Number(md.saldoMXN);
        if (!(monto > 0) || Math.round(monto * 100) !== paymentIntent.amount) {
            console.error('[Apartado/confirm] Importe inconsistente', { paymentIntentId, md, amount: paymentIntent.amount });
            return NextResponse.json({ success: false, error: 'No pudimos registrar el pago.' }, { status: 500 });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // El renglon del abono va primero porque es el que lleva la llave
            // unica: si este cobro ya estaba registrado, choca aqui y ni se
            // intenta sumar el importe por segunda vez.
            await conn.query(
                `INSERT INTO anticipo_payments
                    (anticipo_id, amount, payment_method, payment_intent_id, cash_session_id, created_by, notes)
                 VALUES (?, ?, 'web', ?, NULL, NULL, ?)`,
                [apartadoId, monto, paymentIntentId, `Liquidación web · ${md.folio || ''}`.trim()]
            );

            // Sin SELECT ... FOR UPDATE previo: las condiciones del WHERE hacen
            // el trabajo de la cerradura en una sola sentencia, y ademas la
            // tienda solo tiene permiso de UPDATE sobre `paid_amount` (ver
            // db/grants.sql), no sobre la fila entera.
            //
            // Si otro cobro entro en medio, o el apartado dejo de estar
            // `pending`, o el importe se pasaria del total, no cuadra ninguna
            // fila y la transaccion se deshace sin haber cobrado nada.
            const [res] = await conn.query(
                `UPDATE anticipos
                    SET paid_amount = paid_amount + ?
                  WHERE id = ?
                    AND cliente_id = ?
                    AND status = 'pending'
                    AND paid_amount + ? <= total_amount`,
                [monto, apartadoId, clienteId, monto]
            );

            if (res.affectedRows !== 1) {
                await conn.rollback();
                // La autorizacion se suelta para no dejarla retenida en la
                // tarjeta hasta que Stripe la caduque sola.
                if (!yaCobrado) {
                    await stripe.paymentIntents.cancel(paymentIntentId).catch((e) => {
                        console.error('[Apartado/confirm] No se pudo cancelar la autorización', paymentIntentId, e.message);
                    });
                }
                console.error('[Apartado/confirm] El apartado cambió durante el pago', { apartadoId, clienteId, paymentIntentId });
                return NextResponse.json(
                    { success: false, error: 'El apartado cambió mientras pagabas y no te cobramos nada. Vuelve a intentarlo o escríbenos.' },
                    { status: 409 }
                );
            }

            // Ahora si: el abono esta escrito y se cobra. Un fallo aqui deshace
            // el registro y deja la autorizacion sin cobrar.
            if (!yaCobrado) {
                await stripe.paymentIntents.capture(paymentIntentId);
            }

            await conn.commit();

            const [[estado]] = await conn.query(
                'SELECT total_amount, paid_amount FROM anticipos WHERE id = ? LIMIT 1',
                [apartadoId]
            );
            const saldo = Number((Number(estado.total_amount) - Number(estado.paid_amount)).toFixed(2));

            console.log(`[Apartado/confirm] Apartado ${apartadoId} abonado ${monto} MXN. PI ${paymentIntentId}. Saldo ${saldo}`);
            return NextResponse.json({ success: true, pagado: monto, saldo });

        } catch (dbError) {
            await conn.rollback();

            // El mismo cobro llegando dos veces (doble clic, reintento de red,
            // F5 en la pantalla de pago). El indice unico de `payment_intent_id`
            // lo para aqui: el abono ya estaba registrado y la respuesta correcta
            // es la de un pago que salio bien, no un error sobre dinero que si
            // se cobro.
            if (dbError.code === 'ER_DUP_ENTRY') {
                const [[estado]] = await pool.query(
                    'SELECT total_amount, paid_amount FROM anticipos WHERE id = ? AND cliente_id = ? LIMIT 1',
                    [apartadoId, clienteId]
                );
                if (estado) {
                    const saldo = Number((Number(estado.total_amount) - Number(estado.paid_amount)).toFixed(2));
                    console.log(`[Apartado/confirm] PI ${paymentIntentId} ya estaba registrado`);
                    return NextResponse.json({ success: true, pagado: monto, saldo, repetido: true });
                }
            }

            throw dbError;
        } finally {
            conn.release();
        }
    } catch (error) {
        // Si se llega aqui con el cobro hecho, el `commit` es lo unico que pudo
        // fallar despues del `capture`. Queda en el log lo necesario para
        // conciliarlo a mano: apartado, cobro y motivo.
        console.error('[Apartado/confirm]', { apartadoId, clienteId, paymentIntentId }, error);
        return NextResponse.json({ success: false, error: 'No pudimos registrar el pago. Escríbenos con tu folio.' }, { status: 500 });
    }
}
