import pool from '@/lib/db';
import { NextResponse } from 'next/server';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const all = searchParams.get('all') === '1';

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
        GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') as tags
      FROM products p
      LEFT JOIN product_tags pt ON p.id = pt.product_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.empresa_id = ?
        AND (p.is_adult = 0 OR p.is_adult IS NULL)
        ${!all ? `AND p.category NOT LIKE '%Figura%'
        AND p.category NOT LIKE '%Calendario%'
        AND p.category NOT LIKE '%Accesorio%'` : ''}
      GROUP BY p.id
      ORDER BY p.id DESC
    `, [EMPRESA_ID]);

    const mangas = rows.map(p => ({
      ...p,
      tags: p.tags ? p.tags.split(',') : [],
      events: p.events ? (typeof p.events === 'string' ? JSON.parse(p.events) : p.events) : null,
    }));

    return NextResponse.json(
      { success: true, mangas, empresa_id: EMPRESA_ID },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (error) {
    console.error('Error fetching mangas:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
