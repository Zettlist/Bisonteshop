-- =============================================================================
--  La tienda puede leer los formatos de envio
--  2026-09-16
--
--  La cotizacion de envio calculaba el paquete con una tabla fija por numero de
--  articulos: una pieza = 23x32x1 cm y 250 g, fuera un tankobon de 141 g o un
--  Monthly Comic Alive de 1,067 g. Las medidas reales estaban capturadas en
--  `product_formats` (38 productos) y la tienda no podia leerlas: la cuenta
--  `bisonte_app` no tenia permiso sobre esa tabla.
--
--  Solo lectura. Los formatos los da de alta el POS.
--
--  Necesita root: repartir permisos es lo unico que ni torlan_user puede hacer.
--  Tiene que aplicarse ANTES de desplegar el codigo que la usa, o la cotizacion
--  cae a la tabla fija (y lo deja en el log).
-- =============================================================================

GRANT SELECT ON torlan_pos.product_formats TO 'bisonte_app'@'%';

SHOW GRANTS FOR 'bisonte_app'@'%';
