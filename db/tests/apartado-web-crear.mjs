// Lo que la base tiene que garantizar cuando un apartado NACE en la tienda web.
//
// Estas pruebas no llaman a Stripe ni a la ruta: repiten las mismas sentencias
// que /api/me/apartados/crear ejecuta dentro de su transaccion, y comprueban
// las promesas que sostienen el apartado desde el esquema. Siguen valiendo
// aunque manana lo escriba otro codigo.
//
// Las dos que importan: que separar la pieza no la pueda vender nadie mas, y
// que el mismo cobro no pueda crear dos apartados.
import { test, sql, expectError, assert, assertEqual, seed, conexionAparte } from './harness.mjs';

const G = 'APARTADO HECHO EN LA WEB';

/** El folio, con el mismo contador que usan el POS y la tienda. */
async function siguienteFolio(empresaId) {
    await sql(
        `INSERT INTO apartado_sequences (empresa_id, next_seq) VALUES (?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE next_seq = LAST_INSERT_ID(next_seq + 1)`,
        [empresaId]);
    const [[fila]] = await sql('SELECT LAST_INSERT_ID() AS seq');
    return `AP-${String(fila.seq).padStart(6, '0')}`;
}

/**
 * Lo que hace la ruta, en el mismo orden: separar la pieza, sacar folio,
 * escribir el apartado, su renglon y el anticipo cobrado.
 */
async function apartarDesdeLaWeb(f, { total = 189, anticipo = 100, cantidad = 1, pi = null } = {}) {
    const [reserva] = await sql(
        `UPDATE products SET stock_reservado = stock_reservado + ?
          WHERE id = ? AND stock_reservado + ? <= stock`,
        [cantidad, f.productId, cantidad]);
    if (reserva.affectedRows !== 1) throw new Error('SIN_STOCK');

    const folio = await siguienteFolio(f.empresaId);
    const [a] = await sql(
        `INSERT INTO anticipos (empresa_id, folio, cliente_id, customer_name, customer_email,
                                total_amount, paid_amount, dias_plazo, expires_at, created_by, notes)
         VALUES (?,?,?,?,?,?,?,15,DATE_ADD(NOW(), INTERVAL 15 DAY),?,?)`,
        [f.empresaId, folio, f.clienteId, 'Ana Lopez', 'ana@test.mx',
            total, anticipo, f.userId, 'Apartado hecho desde la tienda web']);

    await sql(
        `INSERT INTO anticipo_items (anticipo_id, product_id, quantity, unit_price, subtotal)
         VALUES (?,?,?,?,?)`,
        [a.insertId, f.productId, cantidad, total / cantidad, total]);

    await sql(
        `INSERT INTO anticipo_payments (anticipo_id, amount, payment_method, payment_intent_id,
                                        cash_session_id, created_by, notes)
         VALUES (?,?, 'web', ?, NULL, NULL, ?)`,
        [a.insertId, anticipo, pi, `Anticipo web · ${folio}`]);

    return { id: a.insertId, folio };
}

// ── La pieza se separa, no se vende ─────────────────────────────────────────
test(G, 'apartar separa la pieza sin tocar el stock fisico', async () => {
    // El articulo no ha salido a ninguna parte: sigue existiendo. Lo que baja
    // es lo disponible. Bajar el stock fisico aqui haria que el conteo nunca
    // cuadrara, y ademas lo volveria a bajar el POS al entregarlo.
    const f = await seed();
    await apartarDesdeLaWeb(f, { pi: 'pi_separa' });
    const [[p]] = await sql(
        'SELECT stock, stock_reservado, stock_disponible FROM products WHERE id = ?', [f.productId]);
    assertEqual(Number(p.stock), 10, 'el stock fisico no deberia moverse');
    assertEqual(Number(p.stock_reservado), 1, 'deberia quedar una pieza comprometida');
    assertEqual(Number(p.stock_disponible), 9, 'el catalogo deberia ofrecer una menos');
});

test(G, 'no se puede apartar mas de lo que hay', async () => {
    // La ultima pieza. El UPDATE condicional es lo que decide: sin el, dos
    // personas que leen "queda 1" a la vez apartan las dos.
    const f = await seed();
    await sql('UPDATE products SET stock = 1 WHERE id = ?', [f.productId]);
    await apartarDesdeLaWeb(f, { pi: 'pi_ultima' });

    let fallo = null;
    try {
        await apartarDesdeLaWeb(f, { pi: 'pi_una_mas' });
    } catch (e) {
        fallo = e.message;
    }
    assertEqual(fallo, 'SIN_STOCK', 'la segunda deberia quedarse sin pieza');
});

test(G, 'dos personas apartando la ultima pieza a la vez: solo una se la lleva', async () => {
    // La carrera de verdad, con dos conexiones. InnoDB bloquea la fila para
    // evaluar la condicion, asi que la segunda ve el contador ya subido.
    const f = await seed();
    await sql('UPDATE products SET stock = 1 WHERE id = ?', [f.productId]);

    const otra = await conexionAparte();
    try {
        await sql('START TRANSACTION');
        const [primera] = await sql(
            `UPDATE products SET stock_reservado = stock_reservado + 1
              WHERE id = ? AND stock_reservado + 1 <= stock`, [f.productId]);
        await sql('COMMIT');

        const [segunda] = await otra.query(
            `UPDATE products SET stock_reservado = stock_reservado + 1
              WHERE id = ? AND stock_reservado + 1 <= stock`, [f.productId]);

        assertEqual(primera.affectedRows, 1, 'la primera deberia llevarse la pieza');
        assertEqual(segunda.affectedRows, 0, 'la segunda no deberia poder');
    } finally {
        await otra.end();
    }
});

// ── El folio ────────────────────────────────────────────────────────────────
test(G, 'cada apartado recibe un folio distinto', async () => {
    // El contador es atomico y no un COUNT(*): ese repite numero en cuanto se
    // cancela uno, y dos clientes con el mismo folio son dos reclamaciones.
    const f = await seed();
    const uno = await apartarDesdeLaWeb(f, { pi: 'pi_folio_1' });
    const dos = await apartarDesdeLaWeb(f, { pi: 'pi_folio_2' });
    assert(uno.folio !== dos.folio, 'los folios no deberian repetirse');
    assert(/^AP-\d{6}$/.test(uno.folio), `formato de folio raro: ${uno.folio}`);
});

test(G, 'el folio de la web y el del mostrador salen del mismo contador', async () => {
    // Son los mismos apartados en la misma tabla. Dos numeraciones serian dos
    // AP-000007 distintos el mismo dia.
    const f = await seed();
    const web = await apartarDesdeLaWeb(f, { pi: 'pi_folio_web' });
    const mostrador = await siguienteFolio(f.empresaId);
    assert(mostrador > web.folio, 'el siguiente folio deberia continuar la cuenta');
});

// ── El cobro no puede crear dos apartados ───────────────────────────────────
test(G, 'el mismo cobro no puede crear dos apartados', async () => {
    // Doble clic, reintento de red, F5 en la pantalla de pago. La llave unica
    // del cobro lo para: la segunda transaccion revienta entera y no deja ni
    // apartado repetido ni pieza separada dos veces.
    const f = await seed();
    await apartarDesdeLaWeb(f, { pi: 'pi_doble_clic' });
    await expectError(() => apartarDesdeLaWeb(f, { pi: 'pi_doble_clic' }), 'ER_DUP_ENTRY');
});

test(G, 'si el cobro repetido revienta, la pieza no se queda separada dos veces', async () => {
    // Lo mismo, pero mirando el inventario: la ruta lo hace todo dentro de una
    // transaccion, asi que el choque de la llave unica deshace tambien la
    // reserva. Sin eso, cada reintento restaria una pieza del catalogo.
    const f = await seed();
    await apartarDesdeLaWeb(f, { pi: 'pi_transaccion' });

    await sql('START TRANSACTION');
    try {
        await apartarDesdeLaWeb(f, { pi: 'pi_transaccion' });
    } catch {
        await sql('ROLLBACK');
    }

    const [[p]] = await sql('SELECT stock_reservado FROM products WHERE id = ?', [f.productId]);
    assertEqual(Number(p.stock_reservado), 1, 'deberia quedar una sola pieza comprometida');
});

// ── Las reglas del apartado, con dinero de por medio ────────────────────────
test(G, 'un apartado vigente sin anticipo no cabe en la base', async () => {
    // Es la regla del negocio puesta en la tabla: el stock se separa cuando hay
    // dinero. Un apartado vivo con cero pagado es una reserva gratis.
    const f = await seed();
    await expectError(
        () => apartarDesdeLaWeb(f, { anticipo: 0, pi: 'pi_sin_anticipo' }),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'no se puede anticipar mas que el precio', async () => {
    const f = await seed();
    await expectError(
        () => apartarDesdeLaWeb(f, { total: 189, anticipo: 200, pi: 'pi_de_mas' }),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'pagarlo entero al apartarlo es valido y no lo da por entregado', async () => {
    // Hay quien prefiere no deber nada. El apartado se queda `pending` igual:
    // lo cierra quien entrega la mercancia, no el dinero.
    const f = await seed();
    const { id } = await apartarDesdeLaWeb(f, { total: 189, anticipo: 189, pi: 'pi_entero' });
    const [[a]] = await sql(
        'SELECT status, total_amount, paid_amount FROM anticipos WHERE id = ?', [id]);
    assertEqual(a.status, 'pending', 'no deberia cerrarse solo');
    assertEqual(Number(a.total_amount) - Number(a.paid_amount), 0, 'no deberia quedar saldo');
});

// ── Quien lo hizo y desde donde ─────────────────────────────────────────────
test(G, 'el apartado de la web queda atado a la cuenta del cliente', async () => {
    // Sin `cliente_id` no aparece en su perfil y no tiene donde pagar el saldo,
    // que es justo el problema que este modulo vino a resolver.
    const f = await seed();
    const { id } = await apartarDesdeLaWeb(f, { pi: 'pi_cuenta' });
    const [[a]] = await sql('SELECT cliente_id, notes FROM anticipos WHERE id = ?', [id]);
    assertEqual(a.cliente_id, f.clienteId, 'deberia quedar a nombre de la cuenta');
    assert(/tienda web/i.test(a.notes), 'la nota deberia decir que vino de internet');
});

test(G, 'el anticipo cobrado en la web no entra en el efectivo esperado en caja', async () => {
    // Es la consulta de cashSessions.abonosEnEfectivo(). El dinero llego por
    // Stripe: si contara en el corte, el cajon pediria una cantidad que nunca
    // estuvo ahi.
    const f = await seed();
    const { id } = await apartarDesdeLaWeb(f, { anticipo: 150, pi: 'pi_corte' });
    const [[fila]] = await sql(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM anticipo_payments
          WHERE anticipo_id = ? AND cash_session_id IS NOT NULL AND payment_method = 'cash'`,
        [id]);
    assertEqual(Number(fila.total), 0, 'el anticipo web no deberia contarse en caja');
});

// ── Lo que pasa si no paga ──────────────────────────────────────────────────
test(G, 'al vencer, la pieza vuelve al catalogo', async () => {
    // Lo hace el trabajo nocturno con esta misma sentencia. Se comprueba aqui
    // porque el apartado de la web es el que mas va a vencer: nadie le
    // recuerda nada al cliente en el mostrador.
    const f = await seed();
    const { id } = await apartarDesdeLaWeb(f, { pi: 'pi_vence' });
    await sql(`
        UPDATE products p JOIN anticipo_items ai ON ai.product_id = p.id
           SET p.stock_reservado = GREATEST(0, p.stock_reservado - ai.quantity)
         WHERE ai.anticipo_id = ?`, [id]);
    await sql(`UPDATE anticipos SET status = 'expired', expired_at = NOW() WHERE id = ?`, [id]);

    const [[p]] = await sql('SELECT stock, stock_disponible FROM products WHERE id = ?', [f.productId]);
    assertEqual(Number(p.stock_disponible), 10, 'la pieza deberia volver a estar a la venta');
    assertEqual(Number(p.stock), 10, 'y el stock fisico seguir intacto');
});
