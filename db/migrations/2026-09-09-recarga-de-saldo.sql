-- =============================================================================
--  El saldo de tienda se puede comprar desde la tienda
--  2026-09-09
--
--  `clientes.store_credit` existe desde el principio y /api/checkout ya lo
--  descuenta solo. Lo que no existia era la puerta de entrada: nadie podia
--  subir ese numero desde la web. El boton "Comprar saldo" de Mi Cuenta
--  llevaba a /contacto, y el abono lo hacia la tienda a mano.
--
--  A partir de aqui la recarga se cobra con tarjeta en un dialogo dentro del
--  perfil (POST /api/credit/topup crea el cargo, POST /api/credit/confirm lo
--  acredita). Esta migracion solo añade el libro de esos cobros.
--
--  Se aplica UNA VEZ y a mano (ver db/README.md: el esquema no se migra en el
--  arranque de la aplicacion).
-- =============================================================================

-- ── 0. Antes de tocar nada ───────────────────────────────────────────────────
-- La tabla no deberia existir. Si sale una fila, la migracion ya esta puesta:
-- SELECT COUNT(*) FROM information_schema.TABLES
--  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'credit_topups';


-- ── 1. El libro de recargas ──────────────────────────────────────────────────
-- Esta tabla no guarda estado: guarda que un cobro concreto ya se acredito.
-- Todo su peso esta en el UNIQUE de `payment_intent_id`.
--
-- Quien pide el abono es el navegador, en cuanto Stripe aprueba la tarjeta.
-- Esa llamada se repite sola en la vida real -- doble clic, reintento tras un
-- error de red, un F5 con el dialogo abierto -- y siempre con el MISMO
-- PaymentIntent. Sin el UNIQUE, la segunda llamada sumaria saldo otra vez por
-- un cargo que solo se hizo una: dinero regalado, y sin rastro de por que.
-- Con el, la segunda choca contra la base y /api/credit/confirm contesta el
-- saldo que ya hay, que es la respuesta correcta.
--
-- `amount` es el credito en MXN, la moneda en la que vive `store_credit`.
-- `charged_amount` + `currency` son lo que la tarjeta vio: quien tenia la
-- tienda en dolares pago en USD al tipo de cambio del servidor, y sin guardar
-- esas dos columnas no habria forma de cuadrar el abono con el cobro de Stripe
-- el dia que un cliente reclame.
CREATE TABLE IF NOT EXISTS credit_topups (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id        INT NOT NULL,
    payment_intent_id VARCHAR(64) NOT NULL,
    amount            DECIMAL(10,2) NOT NULL,
    currency          ENUM('MXN','USD') NOT NULL DEFAULT 'MXN',
    charged_amount    DECIMAL(10,2) NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ct_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    CONSTRAINT chk_ct_amount CHECK (amount > 0),
    UNIQUE KEY uniq_ct_payment_intent (payment_intent_id),
    INDEX idx_ct_cliente_created (cliente_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── 2. Permisos ──────────────────────────────────────────────────────────────
-- Sin UPDATE ni DELETE: ver el comentario de db/grants.sql. Si la base de
-- produccion no usa todavia el usuario `bisonte_app`, este GRANT falla y no
-- pasa nada -- saltarlo.
GRANT SELECT, INSERT ON credit_topups TO 'bisonte_app'@'%';


-- ── 3. Comprobacion ──────────────────────────────────────────────────────────
-- a) La tabla y su UNIQUE existen
-- SHOW CREATE TABLE credit_topups;
--
-- b) Despues de la primera recarga de prueba, las tres cosas tienen que contar
--    lo mismo: una fila en el libro, un movimiento en el historial y el saldo
--    del cliente subido en esa cantidad.
-- SELECT t.cliente_id, t.amount, t.currency, t.charged_amount, c.store_credit
--   FROM credit_topups t JOIN clientes c ON c.id = t.cliente_id
--  ORDER BY t.created_at DESC LIMIT 5;
--
-- c) Ninguna recarga sin su movimiento en el historial (tienen que salir 0):
--    los dos se escriben en la misma transaccion, asi que un descuadre aqui
--    significa que alguien acredito saldo por fuera de /api/credit/confirm.
-- SELECT COUNT(*) FROM credit_topups t
--  WHERE NOT EXISTS (SELECT 1 FROM credit_history h
--                     WHERE h.cliente_id = t.cliente_id
--                       AND h.amount = t.amount
--                       AND h.created_at BETWEEN t.created_at - INTERVAL 5 SECOND
--                                            AND t.created_at + INTERVAL 5 SECOND);
