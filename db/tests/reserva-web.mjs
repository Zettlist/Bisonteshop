// Reserva de inventario de los pedidos web.
//
// El POS lleva tiempo con este comentario: "La tienda reserva al confirmar el
// checkout (stock_reservado += cantidad)". No era verdad -- nadie escribia esa
// columna en toda la tienda -- y con nueve piezas entraban nueve pedidos, y el
// decimo, y el undecimo, todos con la tarjeta ya autorizada.
//
// Estas pruebas corren contra un MySQL de verdad porque lo que se comprueba no
// es el JavaScript: es que el UPDATE condicional y el CHECK de la tabla se
// comporten como se dice que se comportan cuando dos pedidos llegan a la vez.
import { test, sql, expectError, assert, assertEqual, seed, conexionAparte } from './harness.mjs';
// .mjs y no .js: el package.json de la tienda no declara "type": "module", asi
// que Node leeria un lib/reserva.js como CommonJS y este import reventaria. La
// alternativa era copiar la logica aqui, que es probar una copia y no el codigo.
import { reservarStock } from '../../lib/reserva.mjs';

const G = 'RESERVA WEB';

// `reservarStock` espera algo con .query(): la conexion de una transaccion. El
// `sql` del arnes ya es eso mismo envuelto.
const unaConexion = { query: (...a) => sql(...a) };

/** Lo que priceCart() devuelve por renglon, en lo que a la reserva le importa. */
const renglon = (id, quantity, extra = {}) =>
    ({ id, name: 'Berserk Vol.1', quantity, esPreventa: false, ...extra });

const verStock = async (id) => {
    const [[p]] = await sql('SELECT stock, stock_reservado, stock_disponible FROM products WHERE id = ?', [id]);
    return p;
};

// ── El caso que pidio la tienda, tal cual ───────────────────────────────────
test(G, 'nueve piezas aceptan nueve pedidos y rechazan el decimo', async () => {
    const f = await seed();
    await sql('UPDATE products SET stock = 9 WHERE id = ?', [f.productId]);

    for (let i = 1; i <= 9; i++) {
        const faltan = await reservarStock(unaConexion, [renglon(f.productId, 1)]);
        assertEqual(faltan.length, 0, `el pedido ${i} deberia entrar`);
    }

    const p = await verStock(f.productId);
    assertEqual(p.stock, 9, 'el stock fisico no se toca al apartar');
    assertEqual(p.stock_reservado, 9, 'las nueve piezas quedan apartadas');
    assertEqual(p.stock_disponible, 0, 'no queda nada libre');

    const faltan = await reservarStock(unaConexion, [renglon(f.productId, 1)]);
    assertEqual(faltan.length, 1, 'el decimo pedido no deberia entrar');
    assertEqual(faltan[0].id, f.productId, 'y tiene que decir cual falto');
});

test(G, 'dice cual falto y cuanto se pedia, no solo que fallo', async () => {
    // El aviso acaba en la pantalla del cliente y en el correo del mostrador.
    // "No hay existencias" no dice de que, y con un carrito de ocho renglones
    // eso es mandar a alguien a adivinar.
    const f = await seed();
    await sql('UPDATE products SET stock = 1 WHERE id = ?', [f.productId]);

    // El nombre viaja en el renglon, y el renglon lo arma priceCart leyendo
    // `products.name`. O sea: sale de la base, no del navegador -- que es de
    // donde vendria si se copiara del carrito, y ahi lo escribe cualquiera.
    const faltan = await reservarStock(unaConexion, [
        renglon(f.productId, 4, { name: 'Chainsaw Man Vol.3' }),
    ]);
    assertEqual(faltan.length, 1, 'no alcanza');
    assertEqual(faltan[0].name, 'Chainsaw Man Vol.3', 'con el nombre del articulo');
    assertEqual(faltan[0].pedido, 4, 'y cuantas se pedian');
});

test(G, 'de un carrito mixto solo falta el que no alcanza', async () => {
    const f = await seed();
    const [otro] = await sql(
        'INSERT INTO products (empresa_id, name, cost_price, sale_price, stock) VALUES (?,?,?,?,?)',
        [f.empresaId, 'Vagabond Vol.1', 100, 200, 0]);

    const faltan = await reservarStock(unaConexion, [
        renglon(f.productId, 1),
        renglon(otro.insertId, 1),
    ]);
    assertEqual(faltan.length, 1, 'solo falta el que no tiene stock');
    assertEqual(faltan[0].id, otro.insertId, 'y es el de stock cero');
});

// ── Lo que rompia la version ingenua ────────────────────────────────────────
test(G, 'el mismo producto dos veces en el carrito cuenta una sola vez', async () => {
    // Un carrito puede traer el mismo id en dos renglones. Sin agrupar, el
    // segundo UPDATE se evaluaria contra el contador que acaba de subir el
    // primero: dos comprobaciones de 1 pieza pasan donde una de 2 no cabe.
    const f = await seed();
    await sql('UPDATE products SET stock = 1 WHERE id = ?', [f.productId]);

    const faltan = await reservarStock(unaConexion, [
        renglon(f.productId, 1),
        renglon(f.productId, 1),
    ]);
    assertEqual(faltan.length, 1, 'dos piezas no caben en una');
    assertEqual(faltan[0].pedido, 2, 'y el aviso dice que se pedian dos');
    assertEqual((await verStock(f.productId)).stock_reservado, 0, 'no aparta ninguna');
});

test(G, 'la preventa no pasa por este contador', async () => {
    // Una preventa tiene stock = 0 y lo que la limita es `preventa_disponible`,
    // que lleva el POS desde pre_orders al llegar el pedido del proveedor.
    // Apartarla aqui descuadraria ese arribo.
    const f = await seed();
    await sql(
        "UPDATE products SET stock = 0, estado = 'preventa', preventa_cantidad = 5 WHERE id = ?",
        [f.productId]);

    const faltan = await reservarStock(unaConexion, [renglon(f.productId, 3, { esPreventa: true })]);
    assertEqual(faltan.length, 0, 'no la rechaza');
    assertEqual((await verStock(f.productId)).stock_reservado, 0, 'y tampoco la aparta');
});

// ── La carrera, con dos transacciones de verdad ─────────────────────────────
test(G, 'dos pedidos simultaneos por la ultima pieza: entra uno', async () => {
    // Esta es la razon de que la condicion viaje DENTRO del UPDATE. Leer y
    // despues escribir deja una ventana entre las dos cosas, y dos clientes que
    // leen "queda 1" a la vez leen los dos que si.
    //
    // Las dos transacciones se abren antes de que ninguna escriba, que es lo
    // que hace que sea una carrera y no dos operaciones en fila.
    const f = await seed();
    await sql('UPDATE products SET stock = 1 WHERE id = ?', [f.productId]);

    const a = await conexionAparte();
    const b = await conexionAparte();
    try {
        await a.beginTransaction();
        await b.beginTransaction();

        const faltanA = await reservarStock(a, [renglon(f.productId, 1)]);
        assertEqual(faltanA.length, 0, 'el primero en llegar se la lleva');

        // B se queda esperando el candado de fila de A hasta que A haga commit,
        // y entonces reevalua la condicion contra el contador ya subido.
        const esperaB = reservarStock(b, [renglon(f.productId, 1)]);
        await a.commit();
        const faltanB = await esperaB;

        assertEqual(faltanB.length, 1, 'el segundo se queda sin ella');
        await b.commit();
    } finally {
        await a.end();
        await b.end();
    }

    assertEqual((await verStock(f.productId)).stock_reservado, 1, 'una sola pieza apartada');
});

// ── La red de abajo ─────────────────────────────────────────────────────────
test(G, 'la base rechaza la sobreventa aunque el codigo se equivoque', async () => {
    // El UPDATE condicional es el trato amable: devuelve una lista de nombres
    // que se le puede ensenar a alguien. El CHECK es lo que queda si alguien
    // escribe la columna por otro camino -- un script, una consola, una ruta
    // nueva que no sepa de lib/reserva.js.
    const f = await seed();
    await sql('UPDATE products SET stock = 2 WHERE id = ?', [f.productId]);
    await expectError(
        () => sql('UPDATE products SET stock_reservado = 3 WHERE id = ?', [f.productId]),
        'ER_CHECK_CONSTRAINT_VIOLATED');
});

test(G, 'liberar lo apartado devuelve las piezas al catalogo', async () => {
    // Es lo que hace el POS al cancelar (releaseReservation). Si no ocurriera,
    // un pedido muerto se quedaria con piezas apartadas para siempre, invisibles
    // para todos los demas.
    const f = await seed();
    await sql('UPDATE products SET stock = 3 WHERE id = ?', [f.productId]);
    await reservarStock(unaConexion, [renglon(f.productId, 3)]);
    assertEqual((await verStock(f.productId)).stock_disponible, 0, 'nada libre');

    await sql('UPDATE products SET stock_reservado = GREATEST(0, stock_reservado - 3) WHERE id = ?',
        [f.productId]);
    const p = await verStock(f.productId);
    assertEqual(p.stock_disponible, 3, 'vuelven las tres');
    assertEqual(p.stock, 3, 'y el stock fisico nunca se movio');
});

// ── Que el catalogo mire la columna correcta ────────────────────────────────
test(G, 'el catalogo deja de anunciar lo que ya tiene dueno', async () => {
    // Sin esto la tarjeta decia "9 disponibles" con las nueve ya vendidas: las
    // consultas del catalogo pedian `p.stock`, que es la existencia fisica y no
    // descuenta nada. El cliente se enteraba al pagar.
    const f = await seed();
    await sql('UPDATE products SET stock = 9 WHERE id = ?', [f.productId]);
    await reservarStock(unaConexion, [renglon(f.productId, 9)]);

    const [[p]] = await sql(
        'SELECT stock, stock_disponible FROM products WHERE id = ? AND es_prueba = 0', [f.productId]);
    assertEqual(p.stock, 9, 'en el almacen siguen las nueve');
    assertEqual(p.stock_disponible, 0, 'pero en la vitrina no queda ninguna');
    assert(p.stock_disponible !== p.stock, 'las dos columnas tienen que poder discrepar');
});
