import { test, sql, expectError, assert, assertEqual, assertUsesIndex, seed, makeSale } from './harness.mjs';

const G = 'CREDITO DE TIENDA';

// El saldo de tienda vive en tres sitios y los tres tienen que contar lo mismo:
//
//   clientes.store_credit  el numero
//   credit_history         por que vale eso (movimientos, + y -)
//   credit_topups          que cobros de tarjeta ya se acreditaron
//
// Estas pruebas replican en SQL lo que hacen las rutas, porque el descuadre que
// tuvo este modulo no estaba en una funcion sino en el REPARTO: /api/checkout
// leia el saldo, /api/orders/capture lo restaba, y en medio cabia un pedido
// entero. Eso no se ve leyendo un archivo; se ve corriendo la secuencia.

/** El saldo de un cliente, como numero. */
async function saldo(clienteId) {
    const [r] = await sql(`SELECT store_credit FROM clientes WHERE id = ?`, [clienteId]);
    return Number(r[0].store_credit);
}

/** Una recarga acreditada, tal como la escribe /api/credit/confirm. */
async function recargar(clienteId, monto, pi, { moneda = 'MXN', cargo = monto } = {}) {
    const [ins] = await sql(
        `INSERT IGNORE INTO credit_topups (cliente_id, payment_intent_id, amount, currency, charged_amount)
         VALUES (?,?,?,?,?)`, [clienteId, pi, monto, moneda, cargo]);
    if (ins.affectedRows !== 1) return false;   // ya estaba acreditado
    await sql(`UPDATE clientes SET store_credit = store_credit + ? WHERE id = ?`, [monto, clienteId]);
    await sql(`INSERT INTO credit_history (cliente_id, amount, description) VALUES (?,?,?)`,
        [clienteId, monto, 'Recarga de saldo con tarjeta']);
    return true;
}

/** Lo que hace lib/credito.gastarCredito: descuenta lo que HAY, no lo que se pide. */
async function gastar(clienteId, pedido, saleId) {
    const disponible = await saldo(clienteId);
    const aplicado = Math.min(disponible, pedido);
    if (aplicado <= 0) return 0;
    await sql(`UPDATE clientes SET store_credit = store_credit - ? WHERE id = ?`, [aplicado, clienteId]);
    await sql(`INSERT INTO credit_history (cliente_id, amount, description) VALUES (?,?,?)`,
        [clienteId, -aplicado, `Saldo aplicado al pedido #${saleId}`]);
    return aplicado;
}

/** Un pedido web con su saldo ya descontado, como /api/checkout/confirm. */
async function pedido(f, { credito = 0 } = {}) {
    const saleId = await makeSale(f);
    const aplicado = await gastar(f.clienteId, credito, saleId);
    await sql(
        `INSERT INTO bisonte_orders (sale_id, cliente_id, payment_intent_id, pago_estado, estado, credito_aplicado)
         VALUES (?,?,?,'autorizado','pendiente',?)`,
        [saleId, f.clienteId, `pi_${saleId}_${Date.now()}`, aplicado]);
    return { saleId, aplicado };
}

/** La transicion de estado del pedido, con la condicion que la protege. Es lo
 *  que devuelve `affectedRows === 1` a una sola de dos llamadas simultaneas. */
async function transicion(saleId, desde, hasta) {
    const [upd] = await sql(
        `UPDATE bisonte_orders SET pago_estado = ? WHERE sale_id = ? AND pago_estado = ?`,
        [hasta, saleId, desde]);
    return upd.affectedRows === 1;
}

/** Capturar es cobrar: el saldo se gasto de verdad y no vuelve. Es la rama de
 *  /api/orders/capture con action='capture', que ya no toca `store_credit`. */
async function capturar(saleId) {
    return transicion(saleId, 'autorizado', 'capturado');
}

/** Cancelar y reembolsar SI devuelven. La devolucion cuelga de la transicion
 *  -- no de una lectura previa -- y por eso un reintento no devuelve dos veces.
 *  Modela /api/orders/capture (action='cancel') y /api/orders/refund. */
async function devolver(saleId, desde, hasta, motivo) {
    if (!await transicion(saleId, desde, hasta)) return false;
    const [r] = await sql(
        `SELECT cliente_id, credito_aplicado FROM bisonte_orders WHERE sale_id = ?`, [saleId]);
    const o = r[0];
    if (o.credito_aplicado > 0) {
        await sql(`UPDATE clientes SET store_credit = store_credit + ? WHERE id = ?`,
            [o.credito_aplicado, o.cliente_id]);
        await sql(`INSERT INTO credit_history (cliente_id, amount, description) VALUES (?,?,?)`,
            [o.cliente_id, o.credito_aplicado, `Saldo devuelto: pedido #${saleId} ${motivo}`]);
    }
    return true;
}


// ── La recarga: el libro es lo que impide acreditar dos veces ───────────────

test(G, 'una recarga sube el saldo y deja su movimiento', async () => {
    const f = await seed();
    await recargar(f.clienteId, 500, 'pi_recarga_1');
    assertEqual(await saldo(f.clienteId), 500);
    const [h] = await sql(`SELECT amount, description FROM credit_history WHERE cliente_id = ?`, [f.clienteId]);
    assertEqual(h.length, 1, 'la recarga tiene que explicarse en el historial');
    assertEqual(h[0].amount, '500.00');
});

test(G, 'el mismo cobro no se acredita dos veces', async () => {
    // El caso real: doble clic, reintento tras un error de red, un F5 con el
    // dialogo abierto. Los tres repiten la llamada con el MISMO PaymentIntent.
    const f = await seed();
    assert(await recargar(f.clienteId, 500, 'pi_repetido'), 'la primera si acredita');
    assert(!await recargar(f.clienteId, 500, 'pi_repetido'), 'la segunda tiene que rebotar');
    assertEqual(await saldo(f.clienteId), 500, 'el saldo no puede subir dos veces por un cobro');
});

test(G, 'dos recargas distintas del mismo monto si se acreditan las dos', async () => {
    // El reverso del anterior: quien recarga $500 el lunes y $500 el martes no
    // esta repitiendo nada. Por eso el UNIQUE va en el PaymentIntent y no en
    // (cliente, monto), y por eso /topup no manda idempotencyKey a Stripe.
    const f = await seed();
    await recargar(f.clienteId, 500, 'pi_lunes');
    await recargar(f.clienteId, 500, 'pi_martes');
    assertEqual(await saldo(f.clienteId), 1000);
});

test(G, 'una recarga de cero o negativa la rechaza la base', async () => {
    const f = await seed();
    await expectError(() => sql(
        `INSERT INTO credit_topups (cliente_id, payment_intent_id, amount, charged_amount)
         VALUES (?,?,?,?)`, [f.clienteId, 'pi_cero', 0, 0]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'el cobro en dolares guarda lo que vio la tarjeta', async () => {
    // El saldo son pesos siempre; el cargo pudo salir en USD al tipo de cambio
    // del servidor. Sin las dos columnas no hay como cuadrar el abono con
    // Stripe el dia que alguien reclame.
    const f = await seed();
    await recargar(f.clienteId, 1000, 'pi_usd', { moneda: 'USD', cargo: 49.00 });
    const [r] = await sql(`SELECT amount, currency, charged_amount FROM credit_topups WHERE payment_intent_id = ?`, ['pi_usd']);
    assertEqual(r[0].amount, '1000.00', 'el saldo abonado son pesos');
    assertEqual(r[0].currency, 'USD');
    assertEqual(r[0].charged_amount, '49.00');
    assertEqual(await saldo(f.clienteId), 1000);
});

test(G, 'borrar al cliente se lleva su libro de recargas', async () => {
    const f = await seed();
    await recargar(f.clienteId, 300, 'pi_borrado');
    await sql(`DELETE FROM clientes WHERE id = ?`, [f.clienteId]);
    const [r] = await sql(`SELECT id FROM credit_topups WHERE payment_intent_id = ?`, ['pi_borrado']);
    assertEqual(r.length, 0);
});


// ── El gasto: el agujero que tenia este modulo ──────────────────────────────

test(G, 'gastar el saldo lo descuenta y deja su movimiento negativo', async () => {
    // Antes el gasto no dejaba rastro: el historial del perfil solo mostraba
    // recargas y el saldo bajaba sin nada que lo explicara.
    const f = await seed();
    await recargar(f.clienteId, 500, 'pi_g1');
    const { saleId, aplicado } = await pedido(f, { credito: 200 });
    assertEqual(aplicado, 200);
    assertEqual(await saldo(f.clienteId), 300);
    const [h] = await sql(
        `SELECT amount, description FROM credit_history WHERE cliente_id = ? AND amount < 0`, [f.clienteId]);
    assertEqual(h.length, 1, 'el gasto tiene que verse en el historial');
    assertEqual(h[0].amount, '-200.00');
    assertEqual(h[0].description, `Saldo aplicado al pedido #${saleId}`);
});

test(G, 'el saldo no alcanza para dos pedidos', async () => {
    // ESTE es el fallo que motivo todo. El descuento vivia en la captura, que
    // ocurre dias despues de autorizar porque el POS verifica existencias a
    // mano; mientras tanto el saldo seguia entero y /api/checkout lo volvia a
    // aplicar. Un saldo de $500 pagaba $500 en un pedido y otros $500 en el
    // siguiente, y el GREATEST(0, ...) de la captura se comia la diferencia.
    const f = await seed();
    await recargar(f.clienteId, 500, 'pi_g2');

    const a = await pedido(f, { credito: 500 });
    const b = await pedido(f, { credito: 500 });

    assertEqual(a.aplicado, 500, 'el primer pedido se lleva el saldo entero');
    assertEqual(b.aplicado, 0, 'el segundo no puede gastar un saldo que ya no existe');
    assertEqual(await saldo(f.clienteId), 0);
});

test(G, 'el saldo nunca queda negativo aunque el pedido pida de mas', async () => {
    const f = await seed();
    await recargar(f.clienteId, 100, 'pi_g3');
    const { aplicado } = await pedido(f, { credito: 900 });
    assertEqual(aplicado, 100, 'solo puede salir lo que hay');
    assertEqual(await saldo(f.clienteId), 0);
});

test(G, 'la suma del historial es el saldo', async () => {
    // La prueba de cuadre. Si algun camino mueve `store_credit` sin anotar el
    // movimiento -- que es justo lo que hacia la captura -- esta falla.
    const f = await seed();
    await recargar(f.clienteId, 500, 'pi_c1');
    await recargar(f.clienteId, 300, 'pi_c2');
    await pedido(f, { credito: 250 });
    await pedido(f, { credito: 400 });
    const [r] = await sql(`SELECT COALESCE(SUM(amount),0) AS total FROM credit_history WHERE cliente_id = ?`, [f.clienteId]);
    assertEqual(Number(r[0].total), await saldo(f.clienteId), 'el historial y el saldo tienen que contar lo mismo');
    assertEqual(await saldo(f.clienteId), 150);
});

test(G, 'un pedido no puede nacer regalando saldo', async () => {
    const f = await seed();
    const saleId = await makeSale(f);
    await expectError(() => sql(
        `INSERT INTO bisonte_orders (sale_id, cliente_id, payment_intent_id, credito_aplicado)
         VALUES (?,?,?,?)`, [saleId, f.clienteId, 'pi_negativo', -100]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});


// ── La vuelta: cancelar y reembolsar devuelven el saldo ─────────────────────

test(G, 'cancelar el pedido devuelve el saldo que se comio', async () => {
    // El pedido se lo llevo al nacer. Si se cancela y no vuelve, la tienda se
    // queda con un dinero que el cliente pago semanas antes por un pedido que
    // la tienda misma cancelo.
    const f = await seed();
    await recargar(f.clienteId, 500, 'pi_v1');
    const { saleId } = await pedido(f, { credito: 300 });
    assertEqual(await saldo(f.clienteId), 200);

    assert(await devolver(saleId, 'autorizado', 'cancelado', 'cancelado'), 'la cancelacion tiene que pasar');
    assertEqual(await saldo(f.clienteId), 500, 'el saldo vuelve entero');
});

test(G, 'reembolsar devuelve el saldo ademas del cargo de la tarjeta', async () => {
    // Stripe devuelve lo que la TARJETA pago. Un pedido de $800 cubierto con
    // $300 de saldo cobro $500 a la tarjeta, y devolver solo esos $500 le
    // desaparece al cliente los $300 que ya habia comprado.
    const f = await seed();
    await recargar(f.clienteId, 300, 'pi_v2');
    const { saleId } = await pedido(f, { credito: 300 });
    await capturar(saleId);
    assertEqual(await saldo(f.clienteId), 0);

    assert(await devolver(saleId, 'capturado', 'reembolsado', 'reembolsado'));
    assertEqual(await saldo(f.clienteId), 300);
});

test(G, 'cancelar dos veces devuelve el saldo una sola vez', async () => {
    // El POS reintenta esta llamada cuando la red se cae a mitad. La
    // devolucion cuelga de la transicion de estado justamente por esto: la
    // segunda llamada no encuentra el pedido en 'autorizado' y no devuelve nada.
    const f = await seed();
    await recargar(f.clienteId, 400, 'pi_v3');
    const { saleId } = await pedido(f, { credito: 400 });

    assert(await devolver(saleId, 'autorizado', 'cancelado', 'cancelado'), 'la primera devuelve');
    assert(!await devolver(saleId, 'autorizado', 'cancelado', 'cancelado'), 'la segunda no encuentra que cerrar');
    assertEqual(await saldo(f.clienteId), 400, 'el saldo vuelve una vez, no dos');
});

test(G, 'capturar el pedido no devuelve nada', async () => {
    // Capturar es cobrar: el saldo se gasto de verdad y se queda gastado.
    const f = await seed();
    await recargar(f.clienteId, 500, 'pi_v4');
    const { saleId } = await pedido(f, { credito: 200 });
    await capturar(saleId);
    assertEqual(await saldo(f.clienteId), 300);
});

test(G, 'el saldo devuelto se puede volver a gastar', async () => {
    // El ciclo completo: recargar, gastar, cancelar, gastar otra vez. Si la
    // devolucion no cuadrara con el gasto, el segundo pedido cobraria de menos.
    const f = await seed();
    await recargar(f.clienteId, 600, 'pi_v5');
    const a = await pedido(f, { credito: 600 });
    await devolver(a.saleId, 'autorizado', 'cancelado', 'cancelado');
    const b = await pedido(f, { credito: 600 });
    assertEqual(b.aplicado, 600, 'el saldo devuelto vuelve a estar disponible');
    assertEqual(await saldo(f.clienteId), 0);

    const [r] = await sql(`SELECT COALESCE(SUM(amount),0) AS total FROM credit_history WHERE cliente_id = ?`, [f.clienteId]);
    assertEqual(Number(r[0].total), 0, 'el historial sigue cuadrando tras la vuelta');
});


// ── Lo que la pantalla del perfil consulta ──────────────────────────────────

test(G, 'el historial del perfil sale por indice y no recorriendo la tabla', async () => {
    await assertUsesIndex(
        `SELECT id, amount, description, created_at FROM credit_history
          WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 50`,
        [1], 'idx_cliente_created');
});

test(G, 'las recargas de un cliente salen por indice', async () => {
    await assertUsesIndex(
        `SELECT id, amount, created_at FROM credit_topups
          WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 20`,
        [1], 'idx_ct_cliente_created');
});
