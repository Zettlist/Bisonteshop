import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';

async function ensureHistoryTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS credit_history (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            cliente_id  INT NOT NULL,
            amount      DECIMAL(10,2) NOT NULL,
            description VARCHAR(300),
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_cliente (cliente_id)
        )
    `);
}

export async function GET() {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ balance: 0, history: [] });

    await ensureHistoryTable();

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
