import pool from '@/lib/db';
import { NextResponse } from 'next/server';
import { getClienteId } from '@/lib/auth';

// ─────────────────────────────────────────────────────────────────────────────
// El carrito guardado en el servidor, para que siga ahi al cambiar de aparato.
//
// El dueño del carrito sale de la SESION. Antes salia de la peticion: un
// `?userId=` en la URL para leer y un `userId` en el cuerpo para escribir, sin
// mirar la cookie en ningun momento. Cualquiera, sin cuenta siquiera, podia
// pedir el carrito de la persona 5 y ver que estaba a punto de comprar, o
// vaciarselo, o llenarselo, recorriendo los ids de uno en uno.
//
// El navegador sigue mandando el `userId` — no hace falta tocar el cliente —
// pero aqui no se lee. Un identificador que decide de quien son los datos no
// puede venir de quien pregunta.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ success: true, items: [] });

    const [carts] = await pool.query(
      `SELECT id FROM carts WHERE cliente_id = ? AND estado = 'activo' ORDER BY id DESC LIMIT 1`,
      [clienteId]
    );

    if (carts.length === 0) {
      return NextResponse.json({ success: true, items: [] });
    }

    const [rows] = await pool.query(`
      SELECT ci.*, p.name as title, p.sale_price as price, p.image_url
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = ?
    `, [carts[0].id]);

    const items = rows.map(r => ({
      id: r.product_id,
      title: r.title,
      price: r.price,
      image_url: r.image_url,
      quantity: r.quantity,
      type: r.product_type,
      anticipo_percent: r.anticipo_percent
    }));

    return NextResponse.json({ success: true, items });
  } catch (error) {
    // El mensaje de la excepcion se queda en el log. Al cliente iba tal cual, y
    // los errores de mysql2 traen la consulta y los nombres de las columnas.
    console.error('Cart GET Error:', error);
    return NextResponse.json({ success: false, error: 'No se pudo cargar el carrito.' }, { status: 500 });
  }
}

// Un carrito no es una lista de deseos: el tope evita que una peticion suelta
// escriba miles de renglones en la tabla compartida con el POS.
const MAX_RENGLONES = 100;

export async function POST(request) {
  try {
    const clienteId = await getClienteId();
    if (!clienteId) {
      return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
    }

    const { items } = await request.json();
    if (!Array.isArray(items)) {
      return NextResponse.json({ success: false, error: 'Invalid data' }, { status: 400 });
    }
    if (items.length > MAX_RENGLONES) {
      return NextResponse.json({ success: false, error: 'Demasiados productos en el carrito.' }, { status: 400 });
    }

    // Los renglones se acotan aqui: el id tiene que ser un entero y la cantidad
    // cae en 1..99, el mismo rango que aplica priceCart al cobrar. Sin esto se
    // podian guardar cantidades negativas o de un millon.
    const renglones = [];
    for (const i of items) {
      const id = Number(i?.id);
      if (!Number.isInteger(id) || id <= 0) continue;
      const qty = Math.max(1, Math.min(Math.floor(Number(i?.quantity) || 1), 99));
      const tipo = i?.type === 'preventa' ? 'preventa' : 'stock';
      const anticipo = Math.max(0, Math.min(Number(i?.anticipo_percent) || 0, 100));
      renglones.push([null, id, qty, tipo, anticipo]);
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let [carts] = await connection.query(
        `SELECT id FROM carts WHERE cliente_id = ? AND estado = 'activo' ORDER BY id DESC LIMIT 1`,
        [clienteId]
      );

      let cartId;
      if (carts.length === 0) {
        const [result] = await connection.query(
          `INSERT INTO carts (cliente_id, estado) VALUES (?, 'activo')`,
          [clienteId]
        );
        cartId = result.insertId;
      } else {
        cartId = carts[0].id;
        await connection.query(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);
      }

      if (renglones.length > 0) {
        const values = renglones.map(r => [cartId, r[1], r[2], r[3], r[4]]);
        await connection.query(
          `INSERT INTO cart_items (cart_id, product_id, quantity, product_type, anticipo_percent) VALUES ?`,
          [values]
        );
      }

      await connection.commit();
      return NextResponse.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Cart POST Error:', error);
    return NextResponse.json({ success: false, error: 'No se pudo guardar el carrito.' }, { status: 500 });
  }
}
