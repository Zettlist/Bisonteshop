-- =============================================================================
--  Como se pago de verdad
--  2026-09-14
--
--  `sales.payment_method` estaba escrito a mano en el INSERT del checkout:
--
--      INSERT INTO sales (..., payment_method, created_at)
--      VALUES (?, ?, 'web', ?, ?, ?, ?, 'card', NOW())
--
--  Literalmente 'card', pasara lo que pasara. De los 61 pedidos web, 23 se
--  pagaron enteros con saldo de la tienda y los 23 dicen "tarjeta".
--
--  Donde se nota: el corte de caja NO -- filtra por sesion de caja y ninguna
--  venta web tiene una. Pero el desglose por metodo de pago del panel del POS
--  (routes/sales.js) no filtra nada, asi que ahi el saldo se cuenta como
--  tarjeta. Son ventas reales sumadas en la columna equivocada.
--
--  Y de la tarjeta no se guardaba nada. Stripe lo sabe todo -- marca, cuatro
--  ultimos, credito o debito, meses -- y no se le preguntaba.
--
--  Se aplica UNA VEZ y a mano (ver db/README.md). Necesita `torlan_user`.
-- =============================================================================


-- ── El metodo de pago deja de ser binario ───────────────────────────────────
--
-- Habia dos valores porque en el mostrador solo hay dos formas de pagar. En la
-- web hay tres, y la tercera no es ninguna de las dos: el saldo de la tienda no
-- es efectivo (no entra dinero al cajon) ni es tarjeta (no pasa por Stripe).
-- Es dinero que el cliente ya habia pagado antes y que ahora gasta.
--
-- 'mixto' es el pedido que paga una parte con saldo y el resto con tarjeta. Sin
-- ese valor habria que elegir con cual de los dos mentir.

ALTER TABLE sales
    MODIFY COLUMN payment_method ENUM('cash','card','saldo','mixto') NOT NULL;


-- ── Que tarjeta fue ─────────────────────────────────────────────────────────
--
-- Cuando alguien llama por un cargo, "tarjeta" no contesta nada. "Visa
-- terminada en 4242, credito, a 6 meses" contesta todo, y es lo que el cliente
-- ve en su estado de cuenta.
--
-- Nada de esto es dato sensible: los cuatro ultimos digitos y la marca son
-- justo lo que se puede guardar. El numero completo no lo tenemos ni lo
-- queremos -- vive en Stripe y ahi se queda.

ALTER TABLE bisonte_orders
    -- Como se pago, en una palabra. Se calcula al confirmar y no se deduce
    -- despues: `payment_intent_id` empieza por 'saldo_' cuando fue saldo, pero
    -- leer un prefijo para saber como se cobro algo es adivinar, no consultar.
    ADD COLUMN pago_tipo       ENUM('tarjeta','saldo','mixto') NULL AFTER pago_estado,
    ADD COLUMN tarjeta_marca   VARCHAR(20) NULL AFTER pago_tipo,
    ADD COLUMN tarjeta_ultimos4 CHAR(4) NULL AFTER tarjeta_marca,
    -- Lo que Stripe llama `funding`. Es la pregunta que de verdad se hace quien
    -- atiende un reclamo: si fue debito el dinero ya salio de su cuenta, y la
    -- devolucion tarda distinto que en credito.
    ADD COLUMN tarjeta_tipo    ENUM('credito','debito','prepago','desconocido') NULL AFTER tarjeta_ultimos4,
    -- Meses sin intereses. 0 es una sola exhibicion, que es lo unico que puede
    -- pasar hoy: el PaymentIntent no pide `installments`, asi que la tienda no
    -- los ofrece todavia. La columna existe para que el dia que se activen no
    -- haga falta otra migracion, y para que mientras tanto la pantalla pueda
    -- decir "una sola exhibicion" en vez de callarse.
    ADD COLUMN tarjeta_meses   TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER tarjeta_tipo,
    -- El detalle completo que devuelve Stripe, por la misma razon que
    -- shipment_events guarda `crudo`: las columnas de arriba son las preguntas
    -- que sabemos hacer hoy. El codigo de autorizacion, el pais de la tarjeta o
    -- si el CVC dio bien son preguntas de mañana, y de una disputa.
    ADD COLUMN pago_detalle    JSON NULL AFTER tarjeta_meses;


-- ── Poner al dia lo que ya hay ──────────────────────────────────────────────
--
-- Los 61 pedidos existentes se pueden clasificar sin preguntarle a Stripe,
-- porque el prefijo de la referencia y el credito aplicado bastan:
--
--   referencia 'saldo_...'  -> se pago entero con saldo
--   credito > 0 y total > 0 -> una parte saldo, otra tarjeta
--   el resto                -> tarjeta
--
-- De la tarjeta en si no se rellena nada: eso solo lo sabe Stripe y no vale la
-- pena ir a buscarlo para 38 pedidos de prueba. Los que entren a partir de
-- ahora lo traen desde el primer momento.

UPDATE bisonte_orders bo
  JOIN sales s ON s.id = bo.sale_id
   SET bo.pago_tipo = CASE
         WHEN bo.payment_intent_id LIKE 'saldo\_%' THEN 'saldo'
         WHEN bo.credito_aplicado > 0 AND s.total > 0 THEN 'mixto'
         ELSE 'tarjeta'
       END;

-- Y la venta, que es la que sale en los informes del POS.
UPDATE sales s
  JOIN bisonte_orders bo ON bo.sale_id = s.id
   SET s.payment_method = CASE bo.pago_tipo
         WHEN 'saldo' THEN 'saldo'
         WHEN 'mixto' THEN 'mixto'
         ELSE 'card'
       END
 WHERE s.origen = 'web';
