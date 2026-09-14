/**
 * Busca pagos cobrados dos veces, o abonados dos veces.
 *
 * La base sola no basta para contestarlo: puede ser coherente consigo misma y
 * aun asi no cuadrar con lo que Stripe cobro. Asi que la ultima seccion compara
 * cada recarga con su cargo real en Stripe.
 *
 * Solo lee. Uso: node scripts/auditar-pagos.mjs
 * Necesita el tunel a la base y las llaves de Stripe en .env.local.
 */
import Stripe from 'stripe';
import mysql from 'mysql2/promise';
process.loadEnvFile('.env.local');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
const q = async (sql, p = []) => (await db.query(sql, p))[0];

let mal = 0;
const bien = (m) => console.log(`  ok    ${m}`);
const falla = (m, filas) => { mal++; console.log(`  FALLA ${m}`); if (filas?.length) console.table(filas.slice(0, 10)); };

console.log('\n── Duplicados directos ─────────────────────────────────────────');

const dupTopups = await q(`SELECT payment_intent_id, COUNT(*) n, SUM(amount) suma
                             FROM credit_topups GROUP BY payment_intent_id HAVING n > 1`);
dupTopups.length ? falla('hay recargas repetidas para el mismo cobro', dupTopups)
                 : bien(`ningun cobro aparece dos veces en credit_topups (${(await q('SELECT COUNT(*) n FROM credit_topups'))[0].n} recargas)`);

const dupPedidos = await q(`SELECT payment_intent_id, COUNT(*) n
                              FROM bisonte_orders GROUP BY payment_intent_id HAVING n > 1`);
dupPedidos.length ? falla('hay pedidos repetidos para el mismo pago', dupPedidos)
                  : bien(`ningun pago aparece dos veces en bisonte_orders (${(await q('SELECT COUNT(*) n FROM bisonte_orders'))[0].n} pedidos)`);

// El UNIQUE es lo que IMPIDE el duplicado; sin el, lo de arriba es suerte.
for (const [tabla, col] of [['credit_topups', 'payment_intent_id'], ['bisonte_orders', 'payment_intent_id']]) {
    const idx = await q(`SHOW INDEX FROM ${tabla} WHERE Column_name = ? AND Non_unique = 0`, [col]);
    idx.length ? bien(`${tabla}.${col} tiene UNIQUE: el duplicado es imposible, no improbable`)
               : falla(`${tabla}.${col} NO tiene UNIQUE`);
}

console.log('\n── Cada movimiento de saldo, una sola vez ──────────────────────');

const recargas = await q('SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM credit_topups');
const movRecarga = await q(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM credit_history
                             WHERE amount > 0 AND description LIKE 'Recarga de saldo%'`);
Number(recargas[0].n) === Number(movRecarga[0].n) && Number(recargas[0].s) === Number(movRecarga[0].s)
    ? bien(`${recargas[0].n} recargas = ${movRecarga[0].n} abonos, $${recargas[0].s} = $${movRecarga[0].s}`)
    : falla(`recargas y abonos no cuadran: ${recargas[0].n}/$${recargas[0].s} contra ${movRecarga[0].n}/$${movRecarga[0].s}`);

const gastoDoble = await q(`SELECT o.sale_id, o.credito_aplicado, COUNT(h.id) movimientos
                              FROM bisonte_orders o
                              JOIN credit_history h ON h.description = CONCAT('Saldo aplicado al pedido #', o.sale_id)
                             WHERE o.credito_aplicado > 0
                             GROUP BY o.sale_id, o.credito_aplicado HAVING movimientos > 1`);
gastoDoble.length ? falla('un pedido descuento saldo mas de una vez', gastoDoble)
                  : bien('ningun pedido descuento saldo dos veces');

const devolucionDoble = await q(`SELECT o.sale_id, COUNT(h.id) movimientos
                                   FROM bisonte_orders o
                                   JOIN credit_history h ON h.description LIKE CONCAT('Saldo devuelto: pedido #', o.sale_id, ' %')
                                  GROUP BY o.sale_id HAVING movimientos > 1`);
devolucionDoble.length ? falla('un pedido devolvio saldo mas de una vez', devolucionDoble)
                       : bien('ningun pedido devolvio saldo dos veces');

const vivoConDevolucion = await q(`SELECT o.sale_id, o.pago_estado FROM bisonte_orders o
                                    WHERE o.pago_estado IN ('autorizado','capturado')
                                      AND EXISTS (SELECT 1 FROM credit_history h
                                                   WHERE h.description LIKE CONCAT('Saldo devuelto: pedido #', o.sale_id, ' %'))`);
vivoConDevolucion.length ? falla('un pedido vivo tiene el saldo devuelto: el cliente se lo quedo y la mercancia tambien', vivoConDevolucion)
                         : bien('solo los pedidos cancelados o reembolsados devolvieron saldo');

console.log('\n── El saldo contra su historial ────────────────────────────────');
const descuadre = await q(`SELECT c.id, c.store_credit, COALESCE(SUM(h.amount),0) historial
                             FROM clientes c LEFT JOIN credit_history h ON h.cliente_id = c.id
                            GROUP BY c.id, c.store_credit
                           HAVING ABS(c.store_credit - COALESCE(SUM(h.amount),0)) > 0.001`);
descuadre.length ? falla('el saldo no coincide con la suma de sus movimientos', descuadre)
                 : bien('cada saldo es exactamente la suma de sus movimientos');

console.log('\n── Contra Stripe (la fuente de verdad del dinero) ──────────────');
const todas = await q(`SELECT payment_intent_id, cliente_id, amount, charged_amount, currency
                         FROM credit_topups ORDER BY id DESC`);
let cotejadas = 0, ausentes = 0;
const problemas = [];
for (const t of todas) {
    let pi;
    try { pi = await stripe.paymentIntents.retrieve(t.payment_intent_id); }
    catch { ausentes++; continue; }   // recargas viejas o de otro entorno
    cotejadas++;
    if (pi.status !== 'succeeded') problemas.push({ pi: t.payment_intent_id, motivo: `abonada pero Stripe dice "${pi.status}"` });
    const cobradoMXN = Number(pi.metadata?.creditMXN);
    if (Number.isFinite(cobradoMXN) && Math.abs(cobradoMXN - Number(t.amount)) > 0.001)
        problemas.push({ pi: t.payment_intent_id, motivo: `abonado $${t.amount}, Stripe dice $${cobradoMXN}` });
    // Los cargos se PIDEN aparte: desde 2022-11-15 el PaymentIntent ya no los
    // trae, y `pi.charges?.data` era undefined -- la comprobacion no llegaba a
    // correr nunca. Un cobro puede acumular varios cargos si la tarjeta se
    // reintento; pagado sin devolver solo debe haber uno, y si hay dos el
    // cliente pago dos veces lo mismo.
    const { data: cargos } = await stripe.charges.list({ payment_intent: t.payment_intent_id, limit: 10 });
    const pagados = cargos.filter(c => c.paid && !c.refunded);
    if (pagados.length > 1)
        problemas.push({ pi: t.payment_intent_id, motivo: `${pagados.length} cargos pagados en el mismo cobro` });
    const totalCobrado = pagados.reduce((s, c) => s + c.amount, 0) / 100;
    const esperado = Number(t.charged_amount);
    if (pagados.length && Math.abs(totalCobrado - esperado) > 0.011)
        problemas.push({ pi: t.payment_intent_id, motivo: `la tarjeta pago $${totalCobrado.toFixed(2)}, la base anoto $${esperado.toFixed(2)}` });
}
problemas.length ? falla(`Stripe no coincide con la base en ${problemas.length} recargas`, problemas)
                 : bien(`${cotejadas} recargas cotejadas contra Stripe, todas cuadran${ausentes ? ` (${ausentes} no existen en este entorno, se saltan)` : ''}`);

console.log(`\n${mal ? `${mal} PROBLEMA(S)` : 'Sin pagos duplicados.'}\n`);
await db.end();
process.exit(mal ? 1 : 0);
