-- =============================================================================
--  product_reviews: la tabla que sostiene products.rating
--  2026-09-07
--
--  La tabla esta declarada en db/schema.sql desde que se agrego el sistema de
--  opiniones, pero nunca se creo en la base de produccion: schema.sql describe
--  como deberia verse una base recien hecha, y la de produccion ya existia.
--
--  Sin ella, POST y DELETE de /api/productos/[id]/opinion fallan con
--  ER_NO_SUCH_TABLE: son las dos unicas rutas que la tocan. La tienda solo lee
--  products.rating y products.rating_count para pintar las estrellas, asi que
--  el catalogo se ve bien y el fallo no aparece hasta que alguien vota.
--
--  Las estrellas sembradas de scripts/seed-ratings.js NO viven aqui: ese script
--  escribe products.rating directamente, a proposito, para que lo inventado no
--  se mezcle con las opiniones de verdad. Esta migracion no las toca ni las
--  convierte en opiniones; se siguen quitando con --quitar antes de publicar.
--
--  Se aplica UNA VEZ y a mano, como el resto: el esquema no se migra en el
--  arranque de la aplicacion.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Paso 0 — comprobacion previa. Descomentar y correr antes de aplicar.
--
--  Debe devolver 0. Si devuelve 1 la tabla ya existe y esta migracion sobra.
--
--  SELECT COUNT(*) AS ya_existe
--    FROM information_schema.tables
--   WHERE table_schema = DATABASE() AND table_name = 'product_reviews';
--
--  Y estas dos deben devolver filas: las claves foraneas no se pueden crear si
--  las tablas a las que apuntan no estan.
--
--  SELECT COUNT(*) AS hay_products FROM products;
--  SELECT COUNT(*) AS hay_clientes FROM clientes;
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
--  Paso 1 — la tabla. Copia literal de db/schema.sql, para que la base y el
--  esquema declarado digan lo mismo y un diff entre los dos salga limpio.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_reviews (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    product_id  INT NOT NULL,
    cliente_id  INT NOT NULL,
    rating      TINYINT NOT NULL,
    -- Hoy la tienda solo pide estrellas. La columna se crea desde el principio
    -- para que agregar el comentario despues no obligue a migrar una tabla que
    -- ya tendra opiniones dentro.
    comentario  TEXT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id)  ON DELETE CASCADE,
    CONSTRAINT fk_reviews_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)  ON DELETE CASCADE,
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    -- Una opinion por persona y producto: se cambia, no se acumula.
    UNIQUE KEY uniq_review (product_id, cliente_id),
    INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
--  Paso 2 — permisos: aqui no hay ninguno que dar, y conviene decir por que.
--
--  db/grants.sql reparte la base entre `pos_app` y `bisonte_app`, y por ese
--  reparto esta tabla seria solo de `bisonte_app`: el POS no la lee ni la
--  necesita. Pero ese reparto todavia no esta aplicado en produccion — ahi los
--  dos servicios entran como `torlan_user`, que puede con toda la base. Un
--  GRANT a `bisonte_app` fallaria porque ese usuario aun no existe.
--
--  Cuando se apliquen los grants, la linea que le toca a esta tabla es:
--    GRANT SELECT, INSERT, UPDATE, DELETE ON torlan_pos.product_reviews
--       TO 'bisonte_app'@'%';
--  y a `pos_app` no se le da nada sobre ella.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
--  Paso 3 — verificacion. Descomentar y correr despues de aplicar.
--
--  La tabla, con sus tres restricciones:
--  SHOW CREATE TABLE product_reviews;
--
--  Debe devolver 0 filas y ningun error. Que no falle es el punto: antes de
--  esta migracion la misma consulta moria con ER_NO_SUCH_TABLE.
--  SELECT COUNT(*) AS opiniones FROM product_reviews;
--
--  Los promedios sembrados siguen intactos y sin ninguna opinion detras, que es
--  lo esperado hasta que alguien vote de verdad:
--  SELECT COUNT(*) AS con_nota_sembrada FROM products WHERE rating IS NOT NULL;
-- -----------------------------------------------------------------------------
