import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { key } = await request.json();
  if (key !== process.env.CAPTURE_API_KEY) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    await pool.query(
      "ALTER TABLE bisonte_orders MODIFY COLUMN status ENUM('pending','captured','cancelled','refunded') NOT NULL DEFAULT 'pending'"
    );
    return NextResponse.json({ success: true, message: 'Migration OK' });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
