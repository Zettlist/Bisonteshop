-- =============================================================================
--  Preventas nacidas de una cotizacion
--  2026-09-07
--
--  Cierra el circuito que iba de la cotizacion al mostrador saltandose el
--  catalogo. Hasta ahora:
--
--    · Una cotizacion terminaba en un PDF con folio. Nada de lo que llevaba
--      dentro llegaba nunca a `products`: quien recibia la mercancia la volvia
--      a teclear.
--    · Una preventa (pre_orders) era un titulo escrito a mano, sin product_id.
--      La tienda web no podia venderla porque no habia nada que vender.
--    · "Preventa" en la tienda era una ETIQUETA. Quien la borrara sin querer
--      desde el alta de producto cambiaba el anticipo del 50% al 30% sin que
--      nada avisara.
--
--  A partir de aqui se acepta la propuesta de UN proveedor y sus renglones se
--  dan de alta como productos en estado 'preventa': aparecen en la tienda, se
--  pueden comprar y apartar, y no suman ni una pieza al stock. Cuando el pedido
--  llega, un solo boton pasa al stock lo que nadie compro y enciende Novedades.
--
--  Se aplica UNA VEZ y a mano (ver db/README.md: el esquema no se migra en el
--  arranque de la aplicacion). Los ALTER hacen commit implicito en MySQL, asi
--  que el orden importa y por eso las comprobaciones van primero.
--
--  REQUISITO: las cinco tablas de Cotizaciones tienen que existir ya. En
--  produccion las creo `TorlanPOS/backend/migrations/migrate_cotizaciones.js`;
--  en una base limpia las crea ahora `schema.sql`, que por fin las incluye.
--  Si faltan, el paso 3 falla con ER_CANT_CREATE_TABLE (errno 150).
--
--  DIVERGENCIA CONOCIDA, y no la arregla esta migracion: aquel script creo las
--  tablas SIN foraneas a `empresas` (solo con un indice), mientras que
--  schema.sql si las declara. Una base nueva las tendra y la de produccion no.
--  No se alinean aqui a proposito: añadir una foranea a una tabla con datos
--  falla si hay una sola fila huerfana, y eso es un problema aparte de este.
--  Lo que si hace falta para esta migracion — que `cotizaciones(id)`,
--  `cotizacion_items(id)` y `cotizacion_proveedores(id)` sean referenciables —
--  se cumple en las dos: son claves primarias.
-- =============================================================================

-- ── 0. Antes de tocar nada ───────────────────────────────────────────────────
-- Las tres tienen que salir en cero o los CHECK del paso 1 fallaran.

--   a) Preventas con cantidad imposible (la columna aun no existe: sale 0)
-- SELECT COUNT(*) FROM pre_orders WHERE balance < 0;

--   b) Renglones de cotizacion que darian una cantidad de cero al convertirlos
-- SELECT id, cotizacion_id, producto, unidades, piezas
--   FROM cotizacion_items WHERE unidades <= 0 OR piezas <= 0;

--   c) Cuantos productos van a quedar marcados como preventa por su etiqueta
-- SELECT p.id, p.name FROM products p
--   JOIN product_tags pt ON pt.product_id = p.id
--   JOIN tags t ON t.id = pt.tag_id
--  WHERE LOWER(t.name) = 'preventa';


-- ── 1. El estado del producto ────────────────────────────────────────────────
-- `estado` deja de ser una etiqueta y pasa a ser una columna, porque de el
-- depende el porcentaje del anticipo. 'Novedades' NO entra aqui: eso vive en
-- `events.novedad`, lleva tipo y fecha de fin, y lo usa la rotacion semanal.
--
-- Los contadores de preventa tienen la forma de stock/stock_reservado y estan
-- separados de ellos a proposito: `stock_reservado` compromete mercancia que
-- existe, y el CHECK (stock_reservado <= stock) rechazaria -- con razon --
-- reservar sobre un stock de cero, que es justo lo que es una preventa.

ALTER TABLE products
    ADD COLUMN estado ENUM('normal','preventa') NOT NULL DEFAULT 'normal' AFTER stock_disponible,
    ADD COLUMN preventa_cantidad  INT NOT NULL DEFAULT 0 AFTER estado,
    ADD COLUMN preventa_reservada INT NOT NULL DEFAULT 0 AFTER preventa_cantidad,
    ADD COLUMN preventa_disponible INT AS (preventa_cantidad - preventa_reservada) VIRTUAL
        AFTER preventa_reservada;

-- Backfill: lo que la tienda ya trataba como preventa lo seguira tratando
-- igual. `esPreventa` miraba la etiqueta, el genero y la categoria, asi que se
-- miran los tres — si no, un articulo marcado por categoria pasaria de golpe a
-- cobrar el 30% en vez del 50%.
--
-- No se les pone `preventa_cantidad`: nadie sabe cuantas piezas venian en
-- camino de aquellos, y un numero inventado se convertiria en stock el dia que
-- alguien marque una llegada. Se quedan en cero, que significa "en preventa y
-- sin piezas comprometidas", y es la verdad.
UPDATE products p
   SET p.estado = 'preventa'
 WHERE p.estado = 'normal'
   AND ( LOWER(COALESCE(p.gender,   '')) = 'preventa'
      OR LOWER(COALESCE(p.category, '')) = 'preventa'
      OR EXISTS (SELECT 1
                   FROM product_tags pt
                   JOIN tags t ON t.id = pt.tag_id
                  WHERE pt.product_id = p.id AND LOWER(t.name) = 'preventa') );

ALTER TABLE products
    ADD CONSTRAINT chk_products_pv_cantidad   CHECK (preventa_cantidad  >= 0),
    ADD CONSTRAINT chk_products_pv_reservada  CHECK (preventa_reservada >= 0),
    ADD CONSTRAINT chk_products_pv_disponible CHECK (preventa_reservada <= preventa_cantidad),
    ADD CONSTRAINT chk_products_pv_estado     CHECK (preventa_cantidad = 0 OR estado = 'preventa'),
    ADD INDEX idx_empresa_estado (empresa_id, estado);


-- ── 2. Cotizaciones: los CHECK que nunca tuvo ────────────────────────────────
-- Un renglon de cero unidades o de cero piezas se puede capturar hoy y al
-- convertirlo daria un pedido de cero articulos. Se rechaza en la base porque
-- el conversor del paso 3 confia en que la cantidad es positiva.
--
-- Si esto falla, es que el paso 0.b devolvia filas. Corregirlas y repetir.
ALTER TABLE cotizacion_items
    ADD CONSTRAINT chk_citem_unidades CHECK (unidades > 0),
    ADD CONSTRAINT chk_citem_piezas   CHECK (piezas   > 0);


-- ── 3. El pedido que nace de la cotizacion ───────────────────────────────────
-- Elegir proveedor es lo que convierte una lista de precios en mercancia
-- comprometida. El pedido guarda copia de lo aceptado (nombre, costo, moneda,
-- tipo de cambio) porque la propuesta se puede reescribir despues -- el PUT de
-- proveedores reemplaza la lista entera -- y lo que se pidio no cambia.

CREATE TABLE IF NOT EXISTS cotizacion_pedidos (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id    INT NOT NULL,
    cotizacion_id INT NOT NULL,
    proveedor_id  INT NULL,
    proveedor_nombre VARCHAR(255) NOT NULL,
    folio_str     VARCHAR(40) NULL,
    costo_total   DECIMAL(12,2) NOT NULL DEFAULT 0,
    moneda        ENUM('JPY','MXN') NOT NULL DEFAULT 'JPY',
    tipo_cambio   DECIMAL(10,4) NOT NULL DEFAULT 0,
    estado        ENUM('en_camino','arribado','cancelado') NOT NULL DEFAULT 'en_camino',
    arribado_at   DATETIME NULL,
    arribado_por  INT NULL,
    notas         TEXT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cped_empresa FOREIGN KEY (empresa_id)    REFERENCES empresas(id)               ON DELETE CASCADE,
    CONSTRAINT fk_cped_cotiz   FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id)           ON DELETE CASCADE,
    CONSTRAINT fk_cped_prov    FOREIGN KEY (proveedor_id)  REFERENCES cotizacion_proveedores(id) ON DELETE SET NULL,
    CONSTRAINT fk_cped_user    FOREIGN KEY (arribado_por)  REFERENCES users(id)                  ON DELETE SET NULL,
    CONSTRAINT chk_cped_arribo CHECK (estado <> 'arribado' OR arribado_at IS NOT NULL),
    INDEX idx_cped_cotiz    (cotizacion_id),
    INDEX idx_cped_abiertos (empresa_id, estado, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `producto_abierto` es lo que impide que un producto este en dos pedidos
-- abiertos a la vez. De eso depende que la llegada cuadre: al arribar, las
-- piezas que pasan al stock son `cantidad - preventa_reservada`, y esa resta
-- solo es correcta si el contador del producto pertenece a UN pedido.
--
-- MySQL no tiene indices parciales, asi que la condicion viaja en una columna
-- generada: vale el product_id mientras el renglon sigue vivo, y NULL cuando se
-- cierra. En un UNIQUE los NULL no chocan entre si, de modo que el mismo titulo
-- se puede volver a pedir la temporada siguiente.
--
-- `cerrado_at` se llama asi y no `arribado_at` porque un renglon se cierra de
-- dos maneras: porque el pedido llego o porque se cancelo. La fecha de llegada
-- de verdad es `cotizacion_pedidos.arribado_at`; guardar una aqui al cancelar
-- dejaria escrito que entro mercancia que nunca se mando.
CREATE TABLE IF NOT EXISTS cotizacion_pedido_items (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id          INT NOT NULL,
    cotizacion_item_id INT NULL,
    product_id         INT NOT NULL,
    cantidad           INT NOT NULL,
    cerrado_at         DATETIME NULL,
    producto_abierto   INT AS (IF(cerrado_at IS NULL, product_id, NULL)) VIRTUAL,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cpitem_pedido  FOREIGN KEY (pedido_id)          REFERENCES cotizacion_pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_cpitem_citem   FOREIGN KEY (cotizacion_item_id) REFERENCES cotizacion_items(id)   ON DELETE SET NULL,
    CONSTRAINT fk_cpitem_product FOREIGN KEY (product_id)         REFERENCES products(id)           ON DELETE CASCADE,
    CONSTRAINT chk_cpitem_cantidad CHECK (cantidad > 0),
    UNIQUE KEY uniq_cpitem_pedido_producto (pedido_id, product_id),
    UNIQUE KEY uniq_cpitem_abierto (producto_abierto),
    INDEX idx_cpitem_pedido (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 4. La preventa deja de ser un titulo escrito a mano ──────────────────────
-- Las columnas entran NULL o con default, y eso deja intactas las preventas que
-- ya estan en la tabla: siguen siendo encargos de mostrador, sin producto y sin
-- pedido, y se les marca la llegada una por una como hasta ahora.
--
-- `modalidad` es la separacion que pedia el panel: quien pago completo por
-- adelantado y quien dejo el 50%. El default es 'apartado' porque es lo que han
-- sido todas hasta hoy -- ninguna se cobro entera al registrarse.

ALTER TABLE pre_orders
    ADD COLUMN pedido_id  INT NULL AFTER batch_id,
    ADD COLUMN product_id INT NULL AFTER pedido_id,
    ADD COLUMN quantity   INT NOT NULL DEFAULT 1 AFTER product_id,
    ADD COLUMN modalidad  ENUM('compra','apartado') NOT NULL DEFAULT 'apartado' AFTER quantity,
    ADD COLUMN origen     ENUM('mostrador','tienda') NOT NULL DEFAULT 'mostrador' AFTER modalidad,
    ADD COLUMN cliente_id INT NULL AFTER origen;

-- Las que ya estaban liquidadas al completo son compras, no apartados: no deben
-- nada y no tiene sentido que el panel les reclame un saldo. El resto se quedan
-- como apartados, que es lo que son.
UPDATE pre_orders
   SET modalidad = 'compra'
 WHERE balance = 0 AND is_paid_in_full = 1;

ALTER TABLE pre_orders
    ADD CONSTRAINT fk_po_pedido  FOREIGN KEY (pedido_id)  REFERENCES cotizacion_pedidos(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_po_product FOREIGN KEY (product_id) REFERENCES products(id)           ON DELETE SET NULL,
    ADD CONSTRAINT fk_po_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)           ON DELETE SET NULL,
    ADD CONSTRAINT chk_po_cantidad CHECK (quantity > 0),
    ADD CONSTRAINT chk_po_compra   CHECK (modalidad <> 'compra' OR balance = 0),
    ADD INDEX idx_pedido  (pedido_id, product_id),
    ADD INDEX idx_product (product_id, status),
    ADD INDEX idx_cliente (cliente_id, created_at);


-- ── 5. Comprobacion ──────────────────────────────────────────────────────────
-- Productos que quedaron en preventa por el backfill. Repasar la lista: son los
-- que a partir de ahora cobran 50% de anticipo en la tienda.
-- SELECT id, name, estado, preventa_cantidad FROM products WHERE estado = 'preventa';
--
-- Ninguno con piezas en camino sin estar en preventa (lo impide el CHECK, pero
-- si el ALTER se aplico a medias conviene verlo):
-- SELECT COUNT(*) FROM products WHERE preventa_cantidad > 0 AND estado <> 'preventa';
--
-- Ninguna compra con saldo pendiente:
-- SELECT COUNT(*) FROM pre_orders WHERE modalidad = 'compra' AND balance <> 0;
--
-- El reparto que va a ver el panel:
-- SELECT modalidad, origen, status, COUNT(*) FROM pre_orders GROUP BY 1,2,3;
--
-- Lo comprometido segun las preventas vivas frente al contador del producto.
-- Tienen que coincidir; hoy sale vacio porque ninguna preventa vieja tiene
-- product_id, y eso es lo correcto:
-- SELECT p.id, p.name, p.preventa_reservada, r.vendido
--   FROM products p
--   JOIN (SELECT product_id, SUM(quantity) vendido
--           FROM pre_orders
--          WHERE product_id IS NOT NULL AND status IN ('pending','paid')
--          GROUP BY product_id) r ON r.product_id = p.id
--  WHERE p.preventa_reservada <> r.vendido;
