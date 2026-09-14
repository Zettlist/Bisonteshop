import { NextResponse } from 'next/server';
import { getClienteId } from '@/lib/auth';
import { priceCoupon } from '@/lib/pricing';
import { rateLimit } from '@/lib/rateLimit';
import { ipCliente } from '@/lib/ipCliente';

export async function POST(request) {
  try {
    const { code, subtotal } = await request.json();

    if (!code || typeof code !== 'string' || code.length > 64) {
      return NextResponse.json({ success: false, error: 'Código vacío' }, { status: 400 });
    }

    // Esto es un probador de codigos: contesta si el que mandas existe y cuanto
    // descuenta. Sin freno, se recorre el diccionario entero hasta dar con
    // BIENVENIDO20 o el premio del Mundial. Va por cuenta cuando hay sesion
    // —que es lo que no se falsifica— y por IP cuando no la hay.
    const clienteId = await getClienteId(); // null si no hay sesión
    const quien = clienteId ? `cupon-cliente:${clienteId}` : `cupon-ip:${ipCliente(request)}`;
    const { allowed, retryAfter } = rateLimit(quien, 15, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: `Demasiados códigos seguidos. Espera ${retryAfter} segundos.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const sub = parseFloat(subtotal) || 0;

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
