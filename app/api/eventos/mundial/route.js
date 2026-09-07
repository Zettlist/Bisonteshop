import pool from '@/lib/db';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { EVENTOS, votacionAbierta } from '@/lib/eventos';

const EVENTO = EVENTOS.mundial2026.id;
const OPCIONES = Object.keys(EVENTOS.mundial2026.opciones);

// Aqui habia un ensureTables() que corria CREATE TABLE IF NOT EXISTS en cada
// llamada a esta ruta. Sobraba y ademas mentia: `event_votes` y `event_results`
// viven en db/schema.sql, y la version de aqui era la vieja -- sin `is_demo` ni
// los indices. Como nunca se ejecutaba de verdad (las tablas ya existen) nadie
// lo noto, pero el dia que faltara una habria creado la forma equivocada y las
// queries que filtran por is_demo habrian empezado a fallar.
//
// El esquema se aplica desde db/schema.sql y los cambios van en db/migrations/.
// La app no crea tablas.

// GET — conteos, voto del usuario (si hay sesión) y resultado/código si ya terminó
export async function GET() {
    try {

        const [rows] = await pool.query(
            'SELECT opcion, COUNT(*) AS total FROM event_votes WHERE evento = ? GROUP BY opcion',
            [EVENTO]
        );
        const conteos = Object.fromEntries(OPCIONES.map(o => [o, 0]));
        for (const r of rows) conteos[r.opcion] = r.total;

        let miVoto = null;
        const session = await getSession();
        if (session) {
            const [v] = await pool.query(
                'SELECT opcion FROM event_votes WHERE evento = ? AND cliente_id = ?',
                [EVENTO, session.id]
            );
            miVoto = v[0]?.opcion || null;
        }

        const [res] = await pool.query(
            'SELECT ganador, codigo FROM event_results WHERE evento = ?',
            [EVENTO]
        );
        const ganador = res[0]?.ganador || null;
        // El código solo se entrega a quien votó por el ganador
        const codigo = ganador && miVoto === ganador ? res[0]?.codigo || null : null;

        return NextResponse.json({
            success: true,
            conteos,
            miVoto,
            ganador,
            codigo,
            votacionAbierta: votacionAbierta('mundial2026'),
            logueado: !!session,
        });
    } catch (error) {
        console.error('[Mundial] GET error:', error);
        return NextResponse.json({ success: false, error: 'Error del servidor.' }, { status: 500 });
    }
}

// POST — registrar voto (requiere sesión, uno por usuario)
export async function POST(req) {
    try {

        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Inicia sesión para votar.' }, { status: 401 });
        }

        if (!votacionAbierta('mundial2026')) {
            return NextResponse.json({ success: false, error: 'La votación ya cerró.' }, { status: 403 });
        }

        const { opcion } = await req.json();
        if (!OPCIONES.includes(opcion)) {
            return NextResponse.json({ success: false, error: 'Opción inválida.' }, { status: 400 });
        }

        try {
            await pool.query(
                'INSERT INTO event_votes (evento, cliente_id, opcion) VALUES (?, ?, ?)',
                [EVENTO, session.id, opcion]
            );
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                return NextResponse.json({ success: false, error: 'Ya votaste en este evento.' }, { status: 409 });
            }
            throw e;
        }

        return NextResponse.json({ success: true, opcion });
    } catch (error) {
        console.error('[Mundial] POST error:', error);
        return NextResponse.json({ success: false, error: 'Error del servidor.' }, { status: 500 });
    }
}

// PATCH — registrar el ganador y el código de descuento (solo admin, al terminar el partido)
export async function PATCH(req) {
    try {

        const adminKey = req.headers.get('x-admin-key');
        if (!adminKey || adminKey !== process.env.CAPTURE_API_KEY) {
            return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
        }

        const { ganador, codigo } = await req.json();
        if (!OPCIONES.includes(ganador)) {
            return NextResponse.json({ success: false, error: 'Ganador inválido.' }, { status: 400 });
        }

        await pool.query(
            `INSERT INTO event_results (evento, ganador, codigo) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE ganador = VALUES(ganador), codigo = VALUES(codigo)`,
            [EVENTO, ganador, codigo || null]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Mundial] PATCH error:', error);
        return NextResponse.json({ success: false, error: 'Error del servidor.' }, { status: 500 });
    }
}
