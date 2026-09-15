-- =============================================================================
--  Limpieza de los datos de prueba, antes de abrir
--  2026-09-14
--
--  La tienda nunca ha abierto. Los 61 pedidos que hay se crearon probando, y el
--  cliente prueba.credito@bisonte.test tiene $31,990 de saldo falso que podria
--  gastarse de verdad.
--
--  ESTO BORRA DATOS Y NO SE PUEDE DESHACER.
--
--  Antes de correrlo, una comprobacion que vale mas que cualquier aviso: que no
--  haya entrado ningun pedido real. Tiene que devolver 0.
--
--      SELECT COUNT(*) FROM bisonte_orders WHERE es_prueba = 0;
--
--  Si devuelve otra cosa, PARA: alguien compro de verdad y esto ya no sirve
--  tal cual.
--
--  Como correrlo:
--
--      $env:DB_MIGRADOR_USER = 'root'
--      $env:DB_MIGRADOR_PASSWORD = '<la del bloque 4 de tus credenciales>'
--      node db/aplicar-migracion.mjs limpiar-datos-de-prueba.sql
--      node db/aplicar-migracion.mjs limpiar-datos-de-prueba.sql --aplicar
--
--  Sin --aplicar solo enseña lo que haria. Con root porque borrar en `clientes`
--  es lo unico que ni la tienda ni el POS pueden hacer, a proposito.
-- =============================================================================


-- ── Por que son solo dos DELETE ─────────────────────────────────────────────
--
-- Porque las claves foraneas ya hacen el resto. Comprobado en la base, no
-- supuesto:
--
--   sale_items        -> sales     CASCADE
--   bisonte_orders    -> sales     CASCADE
--   integration_outbox-> sales     CASCADE
--   shipment_events   -> bisonte_orders CASCADE
--   credit_history    -> clientes  CASCADE
--   credit_topups     -> clientes  CASCADE
--   carts, cart_items -> clientes  CASCADE
--   user_addresses    -> clientes  CASCADE
--
-- Escribir un DELETE por tabla seria repetir a mano lo que la base ya garantiza,
-- y cada linea de mas es una oportunidad de olvidarse de una o de borrar de mas.


-- ── 1. Las ventas de prueba ─────────────────────────────────────────────────
--
-- Se borra por `sales` y no por `bisonte_orders` porque al reves quedaria la
-- venta huerfana: la fila contable seguiria contando en los informes del POS
-- aunque el pedido web ya no exista.
--
-- Va ANTES que los clientes: `bisonte_orders -> clientes` es SET NULL, asi que
-- borrar primero al cliente dejaria sus pedidos sin dueño y ya no se sabria
-- cuales eran suyos.

DELETE s FROM sales s
  JOIN bisonte_orders bo ON bo.sale_id = s.id
 WHERE bo.es_prueba = 1;


-- ── 2. El cliente de prueba ─────────────────────────────────────────────────
--
-- Por el correo y no por el id. '@bisonte.test' es un dominio que no existe y
-- no puede ser el de nadie real; "borrar el cliente 5" funciona hoy y es una
-- trampa el dia que alguien copie la linea.
--
-- Las otras tres cuentas de la base son correos reales -- dos gmail y uno de
-- bisontemanga.com -- y NO se tocan.

DELETE FROM clientes WHERE email LIKE '%@bisonte.test';


-- ── 3. Comprobar ────────────────────────────────────────────────────────────
--
-- Las cuatro tienen que dar 0.

SELECT 'pedidos de prueba'     AS que, COUNT(*) AS quedan FROM bisonte_orders WHERE es_prueba = 1
UNION ALL SELECT 'eventos de envio',    COUNT(*) FROM shipment_events
UNION ALL SELECT 'clientes de prueba',  COUNT(*) FROM clientes WHERE email LIKE '%@bisonte.test'
UNION ALL SELECT 'cuentas con saldo',   COUNT(*) FROM clientes WHERE store_credit > 0;
