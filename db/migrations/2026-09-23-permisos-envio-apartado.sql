-- Permiso para que la tienda web pueda CERRAR un apartado al mandarlo.
--
-- Hasta hoy un apartado se cerraba en el mostrador: alguien entregaba la
-- mercancia y el POS ponia `status = 'completed'`. La tienda no tiene
-- mostrador, asi que un apartado liquidado se manda por paqueteria, y quien
-- recoge esa peticion es la web: el cliente pone su direccion, paga el envio
-- del dia y el apartado se convierte en un pedido de «Pedidos Página Web».
--
-- Para eso hay que escribir tres columnas del apartado: `status`, `sale_id`
-- (la venta que acaba de nacer) y `completed_at`.
--
-- `sale_id` es ademas el candado que impide mandar dos veces lo mismo: la
-- condicion `sale_id IS NULL` del UPDATE es lo unico que separa un envio de
-- dos paquetes cobrados por la misma mercancia.
--
-- Lo que esto NO amplia, y conviene tenerlo claro:
--
--   · la tienda sigue sin poder sacar mercancia del almacen. Cerrar el
--     apartado no toca `products.stock`: la pieza sigue separada en
--     `stock_reservado` y el stock fisico lo baja el POS al confirmar el
--     pedido, con la misma sentencia que usa para cualquier pedido web.
--   · no puede cambiar el total, el plazo, el vencimiento ni el cliente de un
--     apartado. Las columnas concedidas son exactamente cuatro.
--   · el UPDATE de la ruta exige `paid_amount >= total_amount`. Un apartado con
--     saldo no puede entrar a un envio: seria mandar mercancia pagada al 30%.
--
-- Estas sentencias necesitan root (bloque 4 del archivo de credenciales):
-- torlan_user no puede repartir permisos, a proposito.
--
--   cloud-sql-proxy --gcloud-auth --port=3307 torlan-web:us-central1:torlan-mysql
--   $env:DB_MIGRADOR_USER = 'root'
--   $env:DB_MIGRADOR_PASSWORD = '...'
--   node db/aplicar-migracion.mjs db/migrations/2026-09-23-permisos-envio-apartado.sql --aplicar
--
-- Se puede volver a correr sin miedo: conceder un permiso que ya esta
-- concedido no hace nada. `paid_amount` va en la lista aunque ya estuviera
-- concedido (migracion del 17/09) para que este archivo se lea como lo que la
-- tienda puede tocar de un apartado, entero y en un sitio.

GRANT UPDATE (paid_amount, status, sale_id, completed_at)
   ON torlan_pos.anticipos TO 'bisonte_app'@'%';

FLUSH PRIVILEGES;
