import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';

const addCol = async (col, def) => {
    try { await pool.query(`ALTER TABLE user_notifications ADD COLUMN ${col} ${def}`); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
};

async function ensureTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_notifications (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            cliente_id  INT NOT NULL,
            type        VARCHAR(50) DEFAULT 'info',
            title       VARCHAR(200) NOT NULL,
            body        VARCHAR(500),
            read_at     TIMESTAMP NULL DEFAULT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_cliente (cliente_id)
        )
    `);
    await addCol('ref_id', 'VARCHAR(100) NULL');
}

// Config por estado — usa los valores de bisonte_orders.estado
const STATUS_CFG = {
    pendiente:  {
        type:  'order_pendiente',
        title: 'Pedido recibido',
        body:  'Hemos recibido tu pedido y está siendo verificado.',
    },
    confirmado: {
        type:  'order_confirmado',
        title: 'Stock confirmado',
        body:  'Confirmamos existencia de tu pedido. Ya se está preparando para envío.',
    },
    envio: {
        type:  'order_envio',
        title: 'Pedido en camino',
        body:  'Tu pedido fue enviado con la paquetería. Revisa tu número de guía.',
    },
    entregado: {
        type:  'order_entregado',
        title: 'Pedido entregado',
        body:  '¡Tu pedido fue entregado! Esperamos que lo disfrutes.',
    },
    reclamo: {
        type:  'order_reclamo',
        title: 'Actualización en tu pedido',
        body:  'Hay una novedad en tu pedido. Contáctanos a soporte@bisontemanga.com',
    },
    cancelado: {
        type:  'order_cancelado',
        title: 'Pedido cancelado',
        body:  'Tu pedido fue cancelado. Si tienes dudas escríbenos a soporte@bisontemanga.com',
    },
};

// Sync order notifications — one per (order, status) combination
async function syncOrderNotifications(clienteId) {
    // El vinculo con el cliente y el estado del pedido viven en
    // bisonte_orders, no en sales: la consulta anterior pedia s.web_status y
    // s.cliente_id, columnas que no existen, y la ruta respondia 500 siempre.
    const [orders] = await pool.query(
        `SELECT bo.sale_id AS id, bo.estado, bo.created_at
         FROM bisonte_orders bo
         WHERE bo.cliente_id = ?
         ORDER BY bo.created_at DESC
         LIMIT 50`,
        [clienteId]
    );

    for (const order of orders) {
        const cfg = STATUS_CFG[order.estado];
        if (!cfg) continue;

        const refId = `order_${order.id}_${order.estado}`;

        // El "pendiente" inicial conserva la fecha del pedido; el resto se
        // marca con la hora en que se detecta el cambio.
        const createdAt = order.estado === 'pendiente' ? order.created_at : undefined;

        if (createdAt !== undefined) {
            await pool.query(
                `INSERT IGNORE INTO user_notifications (cliente_id, type, title, body, ref_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [clienteId, cfg.type, `${cfg.title} #${order.id}`, cfg.body, refId, createdAt]
            );
        } else {
            await pool.query(
                `INSERT IGNORE INTO user_notifications (cliente_id, type, title, body, ref_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [clienteId, cfg.type, `${cfg.title} #${order.id}`, cfg.body, refId]
            );
        }
    }
}

// GET — list notifications
export async function GET() {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ notifications: [], unread: 0 });

    await ensureTable();
    await syncOrderNotifications(clienteId);

    const [rows] = await pool.query(
        'SELECT id, type, title, body, read_at, created_at FROM user_notifications WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 50',
        [clienteId]
    );

    const unread = rows.filter(n => !n.read_at).length;
    return NextResponse.json({ notifications: rows, unread });
}

// PUT — mark as read (single id or all)
export async function PUT(req) {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ success: false }, { status: 401 });

    const { id, all } = await req.json();

    if (all) {
        await pool.query(
            'UPDATE user_notifications SET read_at = NOW() WHERE cliente_id = ? AND read_at IS NULL',
            [clienteId]
        );
    } else if (id) {
        await pool.query(
            'UPDATE user_notifications SET read_at = NOW() WHERE id = ? AND cliente_id = ?',
            [id, clienteId]
        );
    }

    return NextResponse.json({ success: true });
}
