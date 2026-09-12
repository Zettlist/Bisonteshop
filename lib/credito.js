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
