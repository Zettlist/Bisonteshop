import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
const getJwtSecretKey = () => new TextEncoder().encode(process.env.JWT_SECRET || 'bisonte_super_secret_key_123!');

async function getCliente() {
    const cookieStore = await cookies();
    const token = cookieStore.get('bisonte_session')?.value;
    if (!token) return null;
    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey());
        const [rows] = await pool.query('SELECT id, nombre, apellido, email, stripe_customer_id FROM clientes WHERE id = ? LIMIT 1', [payload.id]);
        return rows[0] || null;
    } catch { return null; }
}

// GET — obtener métodos de pago guardados
export async function GET() {
    const cliente = await getCliente();
    if (!cliente) return NextResponse.json({ paymentMethods: [] });
    if (!cliente.stripe_customer_id) return NextResponse.json({ paymentMethods: [] });

    try {
        const pms = await stripe.paymentMethods.list({
            customer: cliente.stripe_customer_id,
            type: 'card',
        });
        return NextResponse.json({
            paymentMethods: pms.data.map(pm => ({
                id: pm.id,
                brand: pm.card.brand,
                last4: pm.card.last4,
                exp_month: pm.card.exp_month,
                exp_year: pm.card.exp_year,
            }))
        });
    } catch (e) {
        return NextResponse.json({ paymentMethods: [] });
    }
}

// POST — crear/obtener Stripe Customer y devolver su ID
export async function POST() {
    const cliente = await getCliente();
    if (!cliente) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

    let customerId = cliente.stripe_customer_id;

    if (!customerId) {
        const customer = await stripe.customers.create({
            email: cliente.email,
            name: `${cliente.nombre} ${cliente.apellido || ''}`.trim(),
            metadata: { bisonte_cliente_id: String(cliente.id) },
        });
        customerId = customer.id;
        await pool.query('UPDATE clientes SET stripe_customer_id = ? WHERE id = ?', [customerId, cliente.id]);
    }

    return NextResponse.json({ success: true, customerId });
}

// DELETE — eliminar método de pago guardado
export async function DELETE(request) {
    const { paymentMethodId } = await request.json();
    if (!paymentMethodId) return NextResponse.json({ success: false }, { status: 400 });
    await stripe.paymentMethods.detach(paymentMethodId);
    return NextResponse.json({ success: true });
}
