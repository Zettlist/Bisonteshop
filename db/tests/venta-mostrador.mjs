// La venta de mostrador (y de evento) descuenta el inventario.
//
// Hasta el 16/09 no lo hacia: insertaba la venta y contestaba, y lo vendido en
// un evento seguia apareciendo en la tienda web como disponible. Un cliente
// podia pagar en linea un manga que ya se habia ido.
//
// Se prueba contra un MySQL de verdad porque la regla vive en el UPDATE y en los
// CHECK de la tabla. Y se importa el modulo REAL del POS, no una copia del SQL:
// probar una copia es probar que alguien sabe copiar.
//
// El POS vive en el repo de al lado (TorlanPOS). Esta suite es la de la base
// compartida entre los dos, y los dos repos van siempre uno junto al otro.
import { test, sql, assertEqual, assert, seed, conexionAparte } from './harness.mjs';
import { descontarInventario, avisoDeFaltantes } from '../../../TorlanPOS/backend/utils/inventarioVenta.js';

const G = 'VENTA DE MOSTRADOR';
const unaConexion = { query: (...a) => sql(...a) };

const verStock = async (id) => {
    const [[p]] = await sql('SELECT stock, stock_reservado, stock_disponible FROM products WHERE id = ?', [id]);
    return p;
};

// ── Lo que faltaba ──────────────────────────────────────────────────────────
test(G, 'vender en el mostrador baja la existencia', async () => {
    const f = await seed();
    await sql('UPDATE products SET stock = 9 WHERE id = ?', [f.productId]);

    const faltan = await descontarInventario(unaConexion, f.empresaId, [{ product_id: f.productId, quantity: 3 }]);
    assertEqual(faltan.length, 0, 'alcanza');
    assertEqual((await verStock(f.productId)).stock, 6, 'de nueve quedan seis');
});

// ── Lo que tiene dueño no se vende ──────────────────────────────────────────
test(G, 'una pieza apartada para un pedido web no se vende en el mostrador', async () => {
    // Nueve en el estante, nueve ya pagadas por web. Fisicamente estan ahi;
    // venderlas en un evento dejaria a nueve clientes sin su pedido.
    const f = await seed();
    await sql('UPDATE products SET stock = 9, stock_reservado = 9 WHERE id = ?', [f.productId]);

    const faltan = await descontarInventario(unaConexion, f.empresaId, [{ product_id: f.productId, quantity: 1 }]);
    assertEqual(faltan.length, 1, 'no deja vender');
    assertEqual(faltan[0].quedan, 0, 'y dice que no queda ninguna libre');
    assertEqual((await verStock(f.productId)).stock, 9, 'el stock no se toca');
});

test(G, 'lo libre si se vende aunque haya piezas apartadas', async () => {
    const f = await seed();
    await sql('UPDATE products SET stock = 9, stock_reservado = 6 WHERE id = ?', [f.productId]);

    const faltan = await descontarInventario(unaConexion, f.empresaId, [{ product_id: f.productId, quantity: 3 }]);
    assertEqual(faltan.length, 0, 'las tres libres se venden');
    const p = await verStock(f.productId);
    assertEqual(p.stock, 6, 'quedan seis en el estante');
    assertEqual(p.stock_reservado, 6, 'y siguen apartadas las seis del pedido web');
    assertEqual(p.stock_disponible, 0, 'sin ninguna libre');
});

test(G, 'el aviso dice que producto y cuantas quedan', async () => {
    const f = await seed();
    await sql('UPDATE products SET stock = 2, name = ? WHERE id = ?', ['Chainsaw Man Vol.3', f.productId]);

    const faltan = await descontarInventario(unaConexion, f.empresaId, [{ product_id: f.productId, quantity: 5 }]);
    assertEqual(avisoDeFaltantes(faltan), 'No hay suficiente. "Chainsaw Man Vol.3": solo quedan 2.',
        'con nombre y cantidad, que es lo que necesita quien esta cobrando');
});

// ── Lo que rompe la version ingenua ─────────────────────────────────────────
test(G, 'el mismo producto en dos renglones cuenta una sola vez', async () => {
    const f = await seed();
    await sql('UPDATE products SET stock = 1 WHERE id = ?', [f.productId]);

    const faltan = await descontarInventario(unaConexion, f.empresaId, [
        { product_id: f.productId, quantity: 1 },
        { product_id: f.productId, quantity: 1 },
    ]);
    assertEqual(faltan.length, 1, 'dos piezas no caben en una');
    assertEqual(faltan[0].pedidas, 2, 'y dice que se pedian dos');
});

test(G, 'no descuenta de productos de otra empresa', async () => {
    const mia = await seed();
    const ajena = await seed();
    await sql('UPDATE products SET stock = 5 WHERE id = ?', [ajena.productId]);

    const faltan = await descontarInventario(unaConexion, mia.empresaId, [{ product_id: ajena.productId, quantity: 1 }]);
    assertEqual(faltan.length, 1, 'no se encuentra como vendible');
    assertEqual((await verStock(ajena.productId)).stock, 5, 'y el de la otra empresa sigue intacto');
});

test(G, 'si algo no alcanza, lo que si alcanzaba vuelve al hacer rollback', async () => {
    // Carrito de dos: uno hay, el otro no. La venta entera se cancela, y el que
    // se habia descontado no puede quedarse descontado.
    const f = await seed();
    await sql('UPDATE products SET stock = 5 WHERE id = ?', [f.productId]);
    const [otro] = await sql(
        'INSERT INTO products (empresa_id, name, cost_price, sale_price, stock) VALUES (?,?,?,?,?)',
        [f.empresaId, 'Vagabond Vol.1', 100, 200, 0]);

    const c = await conexionAparte();
    try {
        await c.beginTransaction();
        const faltan = await descontarInventario(c, f.empresaId, [
            { product_id: f.productId, quantity: 2 },
            { product_id: otro.insertId, quantity: 1 },
        ]);
        assertEqual(faltan.length, 1, 'falta el de stock cero');
        await c.rollback();
    } finally {
        await c.end();
    }
    assertEqual((await verStock(f.productId)).stock, 5, 'el que alcanzaba vuelve a cinco');
});

// ── La carrera ──────────────────────────────────────────────────────────────
test(G, 'dos cobros a la vez por la ultima pieza: se cobra uno', async () => {
    // Dos cajas en un evento, el mismo tomo, el mismo segundo.
    const f = await seed();
    await sql('UPDATE products SET stock = 1 WHERE id = ?', [f.productId]);

    const a = await conexionAparte();
    const b = await conexionAparte();
    try {
        await a.beginTransaction();
        await b.beginTransaction();

        const faltanA = await descontarInventario(a, f.empresaId, [{ product_id: f.productId, quantity: 1 }]);
        assertEqual(faltanA.length, 0, 'la primera caja se lo lleva');

        const esperaB = descontarInventario(b, f.empresaId, [{ product_id: f.productId, quantity: 1 }]);
        await a.commit();
        const faltanB = await esperaB;
        assertEqual(faltanB.length, 1, 'la segunda se entera de que ya no hay');
        await b.rollback();
    } finally {
        await a.end();
        await b.end();
    }
    const p = await verStock(f.productId);
    assertEqual(p.stock, 0, 'se vendio una sola vez');
    assert(p.stock >= 0, 'nunca en negativo');
});
