-- =============================================================================
--  Aislamiento entre la tienda y el POS SIN separar bases de datos.
--
--  Separar en dos bases romperia el auto-sync de inventario: hoy el POS escribe
--  en `products` y la tienda lo lee en la misma transaccion, sin job ni webhook.
--  El riesgo real de compartir base no es leer de mas, es que una app corrompa
--  el dominio de la otra. Eso se acota con permisos, no con dos servidores.
--
--  Sustituir las contrasenas antes de ejecutar. Guardarlas en Bitwarden.
-- =============================================================================

-- ── App tienda (Next.js / Cloud Run) ────────────────────────────────────────
CREATE USER IF NOT EXISTS 'bisonte_app'@'%' IDENTIFIED BY 'CAMBIAR_ANTES_DE_EJECUTAR';

-- Dominio propio: escribe libremente
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.clientes            TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.user_addresses      TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.carts               TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.cart_items          TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.bisonte_orders      TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE          ON torlan_pos.integration_outbox TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.coupon_redemptions  TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.credit_history      TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.user_notifications  TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.event_votes         TO 'bisonte_app'@'%';

-- event_results guarda el ganador del evento y el codigo de descuento que se
-- reparte. Lo escribe /api/eventos/mundial (PATCH), que pide la clave de admin,
-- con INSERT ... ON DUPLICATE KEY UPDATE -- de ahi las dos, INSERT y UPDATE.
-- Con solo SELECT, como estaba, cerrar el evento habria fallado.
GRANT SELECT, INSERT, UPDATE          ON torlan_pos.event_results      TO 'bisonte_app'@'%';

-- Opiniones de producto. La tabla es solo de la tienda: el POS no la lee ni la
-- necesita, y por eso `pos_app` no recibe nada sobre ella mas abajo. Quien vota
-- puede cambiar su nota o retirarla, de ahi el UPDATE y el DELETE.
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.product_reviews     TO 'bisonte_app'@'%';

-- La venta web nace en la tienda, por eso necesita INSERT en sales/sale_items.
GRANT SELECT, INSERT, UPDATE          ON torlan_pos.sales              TO 'bisonte_app'@'%';
GRANT SELECT, INSERT                  ON torlan_pos.sale_items         TO 'bisonte_app'@'%';

-- Cupones: puede leerlos y subir usage_count, no crearlos ni borrarlos.
GRANT SELECT, UPDATE                  ON torlan_pos.coupons            TO 'bisonte_app'@'%';

-- Inventario y catalogo: SOLO LECTURA. La tienda no puede corromper el stock
-- ni por bug ni por accidente; ese dominio es del POS.
GRANT SELECT ON torlan_pos.products   TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.categories TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.publishers TO 'bisonte_app'@'%';

-- Unica excepcion, a nivel de columna: la tienda reserva al confirmar el
-- checkout, porque ahi es donde se compromete la mercancia. Puede tocar
-- stock_reservado y NADA mas de products -- ni el stock fisico ni el precio.
-- El CHECK (stock_reservado <= stock) impide que reserve de mas.
GRANT UPDATE (stock_reservado) ON torlan_pos.products TO 'bisonte_app'@'%';

-- Segunda excepcion, tambien por columna: al guardar una opinion la tienda
-- recalcula el promedio del producto en la misma transaccion. Son columnas
-- derivadas de `product_reviews`, que es suya, asi que le tocan a ella. Sigue
-- sin poder cambiar precio, stock ni nada mas de la ficha.
GRANT UPDATE (rating, rating_count) ON torlan_pos.products TO 'bisonte_app'@'%';

GRANT SELECT ON torlan_pos.suppliers         TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.empresas          TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.tags              TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.product_tags      TO 'bisonte_app'@'%';

-- Apartados: la tienda los muestra en «Mis apartados» y nada mas. Se crean
-- y se cobran en el mostrador, asi que aqui no hay INSERT ni UPDATE.
GRANT SELECT ON torlan_pos.anticipos         TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.anticipo_items    TO 'bisonte_app'@'%';

-- Tercera excepcion por columna, y la mas incomoda. La venta web se registra a
-- nombre de un usuario del POS, y el checkout lo busca asi:
--
--   SELECT id FROM users WHERE empresa_id = ? ORDER BY id ASC LIMIT 1
--
-- (app/api/checkout/confirm/route.js). No es un camino raro: es el que se toma
-- siempre, porque WEB_USER_ID no esta puesta en el servicio de Cloud Run. Sin
-- este permiso NINGUN checkout se completa.
--
-- Se concede por columna a proposito. `users` guarda el personal del POS con
-- sus hashes de contraseña, y la tienda no tiene por que verlos: con (id,
-- empresa_id) le basta para lo unico que hace.
--
-- Lo limpio seria poner WEB_USER_ID en el servicio y retirar hasta esto. Queda
-- apuntado; mientras no este, este GRANT es obligatorio.
GRANT SELECT (id, empresa_id) ON torlan_pos.users TO 'bisonte_app'@'%';

-- ── App POS (backend Express) ───────────────────────────────────────────────
CREATE USER IF NOT EXISTS 'pos_app'@'%' IDENTIFIED BY 'CAMBIAR_ANTES_DE_EJECUTAR';

GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.empresas           TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.users              TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.features           TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.user_features      TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.suppliers          TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.products           TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.categories        TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.publishers         TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.sales              TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.sale_items         TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.cash_sessions      TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.sales_goals        TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.business_settings  TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.global_changes_log TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.anticipos          TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.anticipo_items     TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.anticipo_payments  TO 'pos_app'@'%';
-- Contador de folios: se lee y se incrementa, nunca se borra una fila.
GRANT SELECT, INSERT, UPDATE         ON torlan_pos.apartado_sequences TO 'pos_app'@'%';
-- Preventas: pedidos en camino. Solo el POS los toca; la tienda web no los
-- muestra en ninguna parte todavia.
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.pre_orders         TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.pre_order_payments TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.pre_order_batches  TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.coupons            TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.tags               TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.product_tags       TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.event_results      TO 'pos_app'@'%';

-- El POS mueve el pedido web por sus estados y encola los cobros hacia la
-- tienda, pero no lo crea: eso nace en el checkout.
GRANT SELECT, UPDATE                 ON torlan_pos.bisonte_orders     TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE         ON torlan_pos.integration_outbox TO 'pos_app'@'%';

-- Datos personales de compradores: solo lectura para atencion a clientes.
GRANT SELECT ON torlan_pos.clientes       TO 'pos_app'@'%';
GRANT SELECT ON torlan_pos.user_addresses TO 'pos_app'@'%';

-- ── Modulos del POS que faltaban por completo ───────────────────────────────
-- Once tablas que el backend usa en rutas vivas y que este archivo no nombraba.
-- No es que estuvieran mal concedidas: no estaban. Con los permisos tal y como
-- estaban escritos, Cotizaciones, ERP, Formatos, Creditos de Tienda y el
-- generador de codigos de barras respondian 500 en cuanto se tocaban.

-- Cotizaciones. Cinco tablas y un contador de folios. La tienda no las ve.
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.cotizaciones                    TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.cotizacion_items                TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.cotizacion_proveedores          TO 'pos_app'@'%';
GRANT SELECT, INSERT                 ON torlan_pos.cotizacion_proveedor_conceptos  TO 'pos_app'@'%';
-- Contador de folios: se lee y se incrementa, nunca se borra una fila. Mismo
-- criterio que apartado_sequences.
GRANT SELECT, INSERT, UPDATE         ON torlan_pos.cotizacion_folios               TO 'pos_app'@'%';

-- Pedidos al proveedor (routes/erp.js).
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.erp_pedidos        TO 'pos_app'@'%';

-- Formatos de producto (tomo, tapa dura, edicion especial...).
GRANT SELECT, INSERT, DELETE         ON torlan_pos.product_formats     TO 'pos_app'@'%';

-- Creditos de tienda: el saldo a favor y donde se gasto.
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.store_credits       TO 'pos_app'@'%';
GRANT SELECT, INSERT                 ON torlan_pos.store_credit_uses   TO 'pos_app'@'%';

-- Contador de codigos de barras (utils/barcodeGenerator.js). Solo crece.
GRANT SELECT, INSERT, UPDATE         ON torlan_pos.barcode_sequences   TO 'pos_app'@'%';

-- Votos de eventos: el POS los LEE para ver el reparto, la tienda es quien los
-- recibe. De ahi que aqui solo haya SELECT.
GRANT SELECT                         ON torlan_pos.event_votes         TO 'pos_app'@'%';

-- Nota sobre lo que deliberadamente NO se concede: `DELETE ON bisonte_orders`.
-- Lo usa backend/clean_web_orders.js, que es una herramienta de mantenimiento
-- que corre una persona a mano, no el servidor. Si alguna vez hace falta, se
-- corre con una cuenta administrativa; la aplicacion no borra pedidos web.

FLUSH PRIVILEGES;
