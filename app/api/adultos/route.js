import pool from '@/lib/db';
import { NextResponse } from 'next/server';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

export async function GET() {
  try {
    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.name as title,
        p.sale_price as price,
        p.stock,
        p.category,
        p.gender,
        p.barcode,
        p.isbn,
        p.publication_date,
        p.publisher,
        p.page_count as pages,
        p.dimensions,
        p.weight,
        p.language,
        p.artist,
        p.group_name,
        p.image_url,
        p.is_adult,
        p.events,
        p.sinopsis,
        p.rating,
        p.rating_count,
        GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') as tags,
        -- Subconsulta, no JOIN: la query ya multiplica filas por cada tag y
        -- un SUM() aqui contaria cada venta una vez por etiqueta.
        (SELECT COALESCE(SUM(si.quantity), 0)
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND s.empresa_id = p.empresa_id) AS vendidos
      FROM products p
      LEFT JOIN product_tags pt ON p.id = pt.product_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.empresa_id = ?
        AND p.is_adult = 1
      GROUP BY p.id
      ORDER BY p.id DESC
    `, [EMPRESA_ID]);

    const products = rows.map(p => ({
      ...p,
      tags: p.tags ? p.tags.split(',') : [],
      vendidos: Number(p.vendidos) || 0,
      events: p.events ? (typeof p.events === 'string' ? JSON.parse(p.events) : p.events) : null,
    }));

    return NextResponse.json(
      { success: true, products },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (error) {
    console.error('Error fetching adult products:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
