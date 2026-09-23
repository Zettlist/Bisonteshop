/**
 * La puerta del envio de apartados: QUE apartado puede convertirse en paquete.
 *
 * Un apartado es mercancia separada con un anticipo. Mientras haya saldo, la
 * pieza sigue siendo de la tienda: el cliente tiene hasta su fecha para
 * completar el pago, y si no lo hace la pieza vuelve al catalogo. Mandarla
 * antes de que este liquidada seria regalar mercancia a cambio de un anticipo
 * del 30%.
 *
 * De ahi que esta comprobacion no viva dentro de una ruta sino aqui: la piden
 * tres momentos distintos (cotizar el envio, preparar el cobro y registrarlo) y
 * tres copias serian tres criterios que con el tiempo dejan de coincidir. La
 * que decide de verdad es la de dentro de la transaccion — las otras dos estan
 * para no llegar hasta ahi con un error evitable.
 *
 * Las cuatro condiciones, y por que cada una:
 *
 *   status = 'pending'         un apartado vencido o cancelado ya no tiene la
 *                              pieza separada; otro cliente pudo comprarla.
 *   paid_amount >= total       ESTA es la regla del negocio. Sin ella el envio
 *                              seria la puerta de atras del apartado.
 *   sale_id IS NULL            no se ha mandado ya. Es lo que impide que dos
 *                              pulsaciones del boton generen dos paquetes (y
 *                              dos cobros de envio) por la misma mercancia.
 *   cliente_id = la sesion     el apartado de otra persona no se lee siquiera.
 *
 * ── Sin imports, a proposito ────────────────────────────────────────────────
 *
 * Igual que lib/reserva.mjs y lib/paquete.mjs: la conexion llega como
 * parametro. Asi las pruebas de db/tests/ corren estas mismas consultas contra
 * un MySQL de verdad sin tener que resolver el alias `@/` de Next.
 */

/**
 * Cuantos apartados caben en un envio multiple.
 *
 * No es un limite tecnico: es el tamaño de caja que una persona puede empacar
 * de una vez sin que la cotizacion se vuelva una adivinanza. Con mas de esto,
 * el paquete deja de caber en los empaques de lib/paquete.mjs y se cotiza «a la
 * medida», que es justo el caso en el que el precio cotizado y el que cobra la
 * paqueteria se separan.
 */
export const MAX_APARTADOS_ENVIO = 5;

/** Un peso, redondeado como lo guarda la base. */
const dos = (n) => Number(Number(n).toFixed(2));

/**
 * Los apartados que SI se pueden mandar, con sus renglones.
 *
 * Devuelve `{ error, codigo }` en vez de lanzar: cada motivo se le dice al
 * cliente con sus palabras, y quien llama decide el codigo HTTP.
 *
 * @param db          pool o conexion. Dentro de una transaccion hay que pasar
 *                    la conexion de esa transaccion, no el pool.
 * @param clienteId   el de la SESION. Nunca el del cuerpo de la peticion.
 * @param empresaId   la empresa de la tienda.
 * @param ids         los apartados que el cliente quiere mandar.
 */
export async function apartadosParaEnviar(db, { clienteId, empresaId, ids }) {
    const limpios = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

    if (!limpios.length) {
        return { error: 'Elige al menos un apartado para enviar.', codigo: 'vacio' };
    }
    if (limpios.length > MAX_APARTADOS_ENVIO) {
        return {
            error: `En una sola caja caben hasta ${MAX_APARTADOS_ENVIO} apartados. Manda los demás en otro envío.`,
            codigo: 'demasiados',
        };
    }

    // `cliente_id` y `empresa_id` van en el WHERE y no en una comprobacion
    // posterior: asi el apartado de otra persona no se llega a leer, y la
    // respuesta es la misma que si no existiera.
    const [filas] = await db.query(
        `SELECT id, folio, status, sale_id, total_amount, paid_amount, expires_at
           FROM anticipos
          WHERE id IN (?) AND cliente_id = ? AND empresa_id = ?`,
        [limpios, clienteId, empresaId]
    );

    if (filas.length !== limpios.length) {
        return { error: 'No encontramos alguno de esos apartados.', codigo: 'inexistente' };
    }

    for (const a of filas) {
        // El orden de estas tres importa para el mensaje: a quien le falta
        // dinero hay que decirle cuanto, no «este apartado ya no se puede
        // mandar».
        if (a.sale_id) {
            return {
                error: `El apartado ${a.folio} ya tiene un envío en camino. Míralo en tus pedidos.`,
                codigo: 'ya_enviado',
            };
        }
        if (a.status !== 'pending') {
            return {
                error: `El apartado ${a.folio} ya no está activo, no se puede enviar.`,
                codigo: 'cerrado',
            };
        }
        const saldo = dos(Number(a.total_amount) - Number(a.paid_amount));
        if (saldo > 0) {
            return {
                error: `Te faltan $${saldo.toFixed(2)} por pagar del apartado ${a.folio}. Liquídalo y después pide el envío.`,
                codigo: 'con_saldo',
            };
        }
    }

    const [items] = await db.query(
        `SELECT ai.anticipo_id, ai.product_id, ai.quantity, ai.unit_price,
                p.name, p.estado, p.stock, p.stock_reservado
           FROM anticipo_items ai
           JOIN products p ON p.id = ai.product_id
          WHERE ai.anticipo_id IN (?)`,
        [limpios]
    );

    if (!items.length) {
        return { error: 'Ese apartado no tiene artículos que enviar.', codigo: 'sin_items' };
    }

    // Una preventa no se puede mandar: la mercancia viene en un barco y no hay
    // pieza en el local. No deberia haber apartados de preventa — el boton de
    // apartar los rechaza — pero uno hecho en el mostrador si podria existir, y
    // si entrara aqui el POS lo cancelaria solo al no encontrar existencias.
    const enCamino = items.find((i) => i.estado === 'preventa');
    if (enCamino) {
        return {
            error: `"${enCamino.name}" todavía viene en camino. Te escribimos en cuanto llegue para mandarlo.`,
            codigo: 'preventa',
        };
    }

    // La pieza tiene que seguir existiendo. Con la reserva hecha esto solo
    // falla por merma o por un ajuste de inventario a mano, y mas vale decirlo
    // aqui que cobrar un envio que el POS va a cancelar.
    const faltante = items.find((i) => Number(i.stock) < Number(i.quantity));
    if (faltante) {
        return {
            error: `No encontramos "${faltante.name}" en el almacén. Escríbenos con tu folio y lo resolvemos.`,
            codigo: 'sin_pieza',
        };
    }

    const mercancia = dos(items.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0));

    return {
        apartados: filas.map((a) => ({
            id: a.id,
            folio: a.folio,
            total: dos(a.total_amount),
            pagado: dos(a.paid_amount),
        })),
        items: items.map((i) => ({
            anticipoId: i.anticipo_id,
            productId: i.product_id,
            quantity: Number(i.quantity),
            unitPrice: dos(i.unit_price),
            name: i.name,
        })),
        mercancia,
        ids: limpios.sort((a, b) => a - b),
    };
}

/**
 * Cierra los apartados que acaban de convertirse en un paquete.
 *
 * Las condiciones del WHERE son las mismas de arriba y no sobran: la lectura de
 * `apartadosParaEnviar` suelta la fila, y dos peticiones a la vez la pasan las
 * dos. Esta sentencia es la que de verdad deja pasar a una sola — quien no
 * cuadre devuelve menos filas de las esperadas y la transaccion se deshace sin
 * haber cobrado nada.
 *
 * NO toca el inventario, y eso es deliberado: la pieza esta separada
 * (`stock_reservado`) desde que nacio el apartado, y ahi se queda. El stock
 * fisico lo baja el POS al confirmar el pedido, con la misma sentencia que usa
 * para cualquier pedido web. Asi la mercancia sale del almacen una vez y en un
 * solo sitio.
 *
 * @returns el numero de apartados que de verdad se cerraron.
 */
export async function cerrarApartadosPorEnvio(conn, { ids, clienteId, empresaId, saleId }) {
    const [res] = await conn.query(
        `UPDATE anticipos
            SET status = 'completed', sale_id = ?, completed_at = NOW()
          WHERE id IN (?)
            AND cliente_id = ?
            AND empresa_id = ?
            AND status = 'pending'
            AND sale_id IS NULL
            AND paid_amount >= total_amount`,
        [saleId, ids, clienteId, empresaId]
    );
    return res.affectedRows;
}
