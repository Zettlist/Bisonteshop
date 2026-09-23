// Lo que la base tiene que garantizar cuando un apartado se convierte en un
// PAQUETE.
//
// La tienda no tiene mostrador, asi que un apartado liquidado no se recoge: se
// manda. El cliente pone su direccion, paga el envio del dia y el apartado pasa
// a «Pedidos Página Web» como cualquier pedido.
//
// La pregunta que estas pruebas contestan es una sola, y es la que se pidio
// comprobar: QUE UN APARTADO NO PUEDA ENTRAR A UN ENVIO ANTES DE ESTAR
// LIQUIDADO. Mandarlo con saldo seria entregar mercancia pagada al 30%, y el
// resto del sistema no lo impediria: el POS solo ve un pedido web normal.
//
// Se corren contra la funcion de verdad (lib/apartadoEnvio.mjs) y contra un
// MySQL real, no contra una copia de sus consultas: si alguien afloja una
// condicion, estas pruebas se caen.
import { test, sql, assert, assertEqual, seed, conexionAparte } from './harness.mjs';
import { apartadosParaEnviar, cerrarApartadosPorEnvio, MAX_APARTADOS_ENVIO } from '../../lib/apartadoEnvio.mjs';

const G = 'ENVIO DE UN APARTADO';

// `apartadosParaEnviar` espera algo con .query(); el arnes expone una funcion.
const db = { query: (...args) => sql(...args) };

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
 * Un apartado como los que deja la web: la pieza separada, el anticipo cobrado
 * y el saldo que se decida. `pagado = total` es un apartado liquidado.
 */
async function apartar(f, { total = 189, pagado = 189, cantidad = 1, productId = null } = {}) {
    const pid = productId || f.productId;
    const [reserva] = await sql(
        `UPDATE products SET stock_reservado = stock_reservado + ?
          WHERE id = ? AND stock_reservado + ? <= stock`,
        [cantidad, pid, cantidad]);
    if (reserva.affectedRows !== 1) throw new Error('SIN_STOCK');

    const folio = await siguienteFolio(f.empresaId);
    const [a] = await sql(
        `INSERT INTO anticipos (empresa_id, folio, cliente_id, customer_name,
                                total_amount, paid_amount, dias_plazo, expires_at, created_by)
         VALUES (?,?,?,?,?,?,15,DATE_ADD(NOW(), INTERVAL 15 DAY),?)`,
        [f.empresaId, folio, f.clienteId, 'Ana Lopez', total, pagado, f.userId]);

    await sql(
        `INSERT INTO anticipo_items (anticipo_id, product_id, quantity, unit_price, subtotal)
         VALUES (?,?,?,?,?)`,
        [a.insertId, pid, cantidad, total / cantidad, total]);

    return { id: a.insertId, folio };
}

/** La venta que nace al pedir el envio. Solo lo que necesita el FK. */
async function ventaDeEnvio(f, { subtotal = 189, envio = 150 } = {}) {
    const [v] = await sql(
        `INSERT INTO sales (empresa_id, user_id, origen, subtotal, discount, surcharge, total, payment_method)
         VALUES (?,?, 'web', ?, 0, ?, ?, 'card')`,
        [f.empresaId, f.userId, subtotal, envio, subtotal + envio]);
    return v.insertId;
}

// ── La regla que se pidio comprobar ─────────────────────────────────────────
test(G, 'un apartado CON SALDO no se puede enviar', async () => {
    // La puerta. Sin ella, quien apartara con el 30% podria pedir el envio y
    // recibir la mercancia entera por el precio del anticipo.
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 60 });

    const r = await apartadosParaEnviar(db, { clienteId: f.clienteId, empresaId: f.empresaId, ids: [ap.id] });
    assertEqual(r.codigo, 'con_saldo', 'deberia rechazarlo por saldo pendiente');
    assert(/129\.00/.test(r.error), `el mensaje deberia decir cuanto falta: ${r.error}`);
});

test(G, 'y el cierre tampoco cuela: el UPDATE exige liquidado', async () => {
    // La comprobacion de arriba lee y suelta la fila. Esta es la que decide de
    // verdad, dentro de la transaccion, y tiene que negarse SOLA -- aunque
    // alguien llegara hasta aqui saltandose la anterior.
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 60 });
    const saleId = await ventaDeEnvio(f);

    const cerrados = await cerrarApartadosPorEnvio(db, {
        ids: [ap.id], clienteId: f.clienteId, empresaId: f.empresaId, saleId,
    });
    assertEqual(cerrados, 0, 'no deberia cerrar un apartado con saldo');

    const [[fila]] = await sql('SELECT status, sale_id FROM anticipos WHERE id = ?', [ap.id]);
    assertEqual(fila.status, 'pending', 'deberia seguir vivo');
    assertEqual(fila.sale_id, null, 'no deberia quedar atado a ninguna venta');
});

test(G, 'un apartado liquidado si se puede enviar', async () => {
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });

    const r = await apartadosParaEnviar(db, { clienteId: f.clienteId, empresaId: f.empresaId, ids: [ap.id] });
    assert(!r.error, `deberia dejarlo pasar: ${r.error}`);
    assertEqual(r.mercancia, 189, 'la mercancia deberia ser el total del apartado');
    assertEqual(r.items.length, 1, 'deberia traer su renglon');
    assertEqual(r.items[0].productId, f.productId, 'y el producto correcto');
});

test(G, 'pagar el ultimo peso abre la puerta', async () => {
    // El limite exacto: con un centavo pendiente no se manda, con cero si. Es
    // el caso que un `>` en vez de un `>=` rompe sin que nadie lo note.
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 188.99 });

    const antes = await apartadosParaEnviar(db, { clienteId: f.clienteId, empresaId: f.empresaId, ids: [ap.id] });
    assertEqual(antes.codigo, 'con_saldo', 'con un centavo pendiente no deberia dejar');

    await sql('UPDATE anticipos SET paid_amount = total_amount WHERE id = ?', [ap.id]);
    const despues = await apartadosParaEnviar(db, { clienteId: f.clienteId, empresaId: f.empresaId, ids: [ap.id] });
    assert(!despues.error, `ya liquidado deberia dejar: ${despues.error}`);
});

// ── Lo que no es tuyo, y lo que ya no esta vivo ─────────────────────────────
test(G, 'el apartado de otra persona no se puede enviar (ni se lee)', async () => {
    const f = await seed();
    const otro = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });

    const r = await apartadosParaEnviar(db, { clienteId: otro.clienteId, empresaId: otro.empresaId, ids: [ap.id] });
    assertEqual(r.codigo, 'inexistente', 'para otra cuenta deberia no existir');
});

test(G, 'un apartado vencido no se puede enviar', async () => {
    // Vencido significa que la pieza volvio al catalogo: puede tener dueño
    // nuevo. Mandarlo seria mandar algo que ya no esta.
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });
    await sql("UPDATE anticipos SET status = 'expired' WHERE id = ?", [ap.id]);

    const r = await apartadosParaEnviar(db, { clienteId: f.clienteId, empresaId: f.empresaId, ids: [ap.id] });
    assertEqual(r.codigo, 'cerrado', 'deberia rechazar un apartado que ya no esta activo');
});

test(G, 'un apartado que ya se mando no se manda dos veces', async () => {
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });
    const saleId = await ventaDeEnvio(f);
    await cerrarApartadosPorEnvio(db, { ids: [ap.id], clienteId: f.clienteId, empresaId: f.empresaId, saleId });

    const r = await apartadosParaEnviar(db, { clienteId: f.clienteId, empresaId: f.empresaId, ids: [ap.id] });
    assertEqual(r.codigo, 'ya_enviado', 'deberia decir que ya tiene envio');
});

test(G, 'dos envios a la vez del mismo apartado: solo uno cierra', async () => {
    // La carrera de verdad, con dos conexiones. Sin el `sale_id IS NULL` del
    // UPDATE, dos pestañas abiertas cobrarian dos envios por la misma caja.
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });
    const venta1 = await ventaDeEnvio(f);
    const venta2 = await ventaDeEnvio(f);

    const otra = await conexionAparte();
    try {
        const primero = await cerrarApartadosPorEnvio(db, {
            ids: [ap.id], clienteId: f.clienteId, empresaId: f.empresaId, saleId: venta1,
        });
        const segundo = await cerrarApartadosPorEnvio(otra, {
            ids: [ap.id], clienteId: f.clienteId, empresaId: f.empresaId, saleId: venta2,
        });
        assertEqual(primero, 1, 'el primero deberia cerrarlo');
        assertEqual(segundo, 0, 'el segundo no deberia poder');
    } finally {
        await otra.end();
    }

    const [[fila]] = await sql('SELECT sale_id FROM anticipos WHERE id = ?', [ap.id]);
    assertEqual(fila.sale_id, venta1, 'deberia quedarse con la primera venta');
});

// ── El inventario ───────────────────────────────────────────────────────────
test(G, 'pedir el envio NO mueve el inventario', async () => {
    // La pieza esta separada desde que nacio el apartado. Si la web la
    // descontara aqui, el POS la volveria a descontar al confirmar el pedido y
    // el almacen perderia una pieza en cada envio.
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });
    const saleId = await ventaDeEnvio(f);

    const [[antes]] = await sql('SELECT stock, stock_reservado FROM products WHERE id = ?', [f.productId]);
    await cerrarApartadosPorEnvio(db, { ids: [ap.id], clienteId: f.clienteId, empresaId: f.empresaId, saleId });
    const [[despues]] = await sql('SELECT stock, stock_reservado FROM products WHERE id = ?', [f.productId]);

    assertEqual(despues.stock, antes.stock, 'el stock fisico no deberia moverse');
    assertEqual(despues.stock_reservado, antes.stock_reservado, 'la pieza deberia seguir separada');
    assertEqual(Number(despues.stock_reservado), 1, 'y seguir siendo una');
});

test(G, 'el pedido hereda la reserva: el POS la consuma una sola vez', async () => {
    // El traspaso completo. El POS baja el stock con esta misma sentencia
    // (commitReservation en webOrders.js): la pieza sale del almacen UNA vez y
    // la reserva queda en cero, sin que nadie la libere por su cuenta.
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });
    const saleId = await ventaDeEnvio(f);
    await sql('INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?,?,?,?)',
        [saleId, f.productId, 1, 189]);
    await cerrarApartadosPorEnvio(db, { ids: [ap.id], clienteId: f.clienteId, empresaId: f.empresaId, saleId });

    await sql(`
        UPDATE products p
          JOIN sale_items si ON si.product_id = p.id
           SET p.stock = p.stock - si.quantity,
               p.stock_reservado = GREATEST(0, p.stock_reservado - si.quantity)
         WHERE si.sale_id = ?`, [saleId]);

    const [[p]] = await sql('SELECT stock, stock_reservado, stock_disponible FROM products WHERE id = ?', [f.productId]);
    assertEqual(Number(p.stock), 9, 'deberia salir una pieza del almacen');
    assertEqual(Number(p.stock_reservado), 0, 'y dejar de estar comprometida');
    assertEqual(Number(p.stock_disponible), 9, 'el catalogo deberia ver nueve');
});

// ── Envio multiple ──────────────────────────────────────────────────────────
test(G, 'varios apartados liquidados caben en la misma caja', async () => {
    const f = await seed();
    const [otroProducto] = await sql(
        'INSERT INTO products (empresa_id, name, cost_price, sale_price, stock) VALUES (?,?,?,?,?)',
        [f.empresaId, 'Vagabond Vol.1', 90, 210, 5]);

    const uno = await apartar(f, { total: 189, pagado: 189 });
    const dos = await apartar(f, { total: 210, pagado: 210, productId: otroProducto.insertId });

    const r = await apartadosParaEnviar(db, {
        clienteId: f.clienteId, empresaId: f.empresaId, ids: [uno.id, dos.id],
    });
    assert(!r.error, `deberia dejar pasar los dos: ${r.error}`);
    assertEqual(r.mercancia, 399, 'la mercancia deberia sumar los dos apartados');
    assertEqual(r.items.length, 2, 'deberia traer los dos renglones');
});

test(G, 'basta con que UNO tenga saldo para que no salga la caja', async () => {
    // El caso peligroso del envio multiple: colar uno a medio pagar entre dos
    // liquidados. La comprobacion es por apartado, no por el conjunto.
    const f = await seed();
    const bueno = await apartar(f, { total: 189, pagado: 189 });
    const malo = await apartar(f, { total: 189, pagado: 100 });

    const r = await apartadosParaEnviar(db, {
        clienteId: f.clienteId, empresaId: f.empresaId, ids: [bueno.id, malo.id],
    });
    assertEqual(r.codigo, 'con_saldo', 'deberia rechazar la caja entera');

    const saleId = await ventaDeEnvio(f);
    const cerrados = await cerrarApartadosPorEnvio(db, {
        ids: [bueno.id, malo.id], clienteId: f.clienteId, empresaId: f.empresaId, saleId,
    });
    // El UPDATE cierra solo los que cuadran; la ruta compara ese numero con los
    // que pidio y deshace la transaccion. Aqui se comprueba que de verdad NO
    // los cierra todos.
    assertEqual(cerrados, 1, 'solo el liquidado deberia cuadrar');
});

test(G, 'no caben mas de los que caben', async () => {
    const r = await apartadosParaEnviar(db, {
        clienteId: 1, empresaId: 1,
        ids: Array.from({ length: MAX_APARTADOS_ENVIO + 1 }, (_, i) => i + 1),
    });
    assertEqual(r.codigo, 'demasiados', 'deberia poner un limite al tamaño de la caja');
});

// ── Mercancia que no se puede meter en una caja ─────────────────────────────
test(G, 'una preventa no se envia: todavia viene en camino', async () => {
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });
    await sql("UPDATE products SET estado = 'preventa' WHERE id = ?", [f.productId]);

    const r = await apartadosParaEnviar(db, { clienteId: f.clienteId, empresaId: f.empresaId, ids: [ap.id] });
    assertEqual(r.codigo, 'preventa', 'deberia negarse a mandar algo que no esta');
});

test(G, 'si la pieza no aparece en el almacen, no se cobra el envio', async () => {
    // Merma o ajuste a mano: la reserva dice que hay una y el estante dice que
    // no. Mas vale decirlo antes de cobrar que dejar que el POS cancele el
    // pedido despues.
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });
    await sql('UPDATE products SET stock = 0, stock_reservado = 0 WHERE id = ?', [f.productId]);

    const r = await apartadosParaEnviar(db, { clienteId: f.clienteId, empresaId: f.empresaId, ids: [ap.id] });
    assertEqual(r.codigo, 'sin_pieza', 'deberia avisar de que no esta la pieza');
});

// ── Lo que deja de pasarle a un apartado ya enviado ─────────────────────────
test(G, 'un apartado ya enviado no admite mas abonos', async () => {
    // El cobro del saldo (app/api/me/apartados/[id]/confirm) exige
    // `status = 'pending'`. Cerrarlo al enviarlo cierra tambien esa puerta:
    // nadie puede abonarle dinero a un apartado que ya va en una caja.
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });
    const saleId = await ventaDeEnvio(f);
    await cerrarApartadosPorEnvio(db, { ids: [ap.id], clienteId: f.clienteId, empresaId: f.empresaId, saleId });

    const [res] = await sql(
        `UPDATE anticipos SET paid_amount = paid_amount + 10
          WHERE id = ? AND cliente_id = ? AND status = 'pending'
            AND paid_amount + 10 <= total_amount`,
        [ap.id, f.clienteId]);
    assertEqual(res.affectedRows, 0, 'no deberia admitir un abono mas');
});

test(G, 'y el job de vencimientos ya no lo toca', async () => {
    // El job vence apartados `pending` con `paid_amount < total_amount`. Un
    // apartado enviado no es ninguna de las dos cosas, asi que no puede
    // liberarle la reserva a un paquete que esta por salir.
    const f = await seed();
    const ap = await apartar(f, { total: 189, pagado: 189 });
    const saleId = await ventaDeEnvio(f);
    await cerrarApartadosPorEnvio(db, { ids: [ap.id], clienteId: f.clienteId, empresaId: f.empresaId, saleId });
    await sql('UPDATE anticipos SET expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?', [ap.id]);

    const [pendientes] = await sql(
        `SELECT id FROM anticipos
          WHERE status = 'pending' AND revisar_manual = 0 AND expires_at < NOW()
            AND paid_amount < total_amount AND id = ?`,
        [ap.id]);
    assertEqual(pendientes.length, 0, 'el job no deberia verlo');
});
