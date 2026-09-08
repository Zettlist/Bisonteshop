-- =============================================================================
--  Cierre de una preventa: entrega y cancelacion
--  2026-09-08
--
--  Complemento de 2026-09-07-preventas-desde-cotizacion.sql, que dejo la
--  entrada del circuito hecha y la salida sin hacer.
--
--  Desde aquella migracion una preventa compromete piezas de verdad: sube
--  `products.preventa_reservada` mientras el pedido viene en camino y, cuando
--  el pedido llega, esa pieza se queda deliberadamente FUERA del stock porque
--  ya tiene dueño. Lo que faltaba era el camino de vuelta. `pre_orders.status`
--  declaraba 'cancelled' y 'delivered' desde el primer dia y nada en el backend
--  los escribia nunca, asi que una preventa capturada por error dejaba el
--  contador arriba para siempre y, al arribar el pedido, esa pieza no entraba
--  al stock de nadie: existia en la bodega y no en el sistema.
--
--  Esta migracion solo añade la fecha del cierre. Quien lo escribe son las dos
--  rutas nuevas (POST /api/preventas/:id/entregar y /:id/cancelar) y el job
--  nocturno, que a partir de ahora si devuelve al stock la pieza de lo vencido.
--
--  Se aplica UNA VEZ y a mano (ver db/README.md).
-- =============================================================================

-- ── 0. Antes de tocar nada ───────────────────────────────────────────────────
-- Tiene que salir 0. Si sale cualquier otra cosa, alguien escribio esos estados
-- fuera del backend y el paso 2 fallaria: el backfill del paso 1 les pone
-- `updated_at` como fecha de cierre, que es lo mas cercano que hay, pero solo
-- funciona si `updated_at` no es NULL.
-- SELECT COUNT(*) FROM pre_orders
--  WHERE status IN ('cancelled','delivered') AND updated_at IS NULL;


-- ── 1. La fecha del cierre ───────────────────────────────────────────────────
ALTER TABLE pre_orders
    ADD COLUMN cerrado_at DATETIME NULL AFTER expired_at;

-- Nada deberia entrar aqui (nunca hubo quien escribiera esos estados), pero si
-- alguna fila los trae de una carga manual, el CHECK del paso 2 la rechazaria.
UPDATE pre_orders
   SET cerrado_at = updated_at
 WHERE status IN ('cancelled','delivered') AND cerrado_at IS NULL;


-- ── 2. Un cierre siempre tiene fecha ─────────────────────────────────────────
-- Cerrar mueve inventario. Sin fecha no hay forma de auditar ese movimiento ni
-- de distinguir lo que se cerro hoy de lo que lleva medio año cerrado.
ALTER TABLE pre_orders
    ADD CONSTRAINT chk_po_cierre CHECK (status NOT IN ('cancelled','delivered')
                                        OR cerrado_at IS NOT NULL);


-- ── 3. Comprobacion ──────────────────────────────────────────────────────────
-- a) La columna y el CHECK existen
-- SHOW COLUMNS FROM pre_orders LIKE 'cerrado_at';
-- SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
--  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pre_orders'
--    AND CONSTRAINT_NAME = 'chk_po_cierre';

-- b) Descuadres de `preventa_reservada`, que es lo que las rutas nuevas
--    corrigen de aqui en adelante. Antes de esta migracion no habia forma de
--    bajar ese contador, asi que si la tienda ya cancelo preventas "a mano"
--    (borrando la fila) el contador quedo alto. Lo que salga aqui hay que
--    ajustarlo una vez, a mano, antes de que arriben esos pedidos:
--
-- SELECT p.id, p.name, p.preventa_reservada, COALESCE(v.comprometido, 0) AS real
--   FROM products p
--   LEFT JOIN (
--       SELECT product_id, SUM(quantity) AS comprometido
--         FROM pre_orders
--        WHERE product_id IS NOT NULL
--          AND status IN ('pending','paid')
--          AND arrived_at IS NULL
--        GROUP BY product_id
--   ) v ON v.product_id = p.id
--  WHERE p.estado = 'preventa'
--    AND p.preventa_reservada <> COALESCE(v.comprometido, 0);
