import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession } from '@/lib/auth';
import { EVENTOS } from '@/lib/eventos';

export const dynamic = 'force-dynamic';

// GET — cupones disponibles para la cuenta del usuario.
// Hoy: premio del evento Mundial (si votó por el ganador publicado).
// Extender aquí cuando haya cupones asignados por cliente.
export async function GET() {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ success: true, cupones: [] });

        const cupones = [];

        // Premio Mundial 2026
        try {
            const ev = EVENTOS.mundial2026;
            const [res] = await pool.query(
                'SELECT ganador, codigo FROM event_results WHERE evento = ?',
                [ev.id]
            );
            if (res[0]?.codigo) {
                const [v] = await pool.query(
                    'SELECT opcion FROM event_votes WHERE evento = ? AND cliente_id = ?',
                    [ev.id, session.id]
                );
                if (v[0]?.opcion === res[0].ganador) {
                    const code = res[0].codigo;
                    let detalle = 'Premio por atinarle al resultado';
                    const [c] = await pool.query(
                        `SELECT discount_type, discount_value FROM coupons
                         WHERE code = ? AND status = 'active'
                           AND (expiration_date IS NULL OR expiration_date > NOW())
                           AND (usage_limit IS NULL OR usage_count < usage_limit)
                         LIMIT 1`,
                        [code]
                    );
                    if (c[0]) {
                        detalle = c[0].discount_type === 'percentage'
                            ? `${parseFloat(c[0].discount_value)}% de descuento`
                            : `$${parseFloat(c[0].discount_value)} MXN de descuento`;
                    }
                    cupones.push({ code, origen: 'Mundial 2026 🏆', detalle });
                }
            }
        } catch { /* tablas del evento aún no existen — sin cupones de evento */ }

        return NextResponse.json({ success: true, cupones });
    } catch (error) {
        console.error('[Cupones] GET error:', error);
        return NextResponse.json({ success: true, cupones: [] });
    }
}
