-- =============================================================================
--  BISONTE SHOP + TORLAN POS — Esquema unificado
--  MySQL 8.0 / InnoDB / utf8mb4
--
--  Base de datos compartida entre las dos apps. El aislamiento se hace con
--  GRANTs por usuario (ver db/grants.sql), no separando bases: el POS escribe
--  inventario y la tienda lo lee en la misma transaccion, sin sincronizacion.
--
--  Reconstruido tras la perdida del proyecto GCP (jun 2026). Incorpora 22
--  correcciones que en produccion habrian requerido migraciones con datos.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
--  NUCLEO POS
-- =============================================================================

CREATE TABLE IF NOT EXISTS empresas (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    nombre_empresa     VARCHAR(255) NOT NULL,
    plan_contratado    ENUM('Prueba','Basico','Premium','Empresarial') NOT NULL DEFAULT 'Basico',
    estado             ENUM('Activo','Suspendido','Baja') NOT NULL DEFAULT 'Activo',
    max_usuarios       INT DEFAULT 5,
    max_productos      INT DEFAULT 100,
    fecha_registro     DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_suspension   DATETIME NULL,
    notas              TEXT NULL,
    billing_cycle_date VARCHAR(50) NULL,
    INDEX idx_estado (estado),
    INDEX idx_plan   (plan_contratado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff del POS. Distinto de `clientes` (compradores de la tienda web).
CREATE TABLE IF NOT EXISTS users (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    username             VARCHAR(100) UNIQUE NOT NULL,
    -- El staff entra con username O numero de empleado (routes/auth.js).
    employee_number      VARCHAR(20) NULL,
    password_hash        VARCHAR(255) NOT NULL,
    empresa_id           INT NULL,
    role                 ENUM('global_admin','empresa_admin','employee') NOT NULL DEFAULT 'employee',
    is_admin             TINYINT(1) DEFAULT 0,
    first_login          TINYINT(1) DEFAULT 1,
    has_setup_complete   TINYINT(1) DEFAULT 0,
    onboarding_completed TINYINT(1) DEFAULT 0,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
    UNIQUE KEY uniq_employee_number (employee_number),
    INDEX idx_empresa  (empresa_id),
    INDEX idx_role     (role),
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS features (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description  TEXT NULL,
    icon         VARCHAR(50) DEFAULT 'cube'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_features (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    feature_id INT NOT NULL,
    is_enabled TINYINT(1) DEFAULT 0,
    CONSTRAINT fk_uf_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_uf_feature FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_user_feature (user_id, feature_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 7 — reemplaza products.damian / products.bernat, que eran nombres de
-- persona como columnas: un proveedor nuevo exigia ALTER TABLE.
--
-- El modelo NO es muchos-a-muchos. El POS ya tenia resuelto el dominio y es de
-- consignacion: un proveedor por producto, con su precio, y `sale_items`
-- guardando el precio del proveedor al momento de la venta para que los
-- reportes calculen la deuda (SUM(quantity * supplier_price_at_sale)).
-- Esta definicion respeta la que ya existia en migrations/20260201_supplier_system.js.
CREATE TABLE IF NOT EXISTS suppliers (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id   INT NOT NULL,
    name         VARCHAR(255) NOT NULL,
    contact_info TEXT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_suppliers_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    INDEX idx_empresa (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catalogos normalizados de categoria y editorial. Existian ya en
-- migrations/add_category_publisher_tables.js.
--
-- FIX 20 — la categoria cuelga de una rama, y la rama es `is_adult`.
--
-- Antes el corte Regular/Adultos estaba codificado dos veces: como bandera
-- products.is_adult y ademas como el valor 'Adultos' del campo `category`,
-- donde convivia con Shonen, Seinen y Doujinshi. Nada impedia la contradiccion
-- (category='Shonen', is_adult=1) ni el hueco (category='Adultos', is_adult=0),
-- y la tienda filtra por is_adult mientras el POS mostraba por category: el
-- mismo producto podia salir en la seccion equivocada de un lado y no del otro.
--
-- Ahora la rama es un atributo de la categoria y `is_adult` del producto tiene
-- que coincidir con la de su categoria — lo impone la clave foranea compuesta
-- de abajo, no la aplicacion. 'Adultos' deja de ser una categoria: es la rama.
CREATE TABLE IF NOT EXISTS categories (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    is_adult   TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_name (name),
    -- Existe solo para que products pueda apuntar a (id, is_adult). Redundante
    -- como restriccion (id ya es unico), obligatoria como indice destino de FK.
    UNIQUE KEY uniq_id_adult (id, is_adult),
    CONSTRAINT chk_categories_no_adultos CHECK (LOWER(name) <> 'adultos'),
    INDEX idx_adult (is_adult, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publishers (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 21 — formatos de envio: medir una vez por edicion, no cada libro.
--
-- Largo, ancho, alto y peso solo se usan para cotizar envio con Envia.com, y
-- dentro de una misma edicion son identicos entre tomos. Medir cada libro es
-- trabajo repetido sobre un dato ya conocido, y el resultado se guardaba en
-- products.dimensions como texto libre ('18x12.8x1.5', '18 x 12,8 x 1.5 cm',
-- '18cm'), imposible de usar para cotizar sin adivinar el formato.
--
-- Aqui las medidas son numeros, en centimetros y gramos, con una fila por
-- edicion. products.dimensions y products.weight se conservan para el producto
-- que no encaja en ningun formato (una figura suelta, un articulo importado).
CREATE TABLE IF NOT EXISTS product_formats (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id  INT NOT NULL,
    name        VARCHAR(120) NOT NULL,
    length_cm   DECIMAL(6,2) NOT NULL,
    width_cm    DECIMAL(6,2) NOT NULL,
    height_cm   DECIMAL(6,2) NOT NULL,
    weight_g    INT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_formats_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    -- Envia.com rechaza un paquete de cero, y un cero aqui se propaga a todas
    -- las cotizaciones de esa edicion sin que nadie lo note hasta el envio.
    CONSTRAINT chk_formats_length CHECK (length_cm > 0),
    CONSTRAINT chk_formats_width  CHECK (width_cm  > 0),
    CONSTRAINT chk_formats_height CHECK (height_cm > 0),
    CONSTRAINT chk_formats_weight CHECK (weight_g  > 0),
    UNIQUE KEY uniq_empresa_name (empresa_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 6 — se elimina la columna `price`. La migracion 006 la dejo "por
-- retrocompatibilidad" y quedo ambigua frente a sale_price durante un anio.
-- Fuente de verdad: cost_price (compra) y sale_price (venta).
CREATE TABLE IF NOT EXISTS products (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id       INT NOT NULL,
    name             VARCHAR(255) NOT NULL,
    -- FIX 22 — serie y tomo, como datos y no dentro del nombre.
    --
    -- Hasta ahora el tomo vivia enterrado en `name` ('Berserk, Vol. 7'), asi
    -- que agrupar una serie o saber cual es el siguiente tomo pasaba por
    -- adivinar el formato del titulo — y en el catalogo conviven 'Vol. 7',
    -- 'Tomo 7', '#7' y '07'. Separarlos es lo que hace posible «continuar
    -- serie» en el alta y ordenar la ficha de serie en la tienda.
    --
    -- Ambos NULL para lo que no es serie: figuras, mercancia, tomo unico.
    series           VARCHAR(255) NULL,
    volume           SMALLINT UNSIGNED NULL,
    cost_price       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    sale_price       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    -- FIX 14 — stock fisico y stock comprometido, separados y materializados.
    -- Antes lo reservado se recalculaba en cada consulta sumando toda la cola de
    -- pedidos pendientes (una subquery por item, y cascadeCancelLaterOrders la
    -- llamaba por cada pedido posterior: O(n^2) y sin bloqueo, o sea sobreventa
    -- cuando dos confirmaciones corrian a la vez).
    stock            INT NOT NULL DEFAULT 0,
    stock_reservado  INT NOT NULL DEFAULT 0,
    stock_disponible INT AS (stock - stock_reservado) VIRTUAL,
    category         VARCHAR(100) NULL,
    barcode          VARCHAR(100) NULL,
    -- FIX 19 — un solo identificador de editor.
    --
    -- `sbin_code` e `isbn` guardaban el mismo dato con dos nombres. El codigo
    -- ya los trataba como intercambiables (`WHERE sbin_code = ? OR barcode = ?
    -- OR isbn = ?`) y la etiqueta imprimia `isbn || sbin_code || barcode`, asi
    -- que cual de las dos columnas tenia el valor dependia de por donde se
    -- hubiera dado de alta el producto. Dos columnas, dos UNIQUE, un dato.
    --
    -- Queda `isbn`, con el nombre correcto y el ancho de la que se elimina: lo
    -- que vivia en sbin_code eran codigos internos de articulos sin ISBN real
    -- (doujinshi, figuras, mercancia) y algunos pasaban de 20 caracteres.
    -- El campo significa "identificador del editor, o interno si no lo tiene".
    isbn             VARCHAR(100) NULL,
    extras           TEXT NULL,
    publication_date VARCHAR(50)  NULL,
    publisher        VARCHAR(255) NULL,
    page_count       INT NULL,
    dimensions       VARCHAR(100) NULL,
    weight           DECIMAL(8,2) NULL,
    page_color       VARCHAR(50)  NULL,
    language         VARCHAR(10)  NULL,
    -- FIX 21 — formato de envio. Si esta puesto, las medidas salen de ahi y
    -- `dimensions`/`weight` se ignoran para cotizar.
    format_id        INT NULL,
    -- Consignacion: un proveedor por producto y lo que cobra por unidad.
    supplier_id      INT NULL,
    supplier_price   DECIMAL(10,2) NULL,
    -- Catalogos normalizados. `category` y `publisher` siguen como texto libre
    -- porque el POS aun escribe ambos; los _id son la version normalizada.
    category_id      INT NULL,
    publisher_id     INT NULL,
    -- Campos de catalogo web (antes agregados sueltos con ALTER en runtime,
    -- via GET /api/products/migrate-schema con addColIfMissing)
    is_adult         TINYINT(1) NOT NULL DEFAULT 0,
    image_url        VARCHAR(500) NULL,
    sinopsis         TEXT NULL,
    -- De donde se copio la sinopsis. NULL = la escribio una persona. Se guarda
    -- para poder atribuir el texto y para saber que revisar si la fuente cambia
    -- de licencia; no participa en ninguna consulta de catalogo.
    sinopsis_fuente  VARCHAR(500) NULL,
    artist           VARCHAR(255) NULL,
    gender           VARCHAR(50)  NULL,
    -- Calificacion que se muestra en la ficha. Es el promedio ya calculado de
    -- `product_reviews` mas cuantas opiniones lo sostienen: sin `rating_count`
    -- un 5.0 de una sola persona se ve igual que uno de doscientas. Se guarda
    -- resuelto y no se calcula al vuelo porque el catalogo lo lee en cada
    -- tarjeta; quien escribe una opinion lo recalcula en la misma transaccion.
    -- NULL = sin calificar; la ficha no pinta estrellas en vez de inventar un
    -- cero.
    rating           DECIMAL(2,1) NULL,
    rating_count     INT NOT NULL DEFAULT 0,
    group_name       VARCHAR(255) NULL,
    events           JSON NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_empresa   FOREIGN KEY (empresa_id)   REFERENCES empresas(id)   ON DELETE CASCADE,
    CONSTRAINT fk_products_supplier  FOREIGN KEY (supplier_id)  REFERENCES suppliers(id)  ON DELETE SET NULL,
    -- FIX 20 — la coherencia rama/categoria la impone la base.
    --
    -- La foranea es compuesta: (category_id, is_adult) tiene que existir tal
    -- cual en categories. Poner un producto en Shonen con is_adult=1 falla con
    -- ER_NO_REFERENCED_ROW, igual que ponerlo en Doujinshi con is_adult=0.
    --
    -- InnoDB no comprueba la foranea si alguna de sus columnas es NULL, asi que
    -- un producto sin categoria (figura, mercancia) sigue pudiendo ser de
    -- cualquier rama. Es exactamente lo que hace falta: category_id es opcional.
    --
    -- ON DELETE SET NULL no cabe aqui — anularia is_adult, que es NOT NULL. Al
    -- borrar una categoria con productos, la base lo impide y hay que
    -- reasignarlos primero, que es la respuesta correcta: un producto sin rama
    -- no se puede colocar en la tienda.
    CONSTRAINT fk_products_category  FOREIGN KEY (category_id, is_adult)
        REFERENCES categories(id, is_adult) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_products_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE SET NULL,
    CONSTRAINT fk_products_format    FOREIGN KEY (format_id)    REFERENCES product_formats(id) ON DELETE SET NULL,
    CONSTRAINT chk_products_stock     CHECK (stock >= 0),
    CONSTRAINT chk_products_reservado CHECK (stock_reservado >= 0),
    -- No se puede comprometer mas de lo que hay: la base rechaza la sobreventa.
    CONSTRAINT chk_products_disponible CHECK (stock_reservado <= stock),
    -- Una calificacion fuera de 0-5 solo puede venir de un error de calculo;
    -- la base la rechaza antes de que la ficha pinte seis estrellas.
    CONSTRAINT chk_products_rating CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
    INDEX idx_empresa       (empresa_id),
    INDEX idx_category      (category),
    INDEX idx_isbn          (isbn),
    INDEX idx_barcode       (barcode),
    -- FIX 17 — el codigo de barras es UNICO por empresa. Antes la unicidad se
    -- confiaba a un SELECT-antes-de-INSERT en la ruta de alta, que no protege
    -- de nada: entre la consulta y la insercion cabe otra peticion.
    UNIQUE KEY uniq_empresa_barcode (empresa_id, barcode),
    UNIQUE KEY uniq_empresa_isbn    (empresa_id, isbn),
    INDEX idx_empresa_name  (empresa_id, name),
    INDEX idx_empresa_adult (empresa_id, is_adult),
    INDEX idx_supplier      (supplier_id),
    INDEX idx_format        (format_id),
    -- FIX 22 — «continuar serie». Es la consulta que prellena el alta y la que
    -- ordena la ficha de serie en la tienda; sin indice recorre el catalogo.
    INDEX idx_empresa_serie (empresa_id, series, volume)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 18 — contador real para los codigos de barra.
--
-- Antes la secuencia salia de `SELECT COUNT(*) FROM products WHERE ...` + 1.
-- Un contador derivado de un COUNT se rompe de dos formas:
--
--   · Al borrar. Con 5 productos el siguiente es el 6; se borra uno, el COUNT
--     baja a 4 y el siguiente vuelve a ser 5 — que ya existe.
--   · En concurrencia. Dos altas simultaneas leen COUNT=5 y ambas generan la
--     secuencia 6.
--
-- Esta tabla guarda el proximo valor y se incrementa de forma atomica con
-- INSERT ... ON DUPLICATE KEY UPDATE next_seq = LAST_INSERT_ID(next_seq + 1),
-- que en MySQL devuelve el valor reservado sin carrera posible. Un numero
-- entregado no se reutiliza aunque el producto se borre despues.
CREATE TABLE IF NOT EXISTS barcode_sequences (
    empresa_id INT NOT NULL,
    next_seq   INT UNSIGNED NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (empresa_id),
    CONSTRAINT fk_bseq_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_sessions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id      INT NOT NULL,
    user_id         INT NOT NULL,
    opening_amount  DECIMAL(10,2) NOT NULL DEFAULT 0,
    expected_amount DECIMAL(10,2) NULL,
    declared_amount DECIMAL(10,2) NULL,
    difference      DECIMAL(10,2) NULL,
    status          ENUM('open','closed') NOT NULL DEFAULT 'open',
    auto_closed     TINYINT(1) NOT NULL DEFAULT 0,
    opened_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at       DATETIME NULL,
    notes           TEXT NULL,
    CONSTRAINT fk_cs_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_cs_user    FOREIGN KEY (user_id)    REFERENCES users(id),
    INDEX idx_empresa            (empresa_id),
    INDEX idx_user               (user_id),
    INDEX idx_status             (status),
    INDEX idx_auto_closed        (auto_closed),
    INDEX idx_empresa_user_status (empresa_id, user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 1 — `sales` ya NO carga columnas de envio web. Antes tenia 8
-- (web_status, claim_status, tracking_number, envia_quote_data, label_data,
-- shipping_address_json, shipping_method, shipping_status) que quedaban NULL en
-- cada venta de mostrador, y obligaban a ALTER TABLE sobre la ruta mas caliente
-- del POS cada vez que cambiaba la tienda. Ahora viven en bisonte_shipments.
--
-- FIX 4 (soporte) — `origen` distingue venta de mostrador de venta web, para
-- que sale_items sea suficiente y bisonte_orders.items_json desaparezca.
CREATE TABLE IF NOT EXISTS sales (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id      INT NOT NULL,
    user_id         INT NOT NULL,
    origen          ENUM('pos','web') NOT NULL DEFAULT 'pos',
    subtotal        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    surcharge       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total           DECIMAL(10,2) NOT NULL,
    payment_method  ENUM('cash','card') NOT NULL,
    cash_session_id INT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sales_empresa FOREIGN KEY (empresa_id)      REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_user    FOREIGN KEY (user_id)         REFERENCES users(id),
    CONSTRAINT fk_sales_cash    FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL,
    INDEX idx_empresa         (empresa_id),
    INDEX idx_user            (user_id),
    INDEX idx_created         (created_at),
    INDEX idx_payment         (payment_method),
    INDEX idx_empresa_created (empresa_id, created_at),
    INDEX idx_empresa_origen  (empresa_id, origen, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_items (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    sale_id    INT NOT NULL,
    product_id INT NOT NULL,
    quantity   INT NOT NULL,
    price      DECIMAL(10,2) NOT NULL,
    -- Foto del precio del proveedor al vender. No se lee de products porque ese
    -- valor cambia; los reportes calculan la deuda con este historico:
    -- SUM(quantity * supplier_price_at_sale).
    supplier_price_at_sale DECIMAL(10,2) NULL,
    CONSTRAINT fk_si_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id) ON DELETE CASCADE,
    CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT chk_si_qty    CHECK (quantity > 0),
    INDEX idx_sale         (sale_id),
    INDEX idx_product      (product_id),
    INDEX idx_sale_product (sale_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_goals (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id   INT NOT NULL,
    user_id      INT NOT NULL,
    type         ENUM('weekly','monthly') NOT NULL,
    target       DECIMAL(10,2) NOT NULL,
    current      DECIMAL(10,2) DEFAULT 0,
    period_start DATE NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sg_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_sg_user    FOREIGN KEY (user_id)    REFERENCES users(id),
    INDEX idx_empresa (empresa_id),
    INDEX idx_user    (user_id),
    INDEX idx_period  (period_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_settings (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id    INT NOT NULL,
    setting_key   VARCHAR(100) NOT NULL,
    setting_value TEXT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_bs_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_empresa_setting (empresa_id, setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS global_changes_log (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id  INT NULL,
    event_type  VARCHAR(100) NOT NULL,
    description TEXT NULL,
    user_id     INT NULL,
    metadata    TEXT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gcl_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
    INDEX idx_empresa (empresa_id),
    INDEX idx_event   (event_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  APARTADOS
--
--  Un apartado es mercancia que el cliente separo pagando un anticipo. Lo que
--  distingue a esta tabla de una venta a plazos es que tiene fecha de caducidad:
--  si no se liquida a tiempo, la mercancia vuelve al catalogo.
--
--  No confundir con las preventas (pre_orders, mas abajo). Aquello son pedidos
--  que todavia vienen en camino: no hay producto en el catalogo ni stock que
--  reservar, y el plazo cuenta desde que llegan. Un apartado es siempre
--  mercancia que ya esta en la tienda, y por eso su plazo es de 15 dias, uno
--  solo y para todos.
--
--  El stock se separa con `stock_reservado`, igual que un pedido web (FIX 14):
--  el articulo sigue fisicamente en la tienda, pero deja de estar disponible.
--  Bajar `products.stock` en su lugar mentiria en el inventario fisico y haria
--  que el conteo del mostrador nunca cuadrara con la base.
-- =============================================================================

-- Folio del apartado, con contador atomico por empresa. Mismo patron que
-- barcode_sequences: un COUNT(*) + 1 retrocede al cancelar y da el mismo numero
-- a dos altas simultaneas.
CREATE TABLE IF NOT EXISTS apartado_sequences (
    empresa_id INT NOT NULL,
    next_seq   INT UNSIGNED NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (empresa_id),
    CONSTRAINT fk_aseq_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS anticipos (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id     INT NOT NULL,
    -- Numero de pedido que se le dice al cliente: AP-000123.
    folio          VARCHAR(20) NOT NULL,
    -- Cuenta de la tienda web, cuando la persona tiene una. NULL para el
    -- apartado de mostrador de quien nunca se registro: por eso el nombre y el
    -- telefono siguen siendo columnas y no un join obligatorio.
    cliente_id     INT NULL,
    customer_name  VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(30)  NULL,
    customer_email VARCHAR(255) NULL,
    total_amount   DECIMAL(10,2) NOT NULL,
    paid_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
    -- El plazo se guarda en la fila y no se lee de la configuracion: si manana
    -- la tienda pasa a 10 dias, los apartados vivos conservan lo prometido.
    dias_plazo     SMALLINT UNSIGNED NOT NULL DEFAULT 15,
    expires_at     DATETIME NOT NULL,
    status         ENUM('pending','completed','cancelled','expired') NOT NULL DEFAULT 'pending',
    -- Los apartados anteriores a este modulo no tenian vencimiento. Se les
    -- calculo uno, pero el job no los toca: los devuelve una persona despues de
    -- hablar con el cliente, no un cron a medianoche.
    revisar_manual TINYINT(1) NOT NULL DEFAULT 0,
    aviso_previo_at  DATETIME NULL,
    aviso_vencido_at DATETIME NULL,
    expired_at       DATETIME NULL,
    -- Venta generada al liquidar. Permite llegar del apartado al ticket.
    sale_id        INT NULL,
    created_by     INT NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at   TIMESTAMP NULL,
    notes          TEXT NULL,
    CONSTRAINT fk_ant_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_ant_user    FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_ant_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    CONSTRAINT fk_ant_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE SET NULL,
    -- Un apartado no puede tener mas abonado que su total ni un abono negativo.
    CONSTRAINT chk_ant_pagado CHECK (paid_amount >= 0 AND paid_amount <= total_amount),
    -- La regla del negocio, impuesta por la base: el stock se separa cuando hay
    -- dinero de por medio. Un apartado vivo sin anticipo es una reserva gratis.
    --
    -- La excepcion son los marcados `revisar_manual`: apartados anteriores a
    -- este modulo, algunos con anticipo cero. Se les deja pasar porque la
    -- alternativa era inventarles un pago o cerrarlos sin hablar con nadie.
    CONSTRAINT chk_ant_anticipo CHECK (status <> 'pending' OR paid_amount > 0 OR revisar_manual = 1),
    CONSTRAINT chk_ant_plazo    CHECK (dias_plazo > 0),
    UNIQUE KEY uniq_empresa_folio (empresa_id, folio),
    INDEX idx_empresa (empresa_id),
    INDEX idx_status  (status),
    INDEX idx_created (created_at),
    -- La consulta del panel y la del job: pendientes de una empresa ordenados
    -- por lo que esta mas cerca de vencer.
    INDEX idx_vencimiento (empresa_id, status, expires_at),
    -- «Mis apartados» en la tienda web.
    INDEX idx_cliente (cliente_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS anticipo_items (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    anticipo_id INT NOT NULL,
    product_id  INT NOT NULL,
    quantity    INT NOT NULL,
    unit_price  DECIMAL(10,2) NOT NULL,
    subtotal    DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_ai_anticipo FOREIGN KEY (anticipo_id) REFERENCES anticipos(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_product  FOREIGN KEY (product_id)  REFERENCES products(id),
    CONSTRAINT chk_ai_qty     CHECK (quantity > 0),
    INDEX idx_anticipo (anticipo_id),
    INDEX idx_product  (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada abono, con quien lo cobro. `anticipos.paid_amount` es la suma resuelta;
-- esta tabla es el detalle que responde «cuando pago y cuanto».
CREATE TABLE IF NOT EXISTS anticipo_payments (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    anticipo_id INT NOT NULL,
    amount      DECIMAL(10,2) NOT NULL,
    payment_method ENUM('cash','card') NOT NULL DEFAULT 'cash',
    -- Turno de caja en el que entro el dinero. No suma al corte, que cuenta
    -- ventas y un abono no lo es; pero sin esto el dinero del cajon no se
    -- puede atribuir a nadie ni salir en el reporte que lo cuadra.
    cash_session_id INT NULL,
    created_by  INT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes       VARCHAR(255) NULL,
    CONSTRAINT fk_ap_anticipo FOREIGN KEY (anticipo_id) REFERENCES anticipos(id) ON DELETE CASCADE,
    CONSTRAINT fk_ap_user     FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_ap_sesion   FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL,
    CONSTRAINT chk_ap_amount  CHECK (amount > 0),
    INDEX idx_anticipo (anticipo_id, created_at),
    INDEX idx_sesion   (cash_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  TIENDA WEB
-- =============================================================================

-- FIX 10 — indices para las 4 busquedas reales: email, client_code,
-- verification_token y stripe_customer_id. Antes solo existia la PK.
CREATE TABLE IF NOT EXISTS clientes (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id         INT NOT NULL,
    nombre             VARCHAR(100) NOT NULL,
    apellido           VARCHAR(100) NOT NULL,
    fecha_nac          DATE NOT NULL,
    email              VARCHAR(255) NOT NULL,
    password           VARCHAR(255) NOT NULL,
    client_code        VARCHAR(20)  NOT NULL,
    telefono           VARCHAR(30)  NULL,
    nacionalidad       VARCHAR(100) NULL,
    contacto_preferido VARCHAR(30)  NULL,
    avatar             VARCHAR(255) NULL,
    store_credit       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    stripe_customer_id VARCHAR(255) NULL,
    email_verified     TINYINT(1) NOT NULL DEFAULT 0,
    verification_token VARCHAR(255) NULL,
    token_expires_at   DATETIME NULL,
    session_version    INT NOT NULL DEFAULT 1,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_clientes_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT chk_clientes_credit CHECK (store_credit >= 0),
    UNIQUE KEY uniq_email       (email),
    UNIQUE KEY uniq_client_code (client_code),
    INDEX idx_verification_token (verification_token),
    INDEX idx_stripe_customer    (stripe_customer_id),
    INDEX idx_empresa            (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unifica las dos definiciones que se contradecian: scripts/create-cart-tables.js
-- creaba `numero NOT NULL` y la ruta /api/addresses lo volvia nullable en runtime
-- y agregaba numero_ext / numero_int.
CREATE TABLE IF NOT EXISTS user_addresses (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id    INT NOT NULL,
    nombre_recibe VARCHAR(200) NOT NULL,
    calle         VARCHAR(300) NOT NULL,
    numero_ext    VARCHAR(30)  NULL,
    numero_int    VARCHAR(30)  NULL,
    colonia       VARCHAR(200) NOT NULL,
    municipio     VARCHAR(200) NOT NULL,
    estado        VARCHAR(100) NOT NULL,
    cp            VARCHAR(10)  NOT NULL,
    referencias   VARCHAR(500) NULL,
    is_default    TINYINT(1) NOT NULL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_addr_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    INDEX idx_cliente_default (cliente_id, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carts (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    estado     ENUM('activo','pagado','abandonado') NOT NULL DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_carts_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    INDEX idx_cliente_estado (cliente_id, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 5 — UNIQUE (cart_id, product_id): el mismo producto ya no puede entrar
-- dos veces como filas separadas. Los agregados repetidos suman cantidad
-- con INSERT ... ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity).
-- FIX 8 — FK a products: ya no se puede meter un producto inexistente.
CREATE TABLE IF NOT EXISTS cart_items (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    cart_id          INT NOT NULL,
    product_id       INT NOT NULL,
    quantity         INT NOT NULL DEFAULT 1,
    product_type     ENUM('stock','preventa') NOT NULL DEFAULT 'stock',
    anticipo_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ci_cart    FOREIGN KEY (cart_id)    REFERENCES carts(id)    ON DELETE CASCADE,
    CONSTRAINT fk_ci_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT chk_ci_qty    CHECK (quantity > 0),
    UNIQUE KEY uniq_cart_product (cart_id, product_id),
    INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 1 — las 16 columnas del pedido web que vivian en `sales`:
--   web_status, web_process_type, stock_deducted, tracking_number,
--   envia_label_data, envia_quote_data, shipping_method, shipping_address_json,
--   shipping_status, claim_status, claim_notes, claim_type, delivered_at,
--   shipped_at, refund_id, cliente_id.
-- Quedaban NULL en cada venta de mostrador y obligaban a ALTER TABLE sobre la
-- ruta mas caliente del POS cada vez que cambiaba la tienda.
--
-- FIX 2 — foreign keys reales. Antes eran INT sueltos en la tabla que une
-- Stripe con el inventario: nada impedia un pedido huerfano.
--
-- FIX 3 — UNIQUE en payment_intent_id: la idempotencia contra Stripe la impone
-- la base, no el codigo.
--
-- FIX 4 — sin items_json. Los renglones viven en sale_items, ya normalizado.
--
-- FIX 15 — UNA SOLA tabla dueña del pedido web, con las dos maquinas de estado
-- juntas. Antes el estado vivia partido en `sales.web_status` (POS) y
-- `bisonte_orders.status` (tienda), sincronizados por HTTP: si la llamada
-- fallaba, el POS marcaba cancelado y la tienda seguia en pending, dejando
-- dinero autorizado que nadie liberaba.
--
-- Son dos ejes distintos y honestos -- el cobro y la entrega avanzan por
-- separado -- pero al vivir en la misma fila una sola transaccion los mueve y
-- ya no pueden divergir.
CREATE TABLE IF NOT EXISTS bisonte_orders (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    sale_id               INT NOT NULL,
    cliente_id            INT NULL,

    -- Eje cobro (Stripe)
    payment_intent_id     VARCHAR(255) NOT NULL,
    pago_estado           ENUM('autorizado','capturado','cancelado','reembolsado')
                              NOT NULL DEFAULT 'autorizado',
    refund_id             VARCHAR(255) NULL,

    -- Eje entrega (operacion). Los valores son los que ya usa el POS en
    -- VALID_STATUSES; `reclamo` es un estado del pedido, no una bandera aparte.
    estado                ENUM('pendiente','confirmado','envio','entregado','reclamo','cancelado')
                              NOT NULL DEFAULT 'pendiente',
    process_type          ENUM('auto','manual') NULL,
    stock_deducted        TINYINT(1) NOT NULL DEFAULT 0,

    -- Envio. Un solo nombre por dato: el POS escribia envia_label_data y la
    -- tienda label_data para lo mismo.
    shipping_method       VARCHAR(100) NULL,
    -- Sub-estado dentro de `envio`: la guia existe pero aun no sale del local.
    shipping_status       ENUM('en_espera','despachado') NULL,
    tracking_number       VARCHAR(150) NULL,
    shipping_address_json JSON NULL,
    envia_quote_data      JSON NULL,
    envia_label_data      JSON NULL,

    -- Reclamos
    claim_status          VARCHAR(50)  NULL,
    claim_type            VARCHAR(50)  NULL,
    claim_notes           TEXT NULL,

    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at          DATETIME NULL,
    shipped_at            DATETIME NULL,
    delivered_at          DATETIME NULL,
    cancelled_at          DATETIME NULL,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_bo_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
    CONSTRAINT fk_bo_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    UNIQUE KEY uniq_payment_intent (payment_intent_id),
    UNIQUE KEY uniq_sale           (sale_id),
    INDEX idx_estado         (estado),
    INDEX idx_pago_estado    (pago_estado),
    INDEX idx_cliente_estado (cliente_id, estado),
    INDEX idx_tracking       (tracking_number),
    INDEX idx_cola           (estado, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 16 — bandeja de salida para las llamadas entre las dos apps.
--
-- El POS llama por HTTP a la tienda para capturar o cancelar en Stripe (la
-- llave vive alla). Ese salto no es transaccional, y en
-- cascadeCancelLaterOrders el error se tragaba en silencio:
--
--     try { await callBisonteCapture(id, 'cancel'); } catch { }
--     UPDATE sales SET web_status = 'cancelado' ...
--
-- El POS daba por cancelado un pedido cuya autorizacion seguia viva en la
-- tarjeta del cliente. Ahora la intencion se escribe aqui dentro de la misma
-- transaccion que cambia el estado, y un worker la reintenta hasta confirmarla.
-- Si algo queda sin procesar, se ve: no se pierde en un catch vacio.
CREATE TABLE IF NOT EXISTS integration_outbox (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    tipo         ENUM('capture','cancel','refund') NOT NULL,
    sale_id      INT NOT NULL,
    payload      JSON NULL,
    estado       ENUM('pendiente','procesando','ok','fallido') NOT NULL DEFAULT 'pendiente',
    intentos     INT NOT NULL DEFAULT 0,
    ultimo_error TEXT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Cuando volver a intentar. Se recalcula en cada fallo con retroceso
    -- exponencial; NULL significa "ahora". No sirve derivarlo de created_at:
    -- esa fecha no avanza con los reintentos.
    next_retry_at DATETIME NULL,
    processed_at DATETIME NULL,
    CONSTRAINT fk_outbox_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    -- Una intencion viva por tipo y venta: reencolar no duplica el cobro.
    UNIQUE KEY uniq_sale_tipo (sale_id, tipo),
    INDEX idx_pendientes (estado, next_retry_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupons (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id      INT NULL,
    code            VARCHAR(64) NOT NULL,
    discount_type   ENUM('percentage','fixed') NOT NULL,
    discount_value  DECIMAL(10,2) NOT NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    expiration_date DATETIME NULL,
    usage_limit     INT NULL,
    usage_count     INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_coupons_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT chk_coupons_count  CHECK (usage_count >= 0),
    UNIQUE KEY uniq_code (code),
    INDEX idx_lookup (code, status, expiration_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    coupon_id  INT NOT NULL,
    cliente_id INT NOT NULL,
    sale_id    INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cr_coupon  FOREIGN KEY (coupon_id)  REFERENCES coupons(id)  ON DELETE CASCADE,
    CONSTRAINT fk_cr_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    CONSTRAINT fk_cr_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE SET NULL,
    UNIQUE KEY uniq_coupon_cliente (coupon_id, cliente_id),
    INDEX idx_cliente (cliente_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 11 — indice compuesto (cliente_id, created_at DESC): la consulta real es
-- WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 50. Con solo idx_cliente
-- MySQL ordenaba en filesort.
CREATE TABLE IF NOT EXISTS credit_history (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id  INT NOT NULL,
    amount      DECIMAL(10,2) NOT NULL,
    description VARCHAR(300) NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ch_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    INDEX idx_cliente_created (cliente_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_notifications (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    type       VARCHAR(50) NOT NULL DEFAULT 'info',
    title      VARCHAR(200) NOT NULL,
    body       VARCHAR(500) NULL,
    ref_id     VARCHAR(100) NULL,
    read_at    TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_un_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_cliente_ref (cliente_id, ref_id),
    INDEX idx_cliente_created (cliente_id, created_at DESC),
    INDEX idx_cliente_unread  (cliente_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tags (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    name     VARCHAR(100) NOT NULL,
    etiqueta VARCHAR(100) NULL,
    UNIQUE KEY uniq_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_tags (
    product_id INT NOT NULL,
    tag_id     INT NOT NULL,
    PRIMARY KEY (product_id, tag_id),
    CONSTRAINT fk_pt_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_pt_tag     FOREIGN KEY (tag_id)     REFERENCES tags(id)     ON DELETE CASCADE,
    INDEX idx_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Las opiniones que sostienen products.rating. Antes esas dos columnas eran un
-- promedio sin nadie detras: no habia donde poner una nota, ni desde la tienda
-- ni desde el POS, y las unicas del catalogo estaban escritas a mano en
-- lib/demo.js. La tabla es solo de la tienda; el POS no la ve ni la necesita.
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

-- FIX 9 — `is_demo` reemplaza el numero magico `cliente_id >= 900001` que las
-- queries usaban para separar votos de prueba de votos reales.
CREATE TABLE IF NOT EXISTS event_votes (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    evento     VARCHAR(64) NOT NULL,
    cliente_id INT NOT NULL,
    opcion     VARCHAR(32) NOT NULL,
    is_demo    TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_evento_cliente (evento, cliente_id),
    INDEX idx_evento_opcion (evento, opcion),
    INDEX idx_evento_demo   (evento, is_demo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 12 — `evento` es PRIMARY KEY, que es lo que hace valido el
-- INSERT ... ON DUPLICATE KEY UPDATE que usa /api/eventos/mundial.
CREATE TABLE IF NOT EXISTS event_results (
    evento     VARCHAR(64) PRIMARY KEY,
    ganador    VARCHAR(32) NOT NULL,
    codigo     VARCHAR(64) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  MODULOS DEL POS QUE VIVIAN EN MIGRACIONES EN RUNTIME
--
--  Estas tablas las creaba el backend al arrancar (routes/preventas.js,
--  routes/storeCredits.js). Aparecieron al levantar el POS contra el esquema
--  reconstruido: sin ellas, Preventas y Creditos de Tienda responden 500.
--
--  Una preventa (pre_orders) es un pedido que viene en camino o que aun hay que
--  surtir. Por eso no tiene product_id ni reserva stock: el articulo todavia no
--  existe en el catalogo. Es lo que la distingue del apartado, que es siempre
--  mercancia que ya esta en la tienda.
--
--  El plazo cuenta desde que llega, no desde que se pide: hasta que alguien
--  marca arrived_at el reloj no corre, porque no se le puede exigir a nadie que
--  recoja lo que todavia no ha llegado.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pre_order_batches (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id   INT NOT NULL,
    name         VARCHAR(255) NULL,
    total_orders INT DEFAULT 0,
    total_value  DECIMAL(10,2) DEFAULT 0,
    closed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pob_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    INDEX idx_empresa (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pre_orders (
    id                     INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id             INT NOT NULL,
    batch_id               INT NULL,
    order_number           VARCHAR(50) NOT NULL,
    client_number          VARCHAR(50) NULL,
    client_name            VARCHAR(255) NULL,
    client_phone           VARCHAR(50) NULL,
    client_email           VARCHAR(255) NULL,
    client_address         TEXT NULL,
    title                  VARCHAR(255) NULL,
    artist                 VARCHAR(255) NULL,
    group_name             VARCHAR(255) NULL,
    language               VARCHAR(50) NULL,
    category               TEXT NULL,
    photo_url              LONGTEXT NULL,
    total_price            DECIMAL(10,2) NOT NULL DEFAULT 0,
    deposit                DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_paid             DECIMAL(10,2) NOT NULL DEFAULT 0,
    balance                DECIMAL(10,2) NOT NULL DEFAULT 0,
    status                 ENUM('pending','paid','cancelled','delivered','expired') DEFAULT 'pending',
    is_paid_in_full        TINYINT(1) DEFAULT 0,
    last_payment_date      DATE NULL,
    -- Cuando el pedido llego a la tienda. Mientras sea NULL el pedido no vence:
    -- es lo unico que distingue "el cliente no ha venido a recoger" de "el
    -- proveedor todavia no lo ha mandado".
    arrived_at             DATETIME NULL,
    -- Se calcula al marcar la llegada y se guarda en la fila: si manana la
    -- tienda pasa a 20 dias, los pedidos ya avisados conservan lo prometido.
    dias_plazo             SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    expires_at             DATETIME NULL,
    aviso_previo_at        DATETIME NULL,
    aviso_vencido_at       DATETIME NULL,
    expired_at             DATETIME NULL,
    international_order    TINYINT(1) DEFAULT 0,
    international_country  VARCHAR(50) NULL,
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_po_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_po_batch   FOREIGN KEY (batch_id)   REFERENCES pre_order_batches(id) ON DELETE SET NULL,
    CONSTRAINT chk_po_plazo  CHECK (dias_plazo > 0),
    -- El vencimiento nace de la llegada. Una fecha limite sin llegada marcada
    -- seria un reloj que arranco solo, y vencerle el pedido a quien todavia
    -- espera es justo lo que no puede pasar.
    CONSTRAINT chk_po_arribo CHECK (expires_at IS NULL OR arrived_at IS NOT NULL),
    UNIQUE KEY uniq_order_empresa (empresa_id, order_number),
    INDEX idx_empresa (empresa_id),
    INDEX idx_batch   (batch_id),
    INDEX idx_status  (status),
    -- La consulta del panel y la del job nocturno: pedidos de una empresa
    -- ordenados por lo que esta mas cerca de vencer.
    INDEX idx_vencimiento (empresa_id, status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pre_order_payments (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    pre_order_id   INT NOT NULL,
    amount         DECIMAL(10,2) NOT NULL,
    payment_date   DATE NULL,
    payment_number INT NOT NULL,
    -- Las mismas tres columnas que anticipo_payments, con los mismos nombres:
    -- el reporte de abonos une los dos modulos y no deberia traducir nada.
    payment_method  ENUM('cash','card') NOT NULL DEFAULT 'cash',
    cash_session_id INT NULL,
    created_by      INT NULL,
    notes          TEXT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pop_order  FOREIGN KEY (pre_order_id)    REFERENCES pre_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_pop_sesion FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL,
    CONSTRAINT fk_pop_user   FOREIGN KEY (created_by)      REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_pre_order (pre_order_id),
    INDEX idx_sesion    (cash_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vale de tienda con codigo, emitido en el POS. Distinto de clientes.store_credit,
-- que es el saldo a favor de una cuenta de la tienda web: aquel va ligado a la
-- persona, este al codigo y puede canjearlo quien lo traiga.
CREATE TABLE IF NOT EXISTS store_credits (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id       INT NOT NULL,
    cliente_id       INT NULL,
    code             VARCHAR(50) NOT NULL,
    balance          DECIMAL(10,2) NOT NULL DEFAULT 0,
    original_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
    expiration_date  DATE NULL,
    notes            TEXT NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sc_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_sc_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    CONSTRAINT chk_sc_balance CHECK (balance >= 0),
    UNIQUE KEY uniq_code (code),
    INDEX idx_empresa (empresa_id),
    INDEX idx_cliente (cliente_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_credit_uses (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    credit_id      INT NOT NULL,
    sale_id        INT NULL,
    amount_used    DECIMAL(10,2) NOT NULL,
    balance_before DECIMAL(10,2) NOT NULL,
    balance_after  DECIMAL(10,2) NOT NULL,
    used_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_scu_credit FOREIGN KEY (credit_id) REFERENCES store_credits(id) ON DELETE CASCADE,
    CONSTRAINT fk_scu_sale   FOREIGN KEY (sale_id)   REFERENCES sales(id) ON DELETE SET NULL,
    INDEX idx_credit_used (credit_id, used_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── ERP · Pedidos (rentabilidad por pedido) ────────────────────────────────
-- Modulo ERP integrado al POS. Cada pedido a proveedor lleva sus costos y
-- piezas; las metricas (inversion, precio de venta, ganancia real) se calculan
-- en la app a partir de estos campos. Multi-tenant por empresa_id.
CREATE TABLE IF NOT EXISTS erp_pedidos (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id          INT NOT NULL,
    proveedor           VARCHAR(120) NOT NULL,
    fecha_pedido        DATE NOT NULL,
    costo_producto      DECIMAL(18,2) NOT NULL DEFAULT 0,
    costo_envio         DECIMAL(18,2) NOT NULL DEFAULT 0,
    impuestos           DECIMAL(18,2) NOT NULL DEFAULT 0,
    imprevistos         DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_piezas        INT NOT NULL DEFAULT 0,
    piezas_vendidas     INT NOT NULL DEFAULT 0,
    porcentaje_ganancia DECIMAL(8,2) NOT NULL DEFAULT 0,
    status              ENUM('EN_RUTA','PROBLEMA_ADUANAS','EN_VENTA','LIQUIDANDO') NOT NULL DEFAULT 'EN_RUTA',
    notas               TEXT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_pedidos_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    INDEX idx_erp_pedidos_empresa (empresa_id, fecha_pedido)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Semilla de feature flags del POS
INSERT IGNORE INTO features (name, display_name, description, icon) VALUES
    ('sales_statistics',  'Estadisticas de Ventas', 'Ver estadisticas avanzadas de ventas',            'chart-bar'),
    ('competitor_prices', 'Precios de Competencia', 'Registrar y comparar precios de la competencia',  'scale'),
    ('advances',          'Anticipos',              'Gestionar anticipos de clientes',                 'banknotes'),
    ('suppliers',         'Proveedores',            'Gestion de proveedores',                          'truck');
