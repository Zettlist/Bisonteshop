import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getClienteId } from '@/lib/auth';
import { isValidText, isValidOptionalText, firstError } from '@/lib/validate';

// Aqui vivia un ensureTable() que en CADA peticion creaba `user_addresses` y le
// anadia once columnas con ALTER TABLE. Se ha quitado: la tabla esta en
// db/schema.sql, completa y con mas de lo que este codigo ponia (clave foranea
// a clientes, NOT NULL donde toca, indice por (cliente_id, is_default)).
//
// Ademas creaba la version pobre -- solo id, cliente_id e is_default -- y luego
// la parcheaba a golpe de ALTER. La columna `numero` que intentaba ablandar no
// existe en el esquema actual.
//
// El esquema se aplica desde db/schema.sql y los cambios van en db/migrations/.
// La app no crea ni altera tablas: con permisos por tabla no podria, y ese es
// justamente el punto.

// GET — todas las direcciones del usuario
export async function GET() {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ addresses: [] });

    try {

        const [rows] = await pool.query(
            'SELECT * FROM user_addresses WHERE cliente_id = ? ORDER BY is_default DESC, created_at DESC',
            [clienteId]
        );

        return NextResponse.json({ addresses: rows });
    } catch (err) {
        console.error('[Addresses GET]', err.message);
        // Fallback: skip ensureTable and query directly
        try {
            const [rows] = await pool.query(
                'SELECT * FROM user_addresses WHERE cliente_id = ? ORDER BY is_default DESC, created_at DESC',
                [clienteId]
            );
            return NextResponse.json({ addresses: rows });
        } catch (err2) {
            console.error('[Addresses GET fallback]', err2.message);
            return NextResponse.json({ addresses: [] });
        }
    }
}

// POST — agregar nueva dirección
export async function POST(request) {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });


    const { nombre_recibe, calle, numero_ext, numero_int, colonia, cp, municipio, estado, referencias } = await request.json();

    const err = firstError([
        [isValidText(calle, { min: 1, max: 300 }), 'Calle requerida (máx. 300 caracteres)'],
        [isValidOptionalText(nombre_recibe, { max: 200 }), 'Nombre de quien recibe inválido'],
        [isValidOptionalText(numero_ext, { max: 30 }), 'Número exterior inválido'],
        [isValidOptionalText(numero_int, { max: 30 }), 'Número interior inválido'],
        [isValidOptionalText(colonia, { max: 200 }), 'Colonia inválida'],
        [isValidOptionalText(municipio, { max: 200 }), 'Municipio inválido'],
        [isValidOptionalText(estado, { max: 100 }), 'Estado inválido'],
        [isValidOptionalText(cp, { max: 10 }), 'Código postal inválido'],
        [isValidOptionalText(referencias, { max: 500 }), 'Referencias demasiado largas'],
    ]);
    if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });

    // Check if user has any address — first one becomes principal
    const [existing] = await pool.query(
        'SELECT COUNT(*) as cnt FROM user_addresses WHERE cliente_id = ?',
        [clienteId]
    );
    const isFirst = existing[0].cnt === 0;

    const [result] = await pool.query(
        `INSERT INTO user_addresses (cliente_id, nombre_recibe, calle, numero_ext, numero_int, colonia, municipio, estado, cp, referencias, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clienteId, nombre_recibe || null, calle, numero_ext || null, numero_int || null,
         colonia || null, municipio || null, estado || null, cp || null, referencias || null, isFirst ? 1 : 0]
    );

    const [rows] = await pool.query('SELECT * FROM user_addresses WHERE id = ?', [result.insertId]);
    return NextResponse.json({ success: true, address: rows[0] });
}

// PUT — establecer como principal
export async function PUT(request) {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 });

    // Unset all, then set this one
    await pool.query('UPDATE user_addresses SET is_default = 0 WHERE cliente_id = ?', [clienteId]);
    await pool.query('UPDATE user_addresses SET is_default = 1 WHERE id = ? AND cliente_id = ?', [id, clienteId]);

    return NextResponse.json({ success: true });
}

// DELETE — eliminar dirección
export async function DELETE(request) {
    const clienteId = await getClienteId();
    if (!clienteId) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 });

    await pool.query('DELETE FROM user_addresses WHERE id = ? AND cliente_id = ?', [id, clienteId]);

    // If deleted address was default, set most recent as default
    const [remaining] = await pool.query(
        'SELECT id FROM user_addresses WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 1',
        [clienteId]
    );
    if (remaining.length > 0) {
        await pool.query('UPDATE user_addresses SET is_default = 1 WHERE id = ?', [remaining[0].id]);
    }

    return NextResponse.json({ success: true });
}
