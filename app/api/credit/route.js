import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';

// `credit_history` se creaba aqui en cada GET. Vive en db/schema.sql. La app no
// crea tablas.

export async function GET() {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ balance: 0, history: [] });


    const [clienteRows] = await pool.query(
        'SELECT store_credit FROM clientes WHERE id = ? LIMIT 1',
        [clienteId]
    );
    const balance = clienteRows.length ? Number(clienteRows[0].store_credit || 0) : 0;

    const [history] = await pool.query(
        'SELECT id, amount, description, created_at FROM credit_history WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 50',
        [clienteId]
    );

    return NextResponse.json({ balance, history });
}
