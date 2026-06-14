import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

async function getCliente() {
    const session = await getSession();
    if (!session?.id) return null;
    const [rows] = await pool.query(
        'SELECT id, nombre, apellido, email, stripe_customer_id FROM clientes WHERE id = ? LIMIT 1',
        [session.id]
    );
    return rows[0] || null;
}

// GET — obtener métodos de pago guardados
export async function GET() {
    const cliente = await getCliente();
    if (!cliente) return NextResponse.json({ paymentMethods: [] });
    if (!cliente.stripe_customer_id) return NextResponse.json({ paymentMethods: [] });

    try {
        const pms = await getStripe().paymentMethods.list({
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
        const customer = await getStripe().customers.create({
            email: cliente.email,
            name: `${cliente.nombre} ${cliente.apellido || ''}`.trim(),
            metadata: { bisonte_cliente_id: String(cliente.id) },
        });
        customerId = customer.id;
        await pool.query('UPDATE clientes SET stripe_customer_id = ? WHERE id = ?', [customerId, cliente.id]);
    }

    return NextResponse.json({ success: true, customerId });
}

// DELETE — eliminar método de pago guardado (solo si pertenece al cliente autenticado)
export async function DELETE(request) {
    const cliente = await getCliente();
    if (!cliente) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
    if (!cliente.stripe_customer_id) return NextResponse.json({ success: false, error: 'Sin métodos de pago' }, { status: 404 });

    const { paymentMethodId } = await request.json();
    if (!paymentMethodId) return NextResponse.json({ success: false, error: 'paymentMethodId requerido' }, { status: 400 });

    const stripe = getStripe();

    // Verificar que el método de pago realmente pertenece a este cliente antes de borrar.
    let pm;
    try {
        pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch {
        return NextResponse.json({ success: false, error: 'Método de pago no encontrado' }, { status: 404 });
    }
    if (pm.customer !== cliente.stripe_customer_id) {
        return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 403 });
    }

    await stripe.paymentMethods.detach(paymentMethodId);
    return NextResponse.json({ success: true });
}
