import pool from '@/lib/db';
import { round2 } from '@/lib/pricing';

// ─────────────────────────────────────────────────────────────────────────────
// El saldo de tienda se mueve SOLO desde aqui.
//
// `clientes.store_credit` es un numero suelto: nada en la base dice por que
// vale lo que vale. Lo que lo explica es `credit_history`, y las dos cosas solo
// cuadran si nadie toca una sin tocar la otra. Antes cada ruta escribia su
// propio UPDATE -- /orders/capture restaba el saldo sin anotar el movimiento, y
// /orders/refund ni siquiera lo devolvia -- asi que el historial del perfil
// contaba una parte de la historia y el saldo otra.
//
// Las dos funciones de este archivo exigen una conexion (`conn`), no el pool: el
// movimiento del saldo tiene que viajar en la MISMA transaccion que el hecho que
// lo provoca (el pedido, la cancelacion, el reembolso). Si el pedido se cae, el
// saldo tiene que volver solo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Descuenta saldo por un pedido y anota el movimiento. Devuelve lo que de
 * verdad salio de la cuenta, que puede ser menos de lo pedido.
 *
 * El SELECT ... FOR UPDATE es el punto entero de la funcion: dos pedidos del
 * mismo cliente confirmandose a la vez leian el mismo saldo y lo gastaban los
 * dos. Con el candado, el segundo espera y ve la cuenta ya vaciada.
 *
 * @param {import('mysql2/promise').PoolConnection} conn  dentro de una transaccion
 * @param {number} clienteId
 * @param {number} solicitado  MXN que el cargo de Stripe ya descontó del total
 * @param {number|string} saleId  para que el movimiento diga a que pedido fue
 * @returns {Promise<number>} MXN realmente descontados
 */
export async function gastarCredito(conn, clienteId, solicitado, saleId) {
    const pedido = round2(Number(solicitado));
    if (!clienteId || !Number.isFinite(pedido) || pedido <= 0) return 0;

    const [rows] = await conn.query(
        'SELECT store_credit FROM clientes WHERE id = ? FOR UPDATE',
        [clienteId]
    );
    if (!rows.length) return 0;

    const disponible = round2(Number(rows[0].store_credit || 0));
    const aplicado = round2(Math.min(disponible, pedido));
    if (aplicado <= 0) return 0;

    await conn.query(
        'UPDATE clientes SET store_credit = store_credit - ? WHERE id = ?',
        [aplicado, clienteId]
    );
    await conn.query(
        'INSERT INTO credit_history (cliente_id, amount, description) VALUES (?, ?, ?)',
        [clienteId, -aplicado, `Saldo aplicado al pedido #${saleId}`]
    );

    return aplicado;
}

/**
 * Devuelve saldo a la cuenta y anota el movimiento.
 *
 * Quien llama tiene que haber ganado antes la carrera por el estado del pedido
 * (el UPDATE ... WHERE pago_estado = '<estado anterior>' con affectedRows = 1).
 * Esa condicion es la que hace que un reembolso reintentado devuelva el saldo
 * una vez y no tres.
 */
export async function devolverCredito(conn, clienteId, monto, motivo) {
    const cantidad = round2(Number(monto));
    if (!clienteId || !Number.isFinite(cantidad) || cantidad <= 0) return 0;

    await conn.query(
        'UPDATE clientes SET store_credit = store_credit + ? WHERE id = ?',
        [cantidad, clienteId]
    );
    await conn.query(
        'INSERT INTO credit_history (cliente_id, amount, description) VALUES (?, ?, ?)',
        [clienteId, cantidad, motivo]
    );

    return cantidad;
}

/**
 * Cierra el pedido como reembolsado y devuelve a la cuenta el saldo de tienda
 * que se comio. Los dos pasos van juntos porque son el mismo hecho.
 *
 * El reembolso de Stripe solo devuelve lo que la TARJETA pago. Un pedido de
 * $800 cubierto con $300 de saldo cobro $500 a la tarjeta, y devolver solo esos
 * $500 le desaparece al cliente los $300 que ya habia comprado: dinero real que
 * entro por /api/credit/topup y sale por ningun lado.
 *
 * La devolucion se hace UNA vez porque cuelga de la transicion de estado: el
 * `AND pago_estado = 'capturado'` solo la cumple la primera llamada, y las
 * demas ven affectedRows = 0. Eso importa porque llegan por dos caminos que no
 * se conocen —el POS llamando a /api/orders/refund, y Stripe avisando por
 * webhook cuando alguien reembolsa desde su panel— y pueden llegar los dos.
 *
 * @returns {Promise<boolean>} true si esta llamada fue la que cerro el pedido
 */
export async function cerrarReembolso(saleId, refundId) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [upd] = await conn.query(
            `UPDATE bisonte_orders
                SET pago_estado = 'reembolsado', refund_id = COALESCE(?, refund_id)
              WHERE sale_id = ? AND pago_estado = 'capturado'`,
            [refundId || null, saleId]
        );

        if (upd.affectedRows === 1) {
            const [rows] = await conn.query(
                'SELECT cliente_id, credito_aplicado FROM bisonte_orders WHERE sale_id = ? LIMIT 1',
                [saleId]
            );
            const pedido = rows[0];
            if (pedido && pedido.credito_aplicado > 0) {
                await devolverCredito(
                    conn, pedido.cliente_id, pedido.credito_aplicado,
                    `Saldo devuelto: pedido #${saleId} reembolsado`
                );
            }
        }

        await conn.commit();
        return upd.affectedRows === 1;
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

/**
 * Abona una recarga ya cobrada por Stripe.
 *
 * A diferencia de las dos de arriba, esta abre su propia transaccion: no cuelga
 * de ningun otro hecho, el hecho ES el cobro. Y la llaman DOS caminos que no se
 * conocen entre si:
 *
 *   · /api/credit/confirm — el navegador avisa en cuanto Stripe aprueba
 *   · /api/stripe/webhook — Stripe avisa por su cuenta, y reintenta dias
 *
 * Los dos pueden llegar, en cualquier orden, a la vez. Por eso vive aqui y no
 * duplicada en cada ruta: dos copias del codigo que mueve dinero es exactamente
 * como se descuadro el saldo la primera vez.
 *
 * La idempotencia la impone la base, no el orden de las llamadas: el UNIQUE de
 * `credit_topups.payment_intent_id`. El INSERT va PRIMERO — si choca, el cobro
 * ya se abono y no hay nada que sumar. Al reves, una segunda llamada abonaria
 * el saldo antes de descubrir el choque.
 *
 * @returns {Promise<{abonado:boolean, yaEstaba:boolean, amount:number, balance:number}>}
 */
export async function acreditarRecarga({ clienteId, paymentIntentId, amount, moneda, cargo, motivo }) {
    const monto = round2(Number(amount));
    if (!clienteId || !paymentIntentId || !Number.isFinite(monto) || monto <= 0) {
        throw new Error('Datos de recarga inválidos');
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [ins] = await conn.query(
            `INSERT IGNORE INTO credit_topups (cliente_id, payment_intent_id, amount, currency, charged_amount)
                  VALUES (?, ?, ?, ?, ?)`,
            [clienteId, paymentIntentId, monto, moneda === 'USD' ? 'USD' : 'MXN', round2(Number(cargo)) || monto]
        );

        if (ins.affectedRows !== 1) {
            // El IGNORE se traga cualquier error de la fila, no solo el choque
            // del UNIQUE. Antes de contestar "ya estaba abonado" -- que para el
            // cliente significa "tu dinero llego" -- hay que ver la fila.
            const [yaEsta] = await conn.query(
                'SELECT id FROM credit_topups WHERE payment_intent_id = ? LIMIT 1',
                [paymentIntentId]
            );
            await conn.rollback();
            if (!yaEsta.length) throw new Error('El registro de la recarga no se pudo guardar');
            const [b] = await conn.query('SELECT store_credit FROM clientes WHERE id = ? LIMIT 1', [clienteId]);
            return {
                abonado: false, yaEstaba: true, amount: monto,
                balance: b.length ? Number(b[0].store_credit || 0) : 0,
            };
        }

        await conn.query(
            'UPDATE clientes SET store_credit = store_credit + ? WHERE id = ?',
            [monto, clienteId]
        );
        // El historial es lo que el cliente ve en su perfil. Va en la misma
        // transaccion que el saldo a proposito: un saldo que sube sin un
        // movimiento que lo explique es una llamada a atencion al cliente.
        await conn.query(
            'INSERT INTO credit_history (cliente_id, amount, description) VALUES (?, ?, ?)',
            [clienteId, monto, motivo || 'Recarga de saldo con tarjeta']
        );

        const [rows] = await conn.query('SELECT store_credit FROM clientes WHERE id = ? LIMIT 1', [clienteId]);
        await conn.commit();

        return {
            abonado: true, yaEstaba: false, amount: monto,
            balance: rows.length ? Number(rows[0].store_credit || 0) : monto,
        };
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}
