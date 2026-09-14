-- =============================================================================
--  Rastreo de envios: el recorrido del paquete, evento por evento
--  2026-09-14
--
--  Hoy un pedido enviado sabe dos cosas: que tiene guia y si salio del local.
--  `shipping_status` es un ENUM de 'en_espera' y 'despachado', y no hay ningun
--  registro de lo que paso despues. Lo dice el propio codigo de la tienda, en
--  components/perfil/OrderTracking.js:
--
--      "No hay timestamp por paso en la base (solo la fecha de creacion del
--       pedido), asi que `actualizado` se muestra nomas en el paso actual --
--       es lo unico que sabemos con certeza."
--
--  Es decir: la pantalla de rastreo del cliente ya existe y ya dibuja pasos,
--  pero no puede decir cuando ocurrio ninguno porque ese dato no esta. Y en el
--  mostrador pasa lo mismo: si un paquete lleva cuatro dias parado en una
--  bodega, nadie se entera hasta que llama el cliente.
--
--  Esto añade el registro que falta.
--
--  Se aplica UNA VEZ y a mano (ver db/README.md). Necesita `torlan_user`:
--  `pos_app` no puede crear tablas, a proposito.
-- =============================================================================


-- ── Por que una tabla de eventos y no mas columnas en bisonte_orders ─────────
--
-- La tentacion es añadir `recolectado_at`, `en_transito_at`, `en_reparto_at`
-- junto a los `confirmed_at` / `shipped_at` / `delivered_at` que ya estan. No:
--
--   1. Un envio no es una escalera. Un paquete puede intentar entregarse tres
--      veces, volver a la bodega, salir otra vez y acabar devuelto. Con una
--      columna por paso solo cabe la ultima vez que paso cada cosa, y lo que
--      de verdad quieres ver es la secuencia.
--   2. Envia tiene 28 estados. Veintiocho columnas de fecha es una tabla que
--      nadie quiere leer ni mantener.
--   3. Las columnas no guardan el texto de la paqueteria ni donde estaba el
--      paquete. "Entrega fallida: nadie en el domicilio, Zapopan 14:20" es lo
--      que de verdad resuelve la llamada del cliente.
--
-- Una fila por evento contesta las tres.


-- ── Por que se guarda el estado de Envia tal cual, ademas de la fase ─────────
--
-- `envia_status_id` y `envia_status` son lo que mando Envia, sin tocar. `fase`
-- es nuestra lectura de eso, y es la que mueve la pantalla.
--
-- Guardar las dos parece redundante y no lo es: la traduccion de 28 estados a
-- 8 fases es una opinion, y las opiniones se cambian. Si mañana decidimos que
-- "Delayed" ya no cuenta como incidencia, con el id original guardado eso es
-- un UPDATE; sin el, es informacion perdida. Y si Envia agrega un estado 29,
-- el evento entra igual y se ve en la linea de tiempo aunque su fase caiga en
-- 'informativo' hasta que alguien lo clasifique.
--
-- `crudo` va mas lejos: el mensaje completo como llego. Cuesta poco y es lo
-- unico que permite entender, meses despues, por que un envio hizo algo raro.

CREATE TABLE IF NOT EXISTS shipment_events (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    bisonte_order_id  INT NOT NULL,
    -- Repetida a proposito: la guia identifica al envio, y un pedido puede
    -- acabar teniendo una segunda si la primera se pierde. Ademas es por lo
    -- que pregunta el cliente cuando llama, asi que se busca por aqui.
    tracking_number   VARCHAR(150) NULL,

    -- Lo que dijo Envia, sin interpretar. Ver el bloque de arriba.
    envia_status_id   SMALLINT UNSIGNED NOT NULL,
    envia_status      VARCHAR(80) NULL,

    -- Nuestra lectura. El mapeo vive en codigo (POS: utils/fasesEnvio.js) y no
    -- en una tabla de catalogo: cambia con el codigo, se revisa en un diff y no
    -- necesita migracion para corregirse.
    --
    -- 'informativo' es la valvula de escape: un estado que no sabemos clasificar
    -- se registra y se muestra, pero no mueve el pedido de sitio.
    fase              ENUM('creada','recolectada','en_transito','en_reparto',
                           'entregada','incidencia','devuelta','cancelada',
                           'informativo') NOT NULL,

    descripcion       VARCHAR(500) NULL,
    ubicacion         VARCHAR(200) NULL,

    -- Cuando paso, segun la paqueteria. NOT NULL a proposito: cuando Envia no
    -- da hora, el consultor pone la de la consulta. Un evento sin hora no se
    -- puede ordenar en una linea de tiempo, que es para lo unico que existe
    -- esta tabla. Ademas, en MySQL dos NULL no chocan entre si en una clave
    -- unica, asi que permitirlo abriria la puerta a duplicados infinitos.
    ocurrido_en       DATETIME NOT NULL,
    -- Cuando nos enteramos. Separado de lo anterior porque casi nunca coinciden:
    -- preguntamos cada hora, y la diferencia entre los dos es exactamente lo que
    -- tardamos en saberlo.
    registrado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- De donde salio el evento. 'simulador' existe para que una prueba nunca se
    -- pueda confundir con la realidad al mirar la tabla meses despues, y para
    -- poder borrar de un golpe todo lo inventado.
    origen            ENUM('envia','simulador','manual') NOT NULL DEFAULT 'envia',

    crudo             JSON NULL,

    -- Preguntamos cada hora y casi siempre la respuesta es la misma: los
    -- eventos que ya conocemos. Sin esta clave, cada consulta duplicaria toda
    -- la historia del envio. Con ella, insertar lo ya sabido no hace nada.
    UNIQUE KEY uniq_evento (bisonte_order_id, envia_status_id, ocurrido_en),

    -- La linea de tiempo de un pedido, en orden, sin ordenar en memoria.
    KEY idx_pedido_tiempo (bisonte_order_id, ocurrido_en),
    KEY idx_guia (tracking_number),

    CONSTRAINT fk_shipment_events_order
        FOREIGN KEY (bisonte_order_id) REFERENCES bisonte_orders(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ON DELETE CASCADE y no RESTRICT: los eventos no valen nada sin su pedido, y
-- `bisonte_orders` no se borra nunca en produccion (nadie tiene DELETE sobre
-- ella, ver grants.sql). El CASCADE existe para que limpiar pedidos de prueba
-- no deje eventos huerfanos.


-- ── El estado de envio deja de ser un interruptor ────────────────────────────
--
-- Era ENUM('en_espera','despachado'): dos valores para "aun no sale" y "ya
-- salio". Eso alcanzaba mientras nadie supiera nada del paquete despues de la
-- puerta. Ahora si se sabe.
--
-- Los dos valores viejos se conservan. 'despachado' significa lo mismo que
-- 'recolectada' y el codigo nuevo no lo escribe, pero borrarlo obligaria a
-- reescribir filas existentes y a tocar el POS en la misma pasada. Se queda
-- como valor historico y se apaga solo.
--
-- Es UNA maquina de estados, no dos: antes de que la paqueteria lo recoja el
-- dueño del estado es el mostrador ('en_espera'), y a partir de ahi lo es el
-- transportista. El mismo recorrido, con el testigo cambiando de mano.

ALTER TABLE bisonte_orders
    MODIFY COLUMN shipping_status ENUM(
        'en_espera',      -- la guia existe, el paquete sigue en el local
        'despachado',     -- historico: equivale a 'recolectada'
        'recolectada',
        'en_transito',
        'en_reparto',
        'entregada',
        'incidencia',     -- intento fallido, direccion mala, rechazado, dañado
        'devuelta',
        'cancelada'
    ) NULL;


-- ── La marca de prueba ──────────────────────────────────────────────────────
--
-- El simulador de envios inventa eventos. Que exista una herramienta capaz de
-- mover un pedido sin que el paquete se haya movido es util para desarrollar y
-- peligroso para un cliente real: un "entregado" falso cierra el pedido, manda
-- el correo de entrega y apaga la alarma.
--
-- Por eso el simulador se niega a tocar un pedido que no tenga esta marca. La
-- regla vive en el script y no en un trigger porque crear triggers pide un
-- permiso que ninguna de las dos aplicaciones tiene, ni debe tener.

ALTER TABLE bisonte_orders
    ADD COLUMN es_prueba TINYINT(1) NOT NULL DEFAULT 0 AFTER estado,
    -- Cuando se le pregunto a Envia por ultima vez. El consultor lo usa para no
    -- repreguntar por lo mismo dentro de la misma hora, y la pantalla para
    -- decir "actualizado hace X" en vez de fingir que el dato es de ahora.
    ADD COLUMN rastreo_consultado_en DATETIME NULL AFTER tracking_number;

-- Lo que el consultor recorre cada hora: los envios que todavia se mueven.
-- Sin indice, eso es un recorrido completo de la tabla cada vez.
ALTER TABLE bisonte_orders
    ADD KEY idx_envios_activos (estado, shipping_status, rastreo_consultado_en);


-- ── Marcar como prueba lo que ya hay ────────────────────────────────────────
--
-- Esta migracion se aplica ANTES de abrir la tienda. Los 61 pedidos que existen
-- hoy son todos de prueba: 40 cancelados y 21 con el pago reembolsado, ninguno
-- de un cliente real. Marcarlos hace dos cosas: deja el simulador utilizable
-- desde el primer dia, y permite esconderlos de la pantalla el dia que entre un
-- pedido de verdad.
--
-- Si por lo que sea se aplicara con pedidos reales dentro, quitar este UPDATE.

UPDATE bisonte_orders SET es_prueba = 1;


-- ── Los permisos NO estan aqui ──────────────────────────────────────────────
--
-- Una tabla nueva nace sin permisos: ni la tienda ni el POS la ven hasta que
-- alguien los concede. Eso se hace en db/grants.sql, que es donde vive la
-- razon de cada permiso de este proyecto, y hay que aplicarlo despues de esta
-- migracion.
--
-- Separado a proposito, y no por orden: repartir permisos solo lo puede hacer
-- `root`, y crear tablas lo hace `torlan_user`. Si estuvieran en el mismo
-- archivo habria que correrlo entero como `root`, y entonces la cuenta que
-- todo lo puede seria la que aplica cada migracion. La separacion es lo que
-- mantiene a `root` para lo unico que solo `root` puede hacer.
--
-- Resumen de lo que concede grants.sql para esta tabla:
--   pos_app      SELECT, INSERT  -- consulta a Envia y registra lo que llega
--   bisonte_app  SELECT          -- dibuja el recorrido en el perfil del cliente
