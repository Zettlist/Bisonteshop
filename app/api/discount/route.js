import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function POST(request) {
  try {
    const { code, subtotal } = await request.json();

    if (!code) {
      return NextResponse.json({ success: false, error: 'Código vacío' }, { status: 400 });
    }

    const empresaId = process.env.EMPRESA_ID || null;

    const [rows] = await pool.query(
      `SELECT * FROM coupons
       WHERE code = ?
         AND status = 'active'
         AND (empresa_id = ? OR empresa_id IS NULL)
         AND (expiration_date IS NULL OR expiration_date > NOW())
         AND (usage_limit IS NULL OR usage_count < usage_limit)
       LIMIT 1`,
      [code.toUpperCase(), empresaId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Código inválido, expirado o agotado' }, { status: 404 });
    }

    const coupon = rows[0];
    const sub = parseFloat(subtotal) || 0;

    let discountAmount;
    if (coupon.discount_type === 'percentage') {
      discountAmount = parseFloat(((sub * parseFloat(coupon.discount_value)) / 100).toFixed(2));
    } else {
      discountAmount = parseFloat(parseFloat(coupon.discount_value).toFixed(2));
    }

    // Que el descuento no supere el subtotal
    discountAmount = Math.min(discountAmount, sub);

    return NextResponse.json({
      success: true,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: parseFloat(coupon.discount_value),
      discount_amount: discountAmount,
    });

  } catch (error) {
    console.error('Discount API Error:', error);
    return NextResponse.json({ success: false, error: 'Error al procesar descuento' }, { status: 500 });
  }
}
