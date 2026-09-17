-- Permiso para que la tienda web pueda CREAR apartados.
--
-- Hasta hoy el apartado nacia siempre en el mostrador y la web solo podia
-- leerlo y sumarle dinero. Con el boton "Apartar" de la ficha del producto, la
-- fila la escribe la tienda: hacen falta el INSERT en el apartado y en su
-- renglon, y el contador de folios.
--
-- Sin esto, la ruta de crear apartados contesta "no pudimos registrar el
-- apartado" a todo el mundo: el cobro se suelta y nadie puede apartar nada.
--
-- Nada de esto amplia lo que la tienda puede hacer con el inventario: separar
-- la pieza usa `products.stock_reservado`, que ya tenia concedido, y el CHECK
-- (stock_reservado <= stock) sigue siendo quien impide apartar de mas. Tampoco
-- puede cerrar un apartado ni borrarlo: eso sigue siendo del POS.
--
-- Estas sentencias necesitan root (bloque 4 del archivo de credenciales):
-- torlan_user no puede repartir permisos, a proposito.
--
--   cloud-sql-proxy --gcloud-auth --port=3307 torlan-web:us-central1:torlan-mysql
--   $env:DB_MIGRADOR_USER = 'root'
--   $env:DB_MIGRADOR_PASSWORD = '...'
--   node db/aplicar-migracion.mjs db/migrations/2026-09-17-permisos-apartado-web.sql --aplicar
--
-- Se puede volver a correr sin miedo: conceder un permiso que ya esta concedido
-- no hace nada.

GRANT INSERT ON torlan_pos.anticipos      TO 'bisonte_app'@'%';
GRANT INSERT ON torlan_pos.anticipo_items TO 'bisonte_app'@'%';

-- El contador de folios (AP-000123) es un INSERT ... ON DUPLICATE KEY UPDATE
-- sobre una fila por empresa, de ahi los tres permisos. Sin DELETE: borrar esa
-- fila reiniciaria la numeracion y repetiria folios ya entregados.
GRANT SELECT, INSERT, UPDATE ON torlan_pos.apartado_sequences TO 'bisonte_app'@'%';

FLUSH PRIVILEGES;
