// Lo que la base tiene que garantizar del cobro del saldo por la tienda web.
//
// Estas pruebas no llaman a Stripe ni a las rutas: comprueban las promesas que
// sostienen el cobro desde el esquema, que es donde siguen valiendo aunque
// manana el cobro lo escriba otro. La mas importante es la del indice unico:
// es lo unico que impide, de verdad, cobrar dos veces el mismo pago.
import { test, sql, expectError, assert, assertEqual, seed } from './harness.mjs';

const G = 'APARTADO PAGADO EN LA WEB';

/** Apartado vigente con saldo pendiente, como el que ve el cliente al entrar. */
async function apartado(f, { total = 500, pagado = 150 } = {}) {
    const [a] = await sql(
        `INSERT INTO anticipos (empresa_id, folio, cliente_id, customer_name, total_amount,
                                paid_amount, dias_plazo, expires_at, created_by)
         VALUES (?,?,?,?,?,?,15,DATE_ADD(NOW(), INTERVAL 15 DAY),?)`,
        [f.empresaId, `AP-WEB-${String(++folio).padStart(4, '0')}`, f.clienteId, 'Ana Lopez',
            total, pagado, f.userId]);
    return a.insertId;
}
let folio = 0;

/** Un abono cobrado por la web: sin turno de caja y sin cajero, porque no hubo
 *  ni lo uno ni lo otro. */
const abonoWeb = (id, monto, pi) => sql(
    `INSERT INTO anticipo_payments (anticipo_id, amount, payment_method, payment_intent_id,
                                    cash_session_id, created_by, notes)
     VALUES (?,?, 'web', ?, NULL, NULL, 'Liquidación web')`,
    [id, monto, pi]);

// ── El metodo de pago dice de donde vino el dinero ───────────────────────────
test(G, 'un abono puede venir de la web, y se distingue de la tarjeta del mostrador', async () => {
    // Si `web` no fuera un valor propio habria que deducirlo de las notas, y un
    // reporte no puede sumar por una cadena de texto libre.
    const f = await seed();
    const id = await apartado(f);
    await abonoWeb(id, 350, 'pi_prueba_metodo');
    const [[fila]] = await sql(
        'SELECT payment_method FROM anticipo_payments WHERE anticipo_id = ?', [id]);
    assertEqual(fila.payment_method, 'web', 'el abono deberia quedar marcado como web');
});

test(G, 'un metodo de pago inventado lo rechaza la base', async () => {
    const f = await seed();
    const id = await apartado(f);
    await expectError(
        () => sql(`INSERT INTO anticipo_payments (anticipo_id, amount, payment_method)
                   VALUES (?,?,?)`, [id, 100, 'paypal']),
        'WARN_DATA_TRUNCATED');
});

// ── La promesa de no cobrar dos veces ────────────────────────────────────────
test(G, 'el mismo cobro no se puede registrar dos veces', async () => {
    // Esta es la prueba que importa. /confirm se puede llamar dos veces sin que
    // nadie haga nada raro: un doble clic, un reintento de red, un F5 en la
    // pantalla de pago. Sin el UNIQUE, la segunda llamada volveria a sumar el
    // importe a `paid_amount` y el cliente pagaria una vez y constaria dos.
    const f = await seed();
    const id = await apartado(f);
    await abonoWeb(id, 200, 'pi_repetido');
    await expectError(() => abonoWeb(id, 200, 'pi_repetido'), 'ER_DUP_ENTRY');
});

test(G, 'la llave unica no estorba a los abonos del mostrador', async () => {
    // En caja no hay PaymentIntent: esas filas van con NULL. Si el UNIQUE
    // contara los NULL como iguales, el segundo abono en efectivo del dia
    // reventaria. MySQL admite tantos NULL como haga falta, y esto lo fija.
    const f = await seed();
    const id = await apartado(f, { total: 900, pagado: 100 });
    await sql(`INSERT INTO anticipo_payments (anticipo_id, amount, payment_method) VALUES (?,?, 'cash')`, [id, 100]);
    await sql(`INSERT INTO anticipo_payments (anticipo_id, amount, payment_method) VALUES (?,?, 'cash')`, [id, 150]);
    const [[{ n }]] = await sql(
        'SELECT COUNT(*) AS n FROM anticipo_payments WHERE anticipo_id = ? AND payment_intent_id IS NULL', [id]);
    assertEqual(n, 2, 'los dos abonos de caja deberian convivir');
});

test(G, 'dos apartados distintos no pueden compartir el mismo cobro', async () => {
    // El mismo PaymentIntent abonado a dos apartados seria dinero contado dos
    // veces. El UNIQUE es de tabla, no por apartado, y eso lo cubre.
    const f = await seed();
    const uno = await apartado(f);
    const otro = await apartado(f);
    await abonoWeb(uno, 100, 'pi_compartido');
    await expectError(() => abonoWeb(otro, 100, 'pi_compartido'), 'ER_DUP_ENTRY');
});

// ── El dinero de la web no esta en el cajon ──────────────────────────────────
test(G, 'el abono web no entra en el efectivo esperado en caja', async () => {
    // La consulta es la de cashSessions.abonosEnEfectivo(). Un cobro de Stripe
    // no paso por el cajon, y si contara ahi el corte pediria un dinero que
    // nunca estuvo en la tienda.
    const f = await seed();
    const id = await apartado(f, { total: 1000, pagado: 100 });
    const [s] = await sql(
        `INSERT INTO cash_sessions (empresa_id, user_id, opening_amount, status)
         VALUES (?,?,?, 'open')`, [f.empresaId, f.userId, 500]);
    await sql(`INSERT INTO anticipo_payments (anticipo_id, amount, payment_method, cash_session_id, created_by)
               VALUES (?,?, 'cash', ?, ?)`, [id, 200, s.insertId, f.userId]);
    await abonoWeb(id, 300, 'pi_fuera_de_caja');

    const [[{ total }]] = await sql(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM anticipo_payments
          WHERE cash_session_id = ? AND payment_method = 'cash'`, [s.insertId]);
    assertEqual(Number(total), 200, 'en el cajon solo deberian contarse los 200 en efectivo');
});

test(G, 'el reporte de abonos si ve el cobro de la web', async () => {
    // Fuera del corte, pero no invisible: quien concilia tiene que poder verlo.
    const f = await seed();
    const id = await apartado(f);
    await abonoWeb(id, 275, 'pi_en_reporte');
    const [filas] = await sql(
        `SELECT ap.amount, ap.payment_method, a.folio
           FROM anticipo_payments ap
           JOIN anticipos a ON a.id = ap.anticipo_id
          WHERE a.empresa_id = ? AND ap.payment_method = 'web'`, [f.empresaId]);
    assert(filas.length >= 1, 'el cobro web deberia salir en el reporte');
});

// ── Las reglas de siempre siguen valiendo para el cobro web ──────────────────
test(G, 'la web tampoco puede abonar mas que el total', async () => {
    // El limite es de la base y no de la ruta: vale para el mostrador, para la
    // web y para lo que venga despues.
    const f = await seed();
    const id = await apartado(f, { total: 500, pagado: 150 });
    await expectError(
        () => sql('UPDATE anticipos SET paid_amount = ? WHERE id = ?', [600, id]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'un cobro web de cero pesos no tiene sentido y la base lo rechaza', async () => {
    const f = await seed();
    const id = await apartado(f);
    await expectError(() => abonoWeb(id, 0, 'pi_de_cero'), 'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'liquidar por la web deja el apartado pagado y todavia sin entregar', async () => {
    // El estado no lo cambia el dinero. Un apartado pagado sigue 'pending'
    // hasta que alguien entrega la mercancia en el mostrador, y de ahi viene la
    // condicion `paid_amount < total_amount` del job de vencimientos: sin ella,
    // este apartado se venceria esta noche con el dinero ya cobrado.
    const f = await seed();
    const id = await apartado(f, { total: 500, pagado: 150 });
    await abonoWeb(id, 350, 'pi_liquidacion');
    await sql('UPDATE anticipos SET paid_amount = paid_amount + ? WHERE id = ?', [350, id]);

    const [[a]] = await sql(
        'SELECT status, total_amount, paid_amount FROM anticipos WHERE id = ?', [id]);
    assertEqual(a.status, 'pending', 'pagar no entrega');
    assertEqual(Number(a.paid_amount), Number(a.total_amount), 'deberia quedar sin saldo');

    const [[vence]] = await sql(
        `SELECT COUNT(*) AS n FROM anticipos
          WHERE id = ? AND status = 'pending' AND paid_amount < total_amount`, [id]);
    assertEqual(vence.n, 0, 'el job de vencimientos ya no deberia verlo');
});

test(G, 'borrar el apartado se lleva su cobro web', async () => {
    const f = await seed();
    const id = await apartado(f);
    await abonoWeb(id, 120, 'pi_en_cascada');
    await sql('DELETE FROM anticipos WHERE id = ?', [id]);
    const [[{ n }]] = await sql(
        'SELECT COUNT(*) AS n FROM anticipo_payments WHERE anticipo_id = ?', [id]);
    assertEqual(n, 0, 'el abono deberia irse con el apartado');
});
