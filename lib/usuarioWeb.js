/**
 * El usuario del POS al que se le apuntan los movimientos nacidos en la web.
 *
 * `sales.user_id` y `anticipos.created_by` son obligatorios y apuntan a la
 * tabla de usuarios del mostrador; una venta o un apartado hechos por internet
 * no tienen detras a nadie con teclado. Se les pone el usuario de la variable
 * WEB_USER_ID, y si no esta configurada, el primero de la empresa: lo que
 * importa es que la fila exista y la venta quede registrada, no quien figure.
 *
 * Vive aqui porque lo necesitan el pedido y el apartado, y dos copias de esta
 * decision serian dos usuarios distintos en los reportes.
 */
export async function usuarioWeb(conn, empresaId) {
    const configurado = process.env.WEB_USER_ID ? Number(process.env.WEB_USER_ID) : null;
    if (configurado) return configurado;

    const [filas] = await conn.query(
        'SELECT id FROM users WHERE empresa_id = ? ORDER BY id ASC LIMIT 1',
        [empresaId]
    );
    if (!filas.length) throw new Error(`No hay usuarios para empresa_id ${empresaId}`);
    return filas[0].id;
}
