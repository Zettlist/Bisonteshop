-- =============================================================================
--  Poner al dia `stock_reservado` con los pedidos web que ya existen
--  2026-09-15
--
--  El POS lleva tiempo dando esto por hecho. Su comentario, textual
--  (routes/webOrders.js, "RESERVA DE INVENTARIO"):
--
--      "La tienda reserva al confirmar el checkout (stock_reservado +=
--       cantidad), con CHECK (stock_reservado <= stock) impidiendo la
--       sobreventa desde la base. Aqui solo se consuma o se libera."
--
--  La tienda no lo hacia. No habia una sola escritura de `stock_reservado` en
--  todo el proyecto de la tienda, y no se noto porque el POS la resta con
--  GREATEST(0, ...): restarle a un cero que nunca subio no rompe nada visible.
--  El stock fisico bajaba bien. Lo que no existia era el aparte.
--
--  Consecuencia, con nueve piezas: entraban nueve pedidos, y el decimo, y el
--  undecimo, todos con la tarjeta ya autorizada, porque `stock` no descuenta lo
--  que ya tiene dueño y los pedidos anteriores eran invisibles para el
--  siguiente. El codigo que lo tapa va en este mismo commit (lib/reserva.mjs).
--
--  Esto es lo otro que hace falta: el contador arranca desmentido por los
--  pedidos que ya estan en la base, y hasta que se cuadre la tienda seguiria
--  ofreciendo piezas que ya son de alguien.
--
--  Se aplica UNA VEZ. No es idempotente -- suma, no asigna -- y correrla dos
--  veces apartaria el doble. Como correrla:
--
--      node db/aplicar-migracion.mjs 2026-09-15-reserva-de-pedidos-web.sql
--      node db/aplicar-migracion.mjs 2026-09-15-reserva-de-pedidos-web.sql --aplicar
--
--  Sin --aplicar solo enseña lo que haria. No necesita root ni torlan_user: no
--  hay DDL, y `bisonte_app` ya tiene GRANT UPDATE (stock_reservado) desde que
--  existen los apartados.
-- =============================================================================


-- ── 1. Que se va a apartar ──────────────────────────────────────────────────
--
-- Mirar antes de tocar. Esta consulta es la misma que el UPDATE de abajo, y
-- enseña producto por producto lo que tiene comprometido en pedidos web vivos.
--
-- Un pedido esta VIVO si su mercancia sigue prometida y todavia no salio del
-- almacen: eso es `stock_deducted = 0` y un estado que no sea 'cancelado' ni
-- 'entregado'. Los dos extremos quedan fuera por razones opuestas -- el
-- cancelado no promete nada y el entregado ya se llevo la pieza de verdad.

SELECT p.id, p.name, p.stock, p.stock_reservado AS reservado_hoy,
       SUM(si.quantity) AS comprometido_web,
       p.stock_reservado + SUM(si.quantity) AS quedaria
  FROM products p
  JOIN sale_items si     ON si.product_id = p.id
  JOIN bisonte_orders bo ON bo.sale_id = si.sale_id
 WHERE bo.stock_deducted = 0
   AND bo.estado NOT IN ('cancelado', 'entregado')
 GROUP BY p.id
 ORDER BY p.id;


-- ── 2. Apartarlo ────────────────────────────────────────────────────────────
--
-- Suma sobre lo que ya hubiera: `stock_reservado` NO es solo de los pedidos
-- web. Los apartados de mostrador escriben la misma columna desde que existen
-- (db/migrations/2026-09-06), y asignar en vez de sumar borraria la mercancia
-- que un cliente ya pago a medias en el mostrador.
--
-- LEAST(..., p.stock) para que el CHECK (stock_reservado <= stock) no tumbe la
-- migracion entera por un producto descuadrado. No es disimular: el tope se
-- delata en la comprobacion del paso 3, y lo que delata es un pedido que ya se
-- acepto sin mercancia detras -- exactamente lo que este commit viene a
-- impedir de aqui en adelante, y que en los que ya entraron hay que resolver a
-- mano, cancelandolos.

UPDATE products p
  JOIN (
      SELECT si.product_id, SUM(si.quantity) AS piezas
        FROM sale_items si
        JOIN bisonte_orders bo ON bo.sale_id = si.sale_id
       WHERE bo.stock_deducted = 0
         AND bo.estado NOT IN ('cancelado', 'entregado')
       GROUP BY si.product_id
  ) c ON c.product_id = p.id
   SET p.stock_reservado = LEAST(p.stock_reservado + c.piezas, p.stock);


-- ── 3. Comprobar ────────────────────────────────────────────────────────────
--
-- La primera tiene que dar 0. Si da otra cosa, esos productos tienen pedidos
-- vivos por mas piezas de las que hay: son los que el tope de arriba recorto, y
-- cada uno es un cliente al que se le cobro algo que no existe. Se cancelan
-- desde el POS, que ya libera el cobro al hacerlo.

SELECT 'productos con mas comprometido que existencias' AS que, COUNT(*) AS cuantos
  FROM (
      SELECT p.id
        FROM products p
        JOIN sale_items si     ON si.product_id = p.id
        JOIN bisonte_orders bo ON bo.sale_id = si.sale_id
       WHERE bo.stock_deducted = 0
         AND bo.estado NOT IN ('cancelado', 'entregado')
       GROUP BY p.id
      HAVING SUM(si.quantity) > MAX(p.stock)
  ) x
UNION ALL
SELECT 'piezas apartadas en total', COALESCE(SUM(stock_reservado), 0) FROM products
UNION ALL
-- Ninguna puede quedar en negativo ni por encima del stock: son los dos CHECK
-- de la tabla, y preguntarlo aqui cuesta nada.
SELECT 'productos fuera de rango', COUNT(*) FROM products
 WHERE stock_reservado < 0 OR stock_reservado > stock;
