-- =============================================================================
--  Productos de prueba, para no gastar inventario real probando
--  2026-09-15
--
--  Los 61 pedidos de prueba apuntan a 11 productos REALES, en 203 renglones.
--  La pantalla de pedidos los marca todos en rojo con "sin existencia" porque
--  piden mas piezas de las que hay -- y peor: confirmar cualquiera de ellos
--  descontaria stock de verdad, el que se vende en el mostrador.
--
--  Esto crea seis productos que no existen, con existencia de sobra, y
--  reapunta los pedidos de prueba hacia ellos.
--
--  Se aplica UNA VEZ y a mano. Necesita `torlan_user`: crear productos es de
--  las cosas que ni la tienda ni el POS pueden hacer, a proposito.
-- =============================================================================


-- ── La marca ────────────────────────────────────────────────────────────────
--
-- `products` no tenia forma de decir "esto no es mercancia". Sin ella, los seis
-- productos de abajo apareceran en la tienda publica en cuanto alguien abra
-- bisontemanga.com: las consultas del catalogo filtran por empresa y nada mas
-- -- comprobado en lib/productos.js y en las tres rutas de catalogo.
--
-- Asi que la marca no es un adorno: es lo unico que separa un producto de
-- prueba de un manga a la venta.

ALTER TABLE products
    ADD COLUMN es_prueba TINYINT(1) NOT NULL DEFAULT 0 AFTER estado;

-- El catalogo se recorre entero en cada visita a la tienda. Sin indice, filtrar
-- por esta columna obliga a mirar las 52 filas -- hoy da igual, con 5.000 no.
ALTER TABLE products
    ADD KEY idx_es_prueba (es_prueba);


-- ── Los seis productos ──────────────────────────────────────────────────────
--
-- El nombre empieza por "PRUEBA —" a proposito. La marca de la base la ve el
-- codigo; el nombre lo ve la persona que tiene el POS abierto, y es lo que
-- evita que alguien venda uno en el mostrador por accidente.
--
-- Existencia de 999 para que ninguna prueba se quede corta, y precios variados
-- para que las sumas del pedido no salgan todas iguales y escondan un error de
-- calculo. Uno es `is_adult` porque la tienda tiene una seccion aparte para eso
-- y conviene poder probarla.

INSERT INTO products (empresa_id, name, sale_price, cost_price, stock, estado, es_prueba, is_adult, category_id, image_url)
VALUES
  (1, 'PRUEBA — Manga barato',        120.00,  60.00, 999, 'normal', 1, 0, 2, NULL),
  (1, 'PRUEBA — Manga normal',        350.00, 180.00, 999, 'normal', 1, 0, 2, NULL),
  (1, 'PRUEBA — Manga caro',          890.00, 500.00, 999, 'normal', 1, 0, 2, NULL),
  (1, 'PRUEBA — Tomo pesado',         450.00, 220.00, 999, 'normal', 1, 0, 2, NULL),
  (1, 'PRUEBA — Articulo para adultos', 520.00, 260.00, 999, 'normal', 1, 1, 3, NULL),
  -- Con existencia 1: es el unico que permite probar que pasa cuando dos
  -- pedidos quieren la misma pieza, que es el caso que de verdad rompe cosas.
  (1, 'PRUEBA — Ultima pieza',        299.00, 150.00,   1, 'normal', 1, 0, 2, NULL);


-- ── Reapuntar los pedidos de prueba ─────────────────────────────────────────
--
-- Cada renglon se manda a uno de los cinco productos con existencia de sobra,
-- repartidos por el id del renglon para que no acaben todos en el mismo. "Ultima
-- pieza" se queda fuera del reparto: sirve para provocar un conflicto a
-- proposito, no para que aparezca en 203 renglones y lo provoque siempre.
--
-- El precio del renglon NO se toca. Es lo que se cobro, y cambiarlo descuadraria
-- el total del pedido contra lo que Stripe retuvo o contra el saldo gastado.

UPDATE sale_items si
  JOIN bisonte_orders bo ON bo.sale_id = si.sale_id
  JOIN (
      SELECT MIN(id) AS base FROM products WHERE es_prueba = 1 AND stock > 900
  ) p ON 1 = 1
   SET si.product_id = p.base + (si.id % 5)
 WHERE bo.es_prueba = 1;


-- ── Comprobar ───────────────────────────────────────────────────────────────
--
-- La primera tiene que dar 0: ningun pedido de prueba debe seguir apuntando a
-- mercancia real.

SELECT 'renglones de prueba sobre producto real' AS que, COUNT(*) AS cuantos
  FROM sale_items si
  JOIN bisonte_orders bo ON bo.sale_id = si.sale_id
  JOIN products p ON p.id = si.product_id
 WHERE bo.es_prueba = 1 AND p.es_prueba = 0
UNION ALL
SELECT 'productos de prueba creados', COUNT(*) FROM products WHERE es_prueba = 1
UNION ALL
SELECT 'renglones apuntando a prueba', COUNT(*)
  FROM sale_items si
  JOIN bisonte_orders bo ON bo.sale_id = si.sale_id
  JOIN products p ON p.id = si.product_id
 WHERE bo.es_prueba = 1 AND p.es_prueba = 1;
