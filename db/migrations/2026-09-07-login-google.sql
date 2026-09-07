-- =============================================================================
--  Las columnas del login con Google, que solo existian en un ALTER en caliente
--  2026-09-07
--
--  `app/api/auth/google/route.js` traia un ensureGoogleCols() que en CADA login
--  corria tres ALTER TABLE sobre `clientes`, capturando ER_DUP_FIELDNAME para
--  que la segunda vez no doliera. Funcionaba, y por eso nadie lo miro: las
--  columnas acabaron existiendo en la base pero NO en db/schema.sql, que es la
--  fuente de verdad. Esta migracion escribe en el esquema lo que la aplicacion
--  llevaba haciendo a escondidas, y el ALTER en caliente ya se quito del codigo.
--
--  Las tres cosas que hacia:
--
--    auth_provider  de donde salio la cuenta ('password' o 'google').
--    google_sub     el identificador estable de Google. Se liga por aqui y no
--                   por el correo, porque en un dominio corporativo un correo
--                   puede cambiar de dueño y el sub no.
--    fecha_nac      pasa a NULL. Google no comparte la fecha de nacimiento, asi
--                   que la cuenta nace sin ella y el cliente la completa
--                   despues; hasta entonces /api/checkout no la deja comprar.
--
--  Se aplica UNA VEZ y a mano (ver db/README.md: el esquema no se migra en el
--  arranque de la aplicacion).
--
--  IMPORTANTE: en la base de produccion esto YA ESTA APLICADO, porque el ALTER
--  en caliente llevaba meses corriendo. Se conserva por dos razones: para que
--  una base nueva salga igual que la de produccion, y para dejar constancia de
--  cuando y por que aparecieron estas columnas.
-- =============================================================================

-- ── 0. Antes de tocar nada ───────────────────────────────────────────────────
-- Comprobar que hay que hacer. Si las tres devuelven fila, no hay nada que
-- aplicar y esta migracion ya esta puesta:
--
--   SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE, COLUMN_DEFAULT
--     FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME   = 'clientes'
--      AND COLUMN_NAME IN ('auth_provider', 'google_sub', 'fecha_nac');
--
-- Lo esperado despues de esta migracion:
--   auth_provider  NO   varchar(20)  'password'
--   google_sub     YES  varchar(64)  NULL
--   fecha_nac      YES  date         NULL
--
-- MySQL 8 no tiene ADD COLUMN IF NOT EXISTS, asi que cada ALTER de abajo hay
-- que correrlo SOLO si su columna falta. Si sobra, contesta ER_DUP_FIELDNAME
-- (1060) y no cambia nada -- es seguro, pero conviene saber cual toca.


-- ── 1. De donde salio la cuenta ──────────────────────────────────────────────
-- Las cuentas que ya existen son todas de contraseña, y ese es el DEFAULT, asi
-- que el relleno de las filas viejas sale correcto solo.
ALTER TABLE clientes
    ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'password' AFTER password;


-- ── 2. El identificador de Google ────────────────────────────────────────────
-- NULL para todo el que no entro con Google. UNIQUE porque un mismo sub no
-- puede quedar ligado a dos cuentas: seria la via para apropiarse de una.
-- El indice unico admite varios NULL, que es justo lo que hace falta aqui.
ALTER TABLE clientes
    ADD COLUMN google_sub VARCHAR(64) NULL AFTER auth_provider;

-- Este UNIQUE es lo unico que la aplicacion NO hacia: el ALTER en caliente
-- creaba la columna suelta. Si falla por duplicados, hay cuentas repetidas
-- ligadas al mismo Google y hay que resolverlas a mano antes de seguir:
--
--   SELECT google_sub, COUNT(*) c, GROUP_CONCAT(id) ids
--     FROM clientes WHERE google_sub IS NOT NULL
--    GROUP BY google_sub HAVING c > 1;
ALTER TABLE clientes
    ADD UNIQUE KEY uniq_google_sub (google_sub);


-- ── 3. La fecha de nacimiento deja de ser obligatoria ────────────────────────
-- No toca ningun dato existente: aflojar un NOT NULL nunca borra nada.
ALTER TABLE clientes
    MODIFY COLUMN fecha_nac DATE NULL;


-- ── 4. Comprobacion ──────────────────────────────────────────────────────────
--   SELECT auth_provider, COUNT(*) FROM clientes GROUP BY auth_provider;
--   -- y no deberia haber ninguna cuenta de Google sin sub:
--   SELECT COUNT(*) FROM clientes WHERE auth_provider = 'google' AND google_sub IS NULL;
