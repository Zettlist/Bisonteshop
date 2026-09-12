-- =============================================================================
--  El saldo de tienda deja de gastarse dos veces
--  2026-09-11
--
--  Como estaba: /api/checkout leia `clientes.store_credit` y bajaba el total
--  del pedido; el descuento del saldo lo hacia /api/orders/capture, cuando el
--  POS confirma existencias. Entre las dos cosas pasan DIAS, y durante esos
--  dias el saldo seguia entero en la cuenta. El mismo credito se aplicaba al
--  pedido siguiente, y al siguiente. Al capturar, el
--
--      UPDATE clientes SET store_credit = GREATEST(0, store_credit - ?)
--
--  se comia el descuadre en silencio: el saldo llegaba a cero y la tienda
--  regalaba la diferencia sin un solo error en el log.
--
--  Como queda: el saldo se descuenta al REGISTRAR el pedido
--  (/api/checkout/confirm), dentro de la misma transaccion que lo crea, y bajo
--  un SELECT ... FOR UPDATE que serializa dos pedidos simultaneos del mismo
--  cliente. Cancelar o reembolsar lo devuelve.
--
--  Se aplica UNA VEZ y a mano (ver db/README.md: el esquema no se migra en el
--  arranque de la aplicacion).
-- =============================================================================

-- ── 0. Antes de tocar nada ───────────────────────────────────────────────────
-- La columna no deberia existir. Si sale una fila, la migracion ya esta puesta:
-- SELECT COUNT(*) FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bisonte_orders'
--    AND COLUMN_NAME = 'credito_aplicado';


-- ── 1. Lo que el pedido se comio ─────────────────────────────────────────────
-- Sin esta columna la devolucion no se puede hacer bien. La cifra esta en el
-- metadata del PaymentIntent (`appliedCredit`), pero esa dice lo que se PIDIO
-- aplicar, no lo que de verdad salio de la cuenta, y son distintas cuando dos
-- pedidos se confirman a la vez. Ademas obligaria a llamar a Stripe para
-- devolver un saldo, que es una dependencia de red donde no hace falta.
--
-- DEFAULT 0 deja a los pedidos viejos en cero, que es la respuesta correcta
-- para ellos: su saldo se descontaba (o no) por el camino anterior, y esta
-- columna solo manda para los que nazcan de aqui en adelante.
ALTER TABLE bisonte_orders
    ADD COLUMN credito_aplicado DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER refund_id;

-- Un credito aplicado negativo seria un pedido que REGALA saldo. Ningun camino
-- lo escribe; el CHECK esta para que tampoco lo escriba el que venga.
ALTER TABLE bisonte_orders
    ADD CONSTRAINT chk_bo_credito CHECK (credito_aplicado >= 0);


-- ── 2. Los pedidos que ya estaban en vuelo ───────────────────────────────────
-- El descuento se muda de sitio, y los pedidos que existen ahora mismo estan
-- repartidos entre el camino viejo y el nuevo. Hay que colocarlos a mano; son
-- pocos (los que el POS no ha despachado todavia) y cada estado pide una cosa
-- distinta.
--
-- El credito de un pedido no esta guardado en ninguna columna, pero se deduce
-- de la venta: /api/checkout resta el saldo del total DESPUES del cupon y el
-- envio, asi que
--
--     credito = subtotal + surcharge - discount - total
--
-- donde `surcharge` es el envio. Esa cuenta es la que usan los UPDATE de abajo.

-- 2.a) AUTORIZADOS — el caso que hay que atender de verdad.
--      Su saldo AUN NO se descontó (el camino viejo lo hacia al capturar) y a
--      partir de este deploy la captura ya no lo hara. Sin esto, esos pedidos
--      se llevan el credito gratis. Se descuenta ahora, que es lo que el camino
--      nuevo habria hecho al registrarlos.
--
--      Mirar primero a quien afecta:
-- SELECT o.sale_id, o.cliente_id, c.store_credit,
--        GREATEST(0, s.subtotal + s.surcharge - s.discount - s.total) AS credito
--   FROM bisonte_orders o
--   JOIN sales s    ON s.id = o.sale_id
--   JOIN clientes c ON c.id = o.cliente_id
--  WHERE o.pago_estado = 'autorizado'
--    AND s.subtotal + s.surcharge - s.discount - s.total > 0;
--
--      Y si la lista sale vacia, saltarse los cuatro pasos siguientes.

START TRANSACTION;

-- Que le toca a cada pedido. Dos cuidados que parecen de mas y no lo son:
--
--   · El `credito_aplicado = 0` y la tabla temporal hacen esto re-ejecutable.
--     Un script de cobro que al pegarse dos veces cobra dos veces es una
--     trampa, y este se pega a mano en una consola de produccion.
--
--   · El reparto es SECUENCIAL, con la ventana que acumula lo que ya se
--     llevaron los pedidos anteriores del mismo cliente. Justo aqui es donde
--     hay clientes con dos y tres pedidos vivos apoyados en el mismo saldo --
--     es el fallo que se esta corrigiendo -- y darle a cada uno LEAST(pedido,
--     saldo) por separado dejaria la cuenta en negativo. El primero cobra, y
--     al que no alcanza se le queda en cero: su pedido ya se autorizo con el
--     descuento puesto y esa diferencia es la perdida que dejo el fallo.
CREATE TEMPORARY TABLE mig_credito AS
SELECT sale_id, cliente_id, GREATEST(0, LEAST(pedido, saldo - previo)) AS credito
  FROM (
    SELECT o.sale_id, o.cliente_id, c.store_credit AS saldo,
           GREATEST(0, s.subtotal + s.surcharge - s.discount - s.total) AS pedido,
           COALESCE(SUM(GREATEST(0, s.subtotal + s.surcharge - s.discount - s.total))
                    OVER (PARTITION BY o.cliente_id ORDER BY o.sale_id
                          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS previo
      FROM bisonte_orders o
      JOIN sales s    ON s.id = o.sale_id
      JOIN clientes c ON c.id = o.cliente_id
     WHERE o.pago_estado = 'autorizado'
       AND o.credito_aplicado = 0
       AND s.subtotal + s.surcharge - s.discount - s.total > 0
  ) t
 WHERE GREATEST(0, LEAST(pedido, saldo - previo)) > 0;

UPDATE bisonte_orders o JOIN mig_credito m ON m.sale_id = o.sale_id
   SET o.credito_aplicado = m.credito;

INSERT INTO credit_history (cliente_id, amount, description)
SELECT cliente_id, -credito, CONCAT('Saldo aplicado al pedido #', sale_id) FROM mig_credito;

UPDATE clientes c
  JOIN (SELECT cliente_id, SUM(credito) AS usado FROM mig_credito GROUP BY cliente_id) x
    ON x.cliente_id = c.id
   SET c.store_credit = c.store_credit - x.usado;

DROP TEMPORARY TABLE mig_credito;

COMMIT;

-- 2.b) CAPTURADOS — su saldo SI se descontó, por el camino viejo. Solo falta
--      dejar escrito cuanto, para que un reembolso posterior lo devuelva.
--      No se toca `store_credit` ni el historial: el dinero ya se movio.
UPDATE bisonte_orders o
  JOIN sales s ON s.id = o.sale_id
   SET o.credito_aplicado = GREATEST(0, s.subtotal + s.surcharge - s.discount - s.total)
 WHERE o.pago_estado = 'capturado'
   AND s.subtotal + s.surcharge - s.discount - s.total > 0;

-- 2.c) CANCELADOS — se quedan en cero y esta bien. El camino viejo solo
--      descontaba al capturar, y a estos nunca se les capturó: su saldo nunca
--      salio de la cuenta, asi que no hay nada que devolver.

-- 2.d) REEMBOLSADOS — se quedan en cero, pero por otra razon: a estos SI se les
--      descontó el saldo (se capturaron) y el reembolso viejo no lo devolvia.
--      Ese saldo esta perdido, y devolverlo es una decision de la tienda, no de
--      una migracion. Esta consulta dice a quien y cuanto:
-- SELECT o.sale_id, o.cliente_id, c.email,
--        ROUND(s.subtotal + s.surcharge - s.discount - s.total, 2) AS saldo_perdido
--   FROM bisonte_orders o
--   JOIN sales s    ON s.id = o.sale_id
--   JOIN clientes c ON c.id = o.cliente_id
--  WHERE o.pago_estado = 'reembolsado'
--    AND s.subtotal + s.surcharge - s.discount - s.total > 0;
--
--      Para abonarlo hay que hacer las dos cosas, siempre juntas:
-- INSERT INTO credit_history (cliente_id, amount, description) VALUES (?, ?, 'Saldo devuelto: pedido #? reembolsado');
-- UPDATE clientes SET store_credit = store_credit + ? WHERE id = ?;


-- ── 3. Permisos ──────────────────────────────────────────────────────────────
-- Ninguno nuevo: `bisonte_app` ya tiene SELECT/INSERT/UPDATE/DELETE sobre
-- bisonte_orders y sobre credit_history, que son las dos tablas que toca el
-- camino nuevo.


-- ── 4. Comprobacion ──────────────────────────────────────────────────────────
-- a) La columna y su CHECK existen
-- SHOW CREATE TABLE bisonte_orders;
--
-- b) Despues del primer pedido pagado con saldo, las tres cosas cuadran: el
--    pedido dice cuanto se comio, el historial tiene el movimiento negativo y
--    el saldo del cliente bajo en esa cantidad.
-- SELECT o.sale_id, o.credito_aplicado, h.amount, h.description, c.store_credit
--   FROM bisonte_orders o
--   JOIN clientes c ON c.id = o.cliente_id
--   LEFT JOIN credit_history h ON h.cliente_id = o.cliente_id
--                             AND h.description = CONCAT('Saldo aplicado al pedido #', o.sale_id)
--  WHERE o.credito_aplicado > 0
--  ORDER BY o.created_at DESC LIMIT 5;
--
-- c) Ningun pedido cancelado o reembolsado con el saldo sin devolver (0 filas).
--    Los dos movimientos -- el gasto y la devolucion -- se escriben en la misma
--    transaccion que el cambio de estado, asi que una fila aqui significa que
--    alguien cerro el pedido por fuera de /api/orders/capture y /refund.
-- SELECT o.sale_id, o.pago_estado, o.credito_aplicado
--   FROM bisonte_orders o
--  WHERE o.pago_estado IN ('cancelado','reembolsado')
--    AND o.credito_aplicado > 0
--    AND NOT EXISTS (SELECT 1 FROM credit_history h
--                     WHERE h.cliente_id = o.cliente_id
--                       AND h.amount = o.credito_aplicado
--                       AND h.description LIKE CONCAT('Saldo devuelto: pedido #', o.sale_id, '%'));
--
-- d) Nadie con el saldo en negativo (0 filas). El camino nuevo nunca descuenta
--    mas de lo que hay, asi que esto no deberia poder pasar.
-- SELECT id, email, store_credit FROM clientes WHERE store_credit < 0;
