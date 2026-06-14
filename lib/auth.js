import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import pool from '@/lib/db';

const getJwtSecretKey = () => new TextEncoder().encode(process.env.JWT_SECRET);

/**
 * Verifica la sesión del request:
 *  1. Cookie `bisonte_session` presente
 *  2. Firma JWT válida
 *  3. session_version del token === session_version en BD (revocación)
 *
 * Devuelve el payload del token ({ id, nombre, email, sv, ... }) o null.
 * Tokens viejos sin `sv` se tratan como sv=1 para no expulsar sesiones previas.
 */
export async function getSession() {
    const cookieStore = await cookies();
    const token = cookieStore.get('bisonte_session')?.value;
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey());
        const [rows] = await pool.query(
            'SELECT session_version FROM clientes WHERE id = ? LIMIT 1',
            [payload.id]
        );
        if (!rows.length) return null;

        const dbVersion = rows[0].session_version ?? 1;
        const tokenVersion = payload.sv ?? 1;
        if (dbVersion !== tokenVersion) return null; // sesión revocada

        return payload;
    } catch {
        return null;
    }
}

/** Solo el id del cliente autenticado (o null). */
export async function getClienteId() {
    const session = await getSession();
    return session?.id ?? null;
}

/** Invalida todas las sesiones de un cliente (logout global / cambio de contraseña). */
export async function bumpSessionVersion(clienteId) {
    await pool.query(
        'UPDATE clientes SET session_version = COALESCE(session_version, 1) + 1 WHERE id = ?',
        [clienteId]
    );
}
