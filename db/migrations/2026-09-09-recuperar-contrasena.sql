-- =============================================================================
--  Recuperar la contrasena
--  2026-09-09
--
--  El modal de acceso lleva desde siempre un enlace «¿Olvidaste tu contraseña?»
--  que apunta a /recuperar. Esa pagina no existia: devolvia 404. Tampoco habia
--  endpoint, ni columnas, ni correo. Un cliente que olvidaba su contrasena se
--  quedaba fuera de su cuenta para siempre, porque lo unico que reescribe una
--  contrasena es /api/change-password y ese pide la contrasena actual.
--
--  Esto añade las dos columnas del token de recuperacion.
--
--  Se aplica UNA VEZ y a mano (ver db/README.md).
-- =============================================================================

-- ── Por que no se reutilizan verification_token / token_expires_at ───────────
-- Existen ya en `clientes`, y la tentacion es usarlas. No:
--
--   1. Un token que sirve para dos cosas abre dos puertas. El de verificacion
--      llega por correo al registrarse y puede quedar en la bandeja meses; si
--      ademas permitiera cambiar la contrasena, cualquiera con acceso a ese
--      correo viejo entra a la cuenta.
--   2. Los dos procesos pueden estar vivos a la vez —alguien que se registra,
--      no verifica, y pide recuperar— y una sola columna no guarda dos tokens.
--
-- ── Y por que se guarda el hash y no el token ────────────────────────────────
-- `verification_token` se guarda en claro, que es como estaba. Aqui no: lo que
-- se guarda es el SHA-256 del token, y el token de verdad solo viaja en el
-- correo. Si alguien llega a leer la tabla —un volcado, un backup mal guardado,
-- una consulta de soporte— con el hash no puede entrar a ninguna cuenta. Es la
-- diferencia entre filtrar una pista y filtrar una llave.
--
-- SHA-256 y no bcrypt a proposito: el token son 32 bytes aleatorios, no una
-- contrasena que alguien pueda adivinar, asi que no hace falta un hash lento.
-- Y el login no puede permitirse esperar a bcrypt en cada intento.
ALTER TABLE clientes
    ADD COLUMN reset_token_hash CHAR(64) NULL AFTER token_expires_at,
    ADD COLUMN reset_expires_at DATETIME NULL AFTER reset_token_hash;

-- El indice es unico porque dos cuentas no pueden compartir token: si eso
-- pasara, el enlace de una abriria la otra. Admite NULL sin limite, que es el
-- estado normal de casi todas las filas.
ALTER TABLE clientes
    ADD UNIQUE KEY uk_clientes_reset (reset_token_hash);


-- ── Comprobacion ─────────────────────────────────────────────────────────────
-- SELECT column_name, column_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = DATABASE() AND table_name = 'clientes'
--    AND column_name LIKE 'reset%';
--
-- Deberia devolver:
--   reset_token_hash  char(64)  YES
--   reset_expires_at  datetime  YES
