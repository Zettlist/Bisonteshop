import pool from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 });

    const [carts] = await pool.query(
      `SELECT id FROM carts WHERE cliente_id = ? AND estado = 'activo' ORDER BY id DESC LIMIT 1`, 
      [userId]
    );

    if (carts.length === 0) {
      return NextResponse.json({ success: true, items: [] });
    }

    const cartId = carts[0].id;
    const [rows] = await pool.query(`
      SELECT ci.*, p.name as title, p.sale_price as price, p.image_url
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = ?
    `, [cartId]);

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
    console.error('Cart GET Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { userId, items } = data;

    if (!userId || !Array.isArray(items)) {
      return NextResponse.json({ success: false, error: 'Invalid data' }, { status: 400 });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Find or create active cart
      let [carts] = await connection.query(
        `SELECT id FROM carts WHERE cliente_id = ? AND estado = 'activo' ORDER BY id DESC LIMIT 1`,
        [userId]
      );
      
      let cartId;
      if (carts.length === 0) {
        const [result] = await connection.query(
          `INSERT INTO carts (cliente_id, estado) VALUES (?, 'activo')`,
          [userId]
        );
        cartId = result.insertId;
      } else {
        cartId = carts[0].id;
        // Delete old items
        await connection.query(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);
      }

      // Insert new items
      if (items.length > 0) {
        const values = items.map(i => [
          cartId, 
          i.id, 
          i.quantity, 
          i.type || 'stock', 
          i.anticipo_percent || 0
        ]);
        await connection.query(
          `INSERT INTO cart_items (cart_id, product_id, quantity, product_type, anticipo_percent) VALUES ?`,
          [values]
        );
      }

      await connection.commit();
      connection.release();

      return NextResponse.json({ success: true });
    } catch (err) {
      await connection.rollback();
      connection.release();
      throw err;
    }
  } catch (error) {
    console.error('Cart POST Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
