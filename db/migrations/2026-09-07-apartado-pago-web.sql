-- =============================================================================
--  El apartado se liquida en la web
--  2026-09-07
--
--  Hasta ahora el saldo de un apartado solo se podia cobrar en el mostrador, y
--  desde que el POS quito los botones «Abonar» y «Liquidar» no se podia cobrar
--  en ningun sitio: la web decia «pasa a liquidarlo» y en la caja no habia con
--  que. Mientras tanto el plazo de 15 dias seguia corriendo y la clausula 7.5
--  de los terminos se lleva el anticipo del cliente cuando vence.
--
--  Esta migracion abre el camino de cobro por la web. Son dos cambios sobre
--  `anticipo_payments` y ninguno toca lo que ya hay dentro.
--
--  Se aplica UNA VEZ y a mano (ver db/README.md): el esquema no se migra en el
--  arranque de la aplicacion.
--
--  Los ALTER de MySQL hacen commit implicito, asi que no van dentro de una
--  transaccion: no habria nada que revertir.
-- =============================================================================

-- ── 0. Antes de tocar nada ───────────────────────────────────────────────────
-- Tiene que salir en cero. Si devuelve filas hay abonos con un metodo que el
-- ENUM nuevo no contempla y el MODIFY los convertiria en cadena vacia.
-- SELECT id, payment_method FROM anticipo_payments
--  WHERE payment_method NOT IN ('cash', 'card');


-- ── 1. El dinero de la web no es «tarjeta» ───────────────────────────────────
-- `card` significa una cosa muy concreta para quien cierra la caja: ese importe
-- tiene que estar en la terminal del mostrador. El cobro por Stripe no pasa por
-- esa terminal ni por el cajon, y contarlo como `card` haria que el corte
-- buscara un dinero que nunca estuvo en la tienda.
--
-- Por eso un valor propio y no una nota en `notes`: el reporte de abonos suma
-- por `payment_method` (backend/utils/abonos.js), y lo que no distinga la
-- columna no lo puede separar el reporte.
ALTER TABLE anticipo_payments
    MODIFY COLUMN payment_method ENUM('cash', 'card', 'web') NOT NULL DEFAULT 'cash';


-- ── 2. La huella del cobro, y la unicidad que hace el reintento inofensivo ───
-- Un abono web nace de un PaymentIntent de Stripe. Guardarlo sirve para dos
-- cosas, y la segunda es la importante:
--
--   a) conciliar: de esta fila al cobro de Stripe sin buscar por importe y hora.
--   b) que cobrar dos veces sea imposible. Un doble clic, un reintento de red o
--      un F5 en la pantalla de pago vuelven a llamar a /confirm con el mismo
--      PaymentIntent; sin esta llave unica, cada llamada sumaria otra vez el
--      mismo importe a `paid_amount`. Con ella, la segunda choca contra el
--      indice y la tienda responde «ya estaba registrado» en vez de duplicar.
--
-- Se queda NULL en los abonos del mostrador, que no tienen PaymentIntent. MySQL
-- permite tantos NULL como haga falta en un indice UNIQUE, asi que la llave no
-- estorba al cobro en caja.
ALTER TABLE anticipo_payments
    ADD COLUMN payment_intent_id VARCHAR(64) NULL AFTER payment_method,
    ADD UNIQUE KEY uk_ap_payment_intent (payment_intent_id);


-- ── 3. Comprobacion ──────────────────────────────────────────────────────────
-- SHOW CREATE TABLE anticipo_payments;
--   payment_method  enum('cash','card','web')
--   payment_intent_id varchar(64) DEFAULT NULL
--   UNIQUE KEY uk_ap_payment_intent (payment_intent_id)
