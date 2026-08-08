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
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.bisonte_shipments   TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.coupon_redemptions  TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.credit_history      TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.user_notifications  TO 'bisonte_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.event_votes         TO 'bisonte_app'@'%';
GRANT SELECT                          ON torlan_pos.event_results      TO 'bisonte_app'@'%';

-- La venta web nace en la tienda, por eso necesita INSERT en sales/sale_items.
GRANT SELECT, INSERT, UPDATE          ON torlan_pos.sales              TO 'bisonte_app'@'%';
GRANT SELECT, INSERT                  ON torlan_pos.sale_items         TO 'bisonte_app'@'%';

-- Cupones: puede leerlos y subir usage_count, no crearlos ni borrarlos.
GRANT SELECT, UPDATE                  ON torlan_pos.coupons            TO 'bisonte_app'@'%';

-- Inventario y catalogo: SOLO LECTURA. La tienda no puede corromper el stock
-- ni por bug ni por accidente; ese dominio es del POS.
GRANT SELECT ON torlan_pos.products          TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.product_suppliers TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.suppliers         TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.empresas          TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.tags              TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.product_tags      TO 'bisonte_app'@'%';

-- ── App POS (backend Express) ───────────────────────────────────────────────
CREATE USER IF NOT EXISTS 'pos_app'@'%' IDENTIFIED BY 'CAMBIAR_ANTES_DE_EJECUTAR';

GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.empresas           TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.users              TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.features           TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.user_features      TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.suppliers          TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.products           TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.product_suppliers  TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.sales              TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.sale_items         TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.cash_sessions      TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.sales_goals        TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.business_settings  TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.global_changes_log TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.anticipos          TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.anticipo_items     TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.coupons            TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.tags               TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.product_tags       TO 'pos_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.event_results      TO 'pos_app'@'%';

-- El POS captura el pago y marca el envio, por eso escribe estas dos.
GRANT SELECT, UPDATE ON torlan_pos.bisonte_orders    TO 'pos_app'@'%';
GRANT SELECT, UPDATE ON torlan_pos.bisonte_shipments TO 'pos_app'@'%';

-- Datos personales de compradores: solo lectura para atencion a clientes.
GRANT SELECT ON torlan_pos.clientes       TO 'bisonte_app'@'%';
GRANT SELECT ON torlan_pos.user_addresses TO 'pos_app'@'%';

FLUSH PRIVILEGES;
