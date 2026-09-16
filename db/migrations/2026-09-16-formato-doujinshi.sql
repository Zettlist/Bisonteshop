-- =============================================================================
--  Formato de envio "Doujinshi"
--  2026-09-16
--
--  Doce productos tienen la categoria 'Doujinshi' y ninguno tenia formato de
--  envio. Once solo decian `dimensions = 'B5'` -- el tamaño del papel, sin
--  peso -- y se cotizaban con el peso supuesto de la tienda (250 g por pieza).
--
--  Las medidas del formato no son inventadas: salen del unico doujinshi del
--  catalogo que si tenia peso medido, "Akane wa Tsumare Somerareru":
--  18 x 0.3 x 26 cm y 104.7 g. Se redondean al tamaño B5 (18.2 x 25.7), que es
--  el que declaran los otros once, y a gramos enteros (la columna es INT).
--
--  Es UNA muestra. Un doujinshi mas grueso pesa mas: conviene pesar un par y
--  corregirlo desde Productos > Formatos de envio, que lo cambia para los doce
--  de golpe.
--
--  Se identifican por CATEGORIA y no por una lista de ids: un id escrito a mano
--  funciona hoy y deja fuera al doujinshi que se de de alta mañana. Y solo a
--  los que NO tienen formato: no se pisa uno que alguien eligio a proposito.
--
--  Datos de catalogo: basta torlan_user.
-- =============================================================================

-- El formato, en la empresa de esos productos. INSERT IGNORE porque (empresa,
-- nombre) es UNIQUE: correrlo dos veces no crea un duplicado ni falla.
INSERT IGNORE INTO product_formats (empresa_id, name, length_cm, width_cm, height_cm, weight_g)
SELECT DISTINCT empresa_id, 'Doujinshi', 18.2, 0.3, 25.7, 105
  FROM products
 WHERE category = 'Doujinshi' AND es_prueba = 0;

-- Asignarlo.
UPDATE products p
  JOIN product_formats f ON f.empresa_id = p.empresa_id AND f.name = 'Doujinshi'
   SET p.format_id = f.id
 WHERE p.category = 'Doujinshi'
   AND p.es_prueba = 0
   AND p.format_id IS NULL;

-- Comprobar: los doce, y ningun doujinshi sin formato.
SELECT p.id, p.name, f.name AS formato
  FROM products p
  LEFT JOIN product_formats f ON f.id = p.format_id
 WHERE p.category = 'Doujinshi' AND p.es_prueba = 0
 ORDER BY p.id;
