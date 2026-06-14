import { NextResponse } from 'next/server';
import { getClienteId } from '@/lib/auth';
import { priceCoupon } from '@/lib/pricing';

export async function POST(request) {
  try {
    const { code, subtotal } = await request.json();

    if (!code) {
      return NextResponse.json({ success: false, error: 'Código vacío' }, { status: 400 });
    }

    const sub = parseFloat(subtotal) || 0;
    const clienteId = await getClienteId(); // null si no hay sesión

    // Misma validación que el checkout (incluye límite por usuario), una sola fuente de verdad.
    const { coupon, amount, error } = await priceCoupon(code, sub, clienteId);
    if (!coupon) {
      return NextResponse.json({ success: false, error: error || 'Código inválido, expirado o agotado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: parseFloat(coupon.discount_value),
      discount_amount: amount,
      discountAmount: amount, // el checkout lee camelCase
    });

  } catch (error) {
    console.error('Discount API Error:', error);
    return NextResponse.json({ success: false, error: 'Error al procesar descuento' }, { status: 500 });
  }
}
