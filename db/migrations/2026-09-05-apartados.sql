-- =============================================================================
--  Apartados con vencimiento
--  2026-09-05
--
--  Lleva la tabla `anticipos` de produccion al estado que describe schema.sql:
--  folio, tipo, cliente, plazo, vencimiento y avisos.
--
--  Se aplica UNA VEZ y a mano (ver db/README.md y backend/migrations/README.md:
--  el esquema no se migra en el arranque de la aplicacion). Corre dentro de una
--  transaccion salvo los ALTER, que en MySQL hacen commit implicito — por eso
--  el orden importa y por eso estan las comprobaciones previas.
--
--  Lo mas delicado que hace: cambiar como se separa el stock. Hasta ahora un
--  apartado bajaba `products.stock`; a partir de aqui sube `stock_reservado` y
--  deja el stock fisico intacto. Para los apartados vivos se revierte lo uno y
--  se aplica lo otro, de forma que `stock_disponible` no cambia — lo que se
--  corrige es el stock fisico, que estaba contando de menos mercancia que si
--  esta en la tienda.
-- =============================================================================

-- ── 0. Antes de tocar nada ───────────────────────────────────────────────────
-- Estas tres consultas tienen que salir en cero. Si alguna devuelve filas, los
-- CHECK del paso 3 van a fallar y hay que arreglar esos datos primero.

--   a) Apartados con mas abonado que su total
-- SELECT id, total_amount, paid_amount FROM anticipos WHERE paid_amount > total_amount;

--   b) Apartados con abono negativo
-- SELECT id, paid_amount FROM anticipos WHERE paid_amount < 0;

--   c) Renglones con cantidad cero o negativa
-- SELECT id, anticipo_id, quantity FROM anticipo_items WHERE quantity <= 0;

-- Y esta conviene guardarla: es el inventario de los apartados vivos ANTES del
-- cambio, para poder comparar despues del paso 5.
-- SELECT p.id, p.name, p.stock, p.stock_reservado
--   FROM products p
--   JOIN anticipo_items ai ON ai.product_id = p.id
--   JOIN anticipos a ON a.id = ai.anticipo_id AND a.status = 'pending';


-- ── 1. Contador de folios ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apartado_sequences (
    empresa_id INT NOT NULL,
    next_seq   INT UNSIGNED NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (empresa_id),
    CONSTRAINT fk_aseq_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2. Columnas nuevas ───────────────────────────────────────────────────────
-- `folio` y `expires_at` entran NULL para poder rellenarlos; se vuelven NOT NULL
-- en el paso 4, cuando ya no queda ninguno vacio.
ALTER TABLE anticipos
    ADD COLUMN folio            VARCHAR(20) NULL AFTER empresa_id,
    ADD COLUMN tipo             ENUM('normal','preventa') NOT NULL DEFAULT 'normal' AFTER folio,
    ADD COLUMN cliente_id       INT NULL AFTER tipo,
    ADD COLUMN customer_email   VARCHAR(255) NULL AFTER customer_phone,
    ADD COLUMN dias_plazo       SMALLINT UNSIGNED NOT NULL DEFAULT 15 AFTER paid_amount,
    ADD COLUMN expires_at       DATETIME NULL AFTER dias_plazo,
    ADD COLUMN revisar_manual   TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
    ADD COLUMN aviso_previo_at  DATETIME NULL AFTER revisar_manual,
    ADD COLUMN aviso_vencido_at DATETIME NULL AFTER aviso_previo_at,
    ADD COLUMN expired_at       DATETIME NULL AFTER aviso_vencido_at,
    ADD COLUMN sale_id          INT NULL AFTER expired_at;

-- El telefono pasa de 20 a 30: es el ancho que usa `clientes.telefono` y un
-- numero con lada internacional no cabia.
ALTER TABLE anticipos MODIFY COLUMN customer_phone VARCHAR(30) NULL;

-- 'expired' es un estado nuevo: distinto de 'cancelled' (lo cancelo la tienda)
-- porque el vencimiento no es una decision, es que se acabo el plazo.
ALTER TABLE anticipos
    MODIFY COLUMN status ENUM('pending','completed','cancelled','expired') NOT NULL DEFAULT 'pending';

ALTER TABLE anticipos MODIFY COLUMN paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS anticipo_payments (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    anticipo_id    INT NOT NULL,
    amount         DECIMAL(10,2) NOT NULL,
    payment_method ENUM('cash','card') NOT NULL DEFAULT 'cash',
    created_by     INT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes          VARCHAR(255) NULL,
    CONSTRAINT fk_ap_anticipo FOREIGN KEY (anticipo_id) REFERENCES anticipos(id) ON DELETE CASCADE,
    CONSTRAINT fk_ap_user     FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_ap_amount  CHECK (amount > 0),
    INDEX idx_anticipo (anticipo_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 3. Relleno de los datos ──────────────────────────────────────────────────
START TRANSACTION;

-- Folio por empresa, en el orden en que se crearon los apartados.
--
-- Con ROW_NUMBER() y no con variables de usuario (@seq := ...): ese truco
-- depende de que el optimizador evalue las filas en el orden del ORDER BY, cosa
-- que MySQL 8 no garantiza — y cuando no lo hace, la numeracion sale barajada
-- sin dar ningun error.
UPDATE anticipos a
  JOIN (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY id) AS seq
          FROM anticipos
  ) n ON n.id = a.id
   SET a.folio = CONCAT('AP-', LPAD(n.seq, 6, '0'));

-- El contador arranca donde termino el relleno, para que el proximo apartado
-- no repita folio.
INSERT INTO apartado_sequences (empresa_id, next_seq)
SELECT empresa_id, COUNT(*) FROM anticipos GROUP BY empresa_id
ON DUPLICATE KEY UPDATE next_seq = VALUES(next_seq);

-- Vencimiento: 15 dias desde que se creo, que es la politica que aplicaba de
-- palabra aunque no estuviera en la base.
UPDATE anticipos SET expires_at = DATE_ADD(created_at, INTERVAL 15 DAY) WHERE expires_at IS NULL;

-- Los que con esa cuenta ya estarian vencidos NO los devuelve el cron: quedan
-- marcados para que una persona los revise uno por uno. Son apartados hechos
-- bajo condiciones que no incluian una fecha limite; devolverlos a stock esa
-- misma noche seria cambiarle las reglas a alguien que no estaba enterado.
UPDATE anticipos
   SET revisar_manual = 1
 WHERE status = 'pending' AND expires_at < NOW();

-- Enlaza con la cuenta de la tienda cuando el correo coincide. Los que no
-- casen se quedan con nombre y telefono sueltos, que es como estaban.
UPDATE anticipos a
  JOIN clientes c ON c.empresa_id = a.empresa_id AND c.email = a.customer_email
   SET a.cliente_id = c.id
 WHERE a.cliente_id IS NULL AND a.customer_email IS NOT NULL;

-- Un renglon de abono por lo ya cobrado, para que el detalle no muestre un
-- pagado sin ningun pago detras. No se inventa fecha ni cajero: created_at del
-- apartado y `created_by` en NULL.
INSERT INTO anticipo_payments (anticipo_id, amount, payment_method, created_by, created_at, notes)
SELECT id, paid_amount, 'cash', NULL, created_at, 'Saldo previo a la migracion'
  FROM anticipos
 WHERE paid_amount > 0;

COMMIT;


-- ── 4. Ahora si, las restricciones ───────────────────────────────────────────
ALTER TABLE anticipos
    MODIFY COLUMN folio      VARCHAR(20) NOT NULL,
    MODIFY COLUMN expires_at DATETIME NOT NULL;

ALTER TABLE anticipos
    ADD CONSTRAINT fk_ant_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_ant_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE SET NULL,
    ADD CONSTRAINT chk_ant_pagado   CHECK (paid_amount >= 0 AND paid_amount <= total_amount),
    ADD CONSTRAINT chk_ant_anticipo CHECK (status <> 'pending' OR paid_amount > 0 OR revisar_manual = 1),
    ADD CONSTRAINT chk_ant_plazo    CHECK (dias_plazo > 0),
    ADD UNIQUE KEY uniq_empresa_folio (empresa_id, folio),
    ADD INDEX idx_vencimiento (empresa_id, status, expires_at),
    ADD INDEX idx_cliente (cliente_id, created_at);

ALTER TABLE anticipo_items ADD CONSTRAINT chk_ai_qty CHECK (quantity > 0);


-- ── 5. El stock, de descontado a reservado ───────────────────────────────────
-- Solo los apartados vivos: los liquidados ya salieron de la tienda y los
-- cancelados devolvieron su mercancia con el codigo viejo.
--
-- Sube las dos columnas la misma cantidad, asi que `stock_disponible` (que es
-- stock - stock_reservado) no se mueve ni un articulo. Lo que se repara es el
-- stock fisico: la mercancia apartada esta en la tienda y estaba contada como
-- si no existiera.
START TRANSACTION;

UPDATE products p
  JOIN (
        SELECT ai.product_id, SUM(ai.quantity) AS apartado
          FROM anticipo_items ai
          JOIN anticipos a ON a.id = ai.anticipo_id
         WHERE a.status = 'pending'
         GROUP BY ai.product_id
  ) r ON r.product_id = p.id
   SET p.stock           = p.stock + r.apartado,
       p.stock_reservado = p.stock_reservado + r.apartado;

COMMIT;


-- ── 6. Comprobacion ──────────────────────────────────────────────────────────
-- Ningun apartado sin folio ni vencimiento:
-- SELECT COUNT(*) FROM anticipos WHERE folio IS NULL OR expires_at IS NULL;
--
-- Lo reservado por apartados vivos coincide con lo que dicen los productos
-- (puede ser mayor si hay pedidos web reservando, no menor):
-- SELECT p.id, p.name, p.stock, p.stock_reservado, r.apartado
--   FROM products p
--   JOIN (SELECT ai.product_id, SUM(ai.quantity) apartado
--           FROM anticipo_items ai JOIN anticipos a ON a.id = ai.anticipo_id
--          WHERE a.status = 'pending' GROUP BY ai.product_id) r ON r.product_id = p.id
--  WHERE p.stock_reservado < r.apartado;
--
-- Que hay que revisar a mano:
-- SELECT folio, customer_name, created_at, expires_at, total_amount, paid_amount
--   FROM anticipos WHERE revisar_manual = 1 ORDER BY expires_at;
