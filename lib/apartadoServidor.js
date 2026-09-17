/**
 * Lo que hace falta para CREAR un apartado, del lado del servidor.
 *
 * Separado de lib/apartado.js a proposito: aquel son las reglas (porcentajes,
 * plazos, calculos) y lo importa el navegador; esto toca la base de datos y no
 * puede acabar en el paquete que se descarga el cliente.
 *
 * El folio y el vencimiento se calculan igual que en el POS
 * (backend/utils/apartados.js). Son los mismos apartados en la misma tabla: dos
 * maneras de numerarlos serian dos numeraciones.
 */
import { DIAS_APARTADO } from './apartado';

/** El numero que se le dice al cliente: AP-000123. */
export function formatearFolio(secuencia) {
    return `AP-${String(secuencia).padStart(6, '0')}`;
}

/**
 * Reserva el siguiente folio de la empresa.
 *
 * El contador es atomico y no un COUNT(*): ese retrocede al cancelar y repite
 * numero cuando dos personas dan de alta a la vez. LAST_INSERT_ID() es por
 * conexion, asi que el INSERT y el SELECT tienen que ir por la misma — la de la
 * transaccion que esta creando el apartado. Si esa transaccion se deshace, el
 * folio se pierde: un hueco en la numeracion es preferible a dos apartados con
 * el mismo numero.
 */
export async function reservarFolio(conn, empresaId) {
    await conn.query(
        `INSERT INTO apartado_sequences (empresa_id, next_seq) VALUES (?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE next_seq = LAST_INSERT_ID(next_seq + 1)`,
        [empresaId]
    );
    const [[fila]] = await conn.query('SELECT LAST_INSERT_ID() AS seq');
    return formatearFolio(Number(fila.seq));
}

/** Fecha limite del apartado, contada desde ahora. */
export function vencimiento(dias = DIAS_APARTADO) {
    const f = new Date();
    f.setDate(f.getDate() + dias);
    return f;
}
