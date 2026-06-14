import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { key } = await request.json();
  if (key !== process.env.CAPTURE_API_KEY) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const results = {};
  const run = async (name, sql) => {
    try {
      await pool.query(sql);
      results[name] = 'OK';
    } catch (err) {
      results[name] = err.message.includes('Duplicate column') ? 'already exists' : err.message;
    }
  };

  await run('shipping_method',    "ALTER TABLE sales ADD COLUMN shipping_method VARCHAR(20) NOT NULL DEFAULT 'bisonte' AFTER surcharge");
  await run('envia_quote_data',   "ALTER TABLE sales ADD COLUMN envia_quote_data JSON NULL AFTER shipping_method");
  await run('envia_label_data',   "ALTER TABLE sales ADD COLUMN envia_label_data JSON NULL AFTER envia_quote_data");
  await run('shipping_address_json', "ALTER TABLE sales ADD COLUMN shipping_address_json JSON NULL AFTER envia_label_data");

  return NextResponse.json({ success: true, results });
}
