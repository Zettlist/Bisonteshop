import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { usuarioWeb } from '@/lib/usuarioWeb';
import { reservarFolio, vencimiento, MAX_ABIERTOS } from '@/lib/apartadoServidor';
import { DIAS_APARTADO } from '@/lib/apartado';
import { sendApartadoCreado, sendNuevoApartadoAlert } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const EMPRESA_ID = Number(process.env.EMPRESA_ID || 122);

/**
 * Crea el apartado y cobra el anticipo.
 *
 * El orden es el mismo que el de la liquidacion y por el mismo motivo: primero
 * se separa la pieza y se escribe el apartado, dentro de una transaccion sin
 * cerrar, y solo cuando todo eso esta en la base se le dice a Stripe que cobre.
 * Si algo falla antes, la autorizacion se suelta y a la persona no se le toca
 * un peso. Al reves, un fallo de la base dejaria un cargo sin apartado que lo
 * explique, y eso acaba en disputa.
 *
 * La pieza se separa con un UPDATE condicional, no leyendo el stock y
 * decidiendo despues: dos personas que leen "queda 1" a la vez leen las dos que
 * si. La condicion viaja dentro del UPDATE (lib/reserva.mjs explica por que) y
 * `affectedRows = 0` significa "se agoto mientras pagabas".
 *
 * Lo que no hace: bajar el stock fisico. La pieza sigue existiendo, solo deja
 * de estar disponible. Eso lo consuma el POS al entregarla.
 */
export async function POST(request) {
    const clienteId = await getClienteId();
    if (!clienteId) {
        return NextResponse.json({ success: false, error: 'Inicia sesión para apartar.' }, { status: 401 });
    }

    let paymentIntentId;
    try {
        ({ paymentIntentId } = await request.json());
    } catch {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }
    if (!paymentIntentId) {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const md = paymentIntent.metadata || {};

        // El cobro tiene que ser de ESTA sesion. Sin esto, mandar el id de un
        // pago ajeno crearia un apartado a nombre propio con dinero de otro.
        if (md.clienteId !== String(clienteId)) {
            return NextResponse.json({ success: false, error: 'Este pago no es tuyo.' }, { status: 403 });
        }

        // `succeeded` es el reintento de un cobro que si llego a Stripe pero
        // cuyo registro no se pudo cerrar: hay que apuntarlo, no cobrarlo otra
        // vez.
        const yaCobrado = paymentIntent.status === 'succeeded';
        if (!yaCobrado && paymentIntent.status !== 'requires_capture') {
            return NextResponse.json(
                { success: false, error: `El pago no se completó (${paymentIntent.status}).` },
                { status: 400 }
            );
        }

        const productoId = Number(md.productoId);
        const cantidad = Number(md.cantidad) || 1;
        const precio = Number(md.precioMXN);
        const total = Number(md.totalMXN);
        const anticipo = Number(md.anticipoMXN);

        if (!(productoId > 0) || !(total > 0) || !(anticipo > 0) || anticipo > total
            || Math.round(anticipo * 100) !== paymentIntent.amount) {
            console.error('[Apartado/crear] Metadata inconsistente', { paymentIntentId, md, amount: paymentIntent.amount });
            return NextResponse.json({ success: false, error: 'No pudimos registrar el apartado.' }, { status: 500 });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // El tope de apartados abiertos, otra vez y aqui.
            //
            // /preparar ya lo comprueba, pero alli no se escribe nada: se puede
            // pedir diez autorizaciones seguidas viendo cero apartados abiertos
            // en las diez, y crearlos despues. El tope existe para que una
            // cuenta no separe medio catalogo con anticipos del 30%, asi que
            // tiene que medirse donde la fila nace.
            //
            // Queda una carrera fina —dos creaciones en el mismo instante leen
            // el mismo numero— que no se cierra con un candado a proposito:
            // bloquear todos los apartados del cliente para contarlos cuesta
            // mas de lo que vale pasarse por uno.
            const [[abiertos]] = await conn.query(
                "SELECT COUNT(*) AS n FROM anticipos WHERE cliente_id = ? AND status = 'pending'",
                [clienteId]
            );
            if (Number(abiertos.n) >= MAX_ABIERTOS) {
                await conn.rollback();
                if (!yaCobrado) {
                    await stripe.paymentIntents.cancel(paymentIntentId).catch((e) => {
                        console.error('[Apartado/crear] No se pudo cancelar la autorización', paymentIntentId, e.message);
                    });
                }
                return NextResponse.json(
                    {
                        success: false,
                        error: `Ya tienes ${MAX_ABIERTOS} apartados abiertos y no te cobramos nada. Liquida alguno para apartar otra cosa.`,
                    },
                    { status: 409 }
                );
            }

            // Separar la pieza. Sube lo comprometido; el stock fisico no se
            // toca porque el articulo no ha salido a ninguna parte.
            const [reserva] = await conn.query(
                `UPDATE products
                    SET stock_reservado = stock_reservado + ?
                  WHERE id = ? AND empresa_id = ? AND es_prueba = 0
                    AND stock_reservado + ? <= stock`,
                [cantidad, productoId, EMPRESA_ID, cantidad]
            );

            if (reserva.affectedRows !== 1) {
                await conn.rollback();
                if (!yaCobrado) {
                    await stripe.paymentIntents.cancel(paymentIntentId).catch((e) => {
                        console.error('[Apartado/crear] No se pudo cancelar la autorización', paymentIntentId, e.message);
                    });
                }
                return NextResponse.json(
                    { success: false, error: 'Se agotó mientras pagabas y no te cobramos nada.' },
                    { status: 409 }
                );
            }

            const [[cliente]] = await conn.query(
                `SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', nombre, apellido)), ''), 'Cliente') AS nombre,
                        email, telefono
                   FROM clientes WHERE id = ? LIMIT 1`,
                [clienteId]
            );

            const folio = await reservarFolio(conn, EMPRESA_ID);
            const vence = vencimiento(DIAS_APARTADO);
            const creador = await usuarioWeb(conn, EMPRESA_ID);

            // La nota es lo que distingue en el panel del POS un apartado de
            // internet de uno del mostrador: no hay columna que lo diga, y
            // quien lo lea necesita saber que detras no hubo nadie atendiendo.
            const [creado] = await conn.query(
                `INSERT INTO anticipos
                    (empresa_id, folio, cliente_id, customer_name, customer_phone, customer_email,
                     total_amount, paid_amount, dias_plazo, expires_at, created_by, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    EMPRESA_ID, folio, clienteId, cliente?.nombre || 'Cliente',
                    cliente?.telefono || null, cliente?.email || null,
                    total, anticipo, DIAS_APARTADO, vence, creador,
                    'Apartado hecho desde la tienda web',
                ]
            );
            const apartadoId = creado.insertId;

            await conn.query(
                `INSERT INTO anticipo_items (anticipo_id, product_id, quantity, unit_price, subtotal)
                 VALUES (?, ?, ?, ?, ?)`,
                [apartadoId, productoId, cantidad, precio, total]
            );

            // El renglon del abono lleva la llave unica del cobro. Si este
            // PaymentIntent ya estaba registrado, choca aqui y toda la
            // transaccion se deshace: ni apartado repetido ni pieza separada
            // dos veces.
            await conn.query(
                `INSERT INTO anticipo_payments
                    (anticipo_id, amount, payment_method, payment_intent_id, cash_session_id, created_by, notes)
                 VALUES (?, ?, 'web', ?, NULL, NULL, ?)`,
                [apartadoId, anticipo, paymentIntentId, `Anticipo web · ${folio}`]
            );

            if (!yaCobrado) {
                await stripe.paymentIntents.capture(paymentIntentId);
            }

            await conn.commit();

            const saldo = Number((total - anticipo).toFixed(2));
            const [[articulo]] = await conn.query('SELECT name FROM products WHERE id = ? LIMIT 1', [productoId]);

            // Los correos van despues del commit y sin esperarlos: el cobro ya
            // esta cerrado y un fallo de correo no puede deshacerlo. Uno para
            // quien aparto, con su folio y su fecha; otro para la tienda, que
            // no tiene mostrador donde enterarse de que entro un apartado.
            const datos = {
                folio,
                apartadoId,
                articulo: articulo?.name || 'Artículo',
                cantidad,
                total,
                pagado: anticipo,
                saldo,
                vence,
            };
            sendApartadoCreado({ to: cliente?.email, nombre: cliente?.nombre, ...datos })
                .catch((err) => console.error('[Mailer] confirmación de apartado:', err.message));
            sendNuevoApartadoAlert({ cliente: cliente?.nombre, email: cliente?.email, ...datos })
                .catch((err) => console.error('[Mailer] aviso de apartado nuevo:', err.message));

            console.log(`[Apartado/crear] ${folio} creado. Anticipo ${anticipo} MXN. PI ${paymentIntentId}`);
            return NextResponse.json({
                success: true,
                id: apartadoId,
                folio,
                total,
                pagado: anticipo,
                saldo,
                vence,
            });

        } catch (dbError) {
            await conn.rollback();

            // El mismo cobro llegando dos veces (doble clic, reintento de red,
            // F5 en la pantalla de pago). El apartado que nacio de ese cobro ya
            // existe: la respuesta correcta es la de un apartado hecho, no un
            // error sobre dinero que si se cobro.
            if (dbError.code === 'ER_DUP_ENTRY') {
                const [[previo]] = await pool.query(
                    `SELECT a.id, a.folio, a.total_amount, a.paid_amount, a.expires_at
                       FROM anticipo_payments ap
                       JOIN anticipos a ON a.id = ap.anticipo_id
                      WHERE ap.payment_intent_id = ? AND a.cliente_id = ?
                      LIMIT 1`,
                    [paymentIntentId, clienteId]
                );
                if (previo) {
                    console.log(`[Apartado/crear] PI ${paymentIntentId} ya tenía apartado (${previo.folio})`);
                    return NextResponse.json({
                        success: true,
                        repetido: true,
                        id: previo.id,
                        folio: previo.folio,
                        total: Number(previo.total_amount),
                        pagado: Number(previo.paid_amount),
                        saldo: Number((Number(previo.total_amount) - Number(previo.paid_amount)).toFixed(2)),
                        vence: previo.expires_at,
                    });
                }
            }

            throw dbError;
        } finally {
            conn.release();
        }
    } catch (error) {
        // Si se llega aqui con el cobro hecho, lo unico que pudo fallar despues
        // del cargo es el commit. Queda en el log lo necesario para arreglarlo
        // a mano: cliente, cobro y motivo.
        console.error('[Apartado/crear]', { clienteId, paymentIntentId }, error);
        return NextResponse.json(
            { success: false, error: 'No pudimos registrar el apartado. Escríbenos y lo resolvemos.' },
            { status: 500 }
        );
    }
}
