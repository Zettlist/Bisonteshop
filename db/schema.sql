-- =============================================================================
--  BISONTE SHOP + TORLAN POS — Esquema unificado
--  MySQL 8.0 / InnoDB / utf8mb4
--
--  Base de datos compartida entre las dos apps. El aislamiento se hace con
--  GRANTs por usuario (ver db/grants.sql), no separando bases: el POS escribe
--  inventario y la tienda lo lee en la misma transaccion, sin sincronizacion.
--
--  Reconstruido tras la perdida del proyecto GCP (jun 2026). Incorpora 13
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
    password_hash        VARCHAR(255) NOT NULL,
    empresa_id           INT NULL,
    role                 ENUM('global_admin','empresa_admin','employee') NOT NULL DEFAULT 'employee',
    is_admin             TINYINT(1) DEFAULT 0,
    first_login          TINYINT(1) DEFAULT 1,
    has_setup_complete   TINYINT(1) DEFAULT 0,
    onboarding_completed TINYINT(1) DEFAULT 0,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
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

-- FIX 7 — reemplaza products.damian / products.bernat.
-- Antes, cada proveedor nuevo exigia un ALTER TABLE sobre products.
CREATE TABLE IF NOT EXISTS suppliers (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    nombre     VARCHAR(150) NOT NULL,
    contacto   VARCHAR(150) NULL,
    telefono   VARCHAR(30)  NULL,
    activo     TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_suppliers_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_empresa_nombre (empresa_id, nombre),
    INDEX idx_empresa (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 6 — se elimina la columna `price`. La migracion 006 la dejo "por
-- retrocompatibilidad" y quedo ambigua frente a sale_price durante un anio.
-- Fuente de verdad: cost_price (compra) y sale_price (venta).
CREATE TABLE IF NOT EXISTS products (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id       INT NOT NULL,
    name             VARCHAR(255) NOT NULL,
    cost_price       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    sale_price       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    stock            INT NOT NULL DEFAULT 0,
    category         VARCHAR(100) NULL,
    barcode          VARCHAR(100) NULL,
    sbin_code        VARCHAR(100) NULL,
    isbn             VARCHAR(20)  NULL,
    extras           TEXT NULL,
    publication_date VARCHAR(50)  NULL,
    publisher        VARCHAR(255) NULL,
    page_count       INT NULL,
    dimensions       VARCHAR(100) NULL,
    weight           DECIMAL(8,2) NULL,
    page_color       VARCHAR(50)  NULL,
    language         VARCHAR(10)  NULL,
    -- Campos de catalogo web (antes agregados sueltos con ALTER en runtime)
    is_adult         TINYINT(1) NOT NULL DEFAULT 0,
    image_url        VARCHAR(500) NULL,
    sinopsis         TEXT NULL,
    artist           VARCHAR(255) NULL,
    gender           VARCHAR(100) NULL,
    group_name       VARCHAR(150) NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT chk_products_stock  CHECK (stock >= 0),
    INDEX idx_empresa       (empresa_id),
    INDEX idx_category      (category),
    INDEX idx_isbn          (isbn),
    INDEX idx_barcode       (barcode),
    INDEX idx_empresa_name  (empresa_id, name),
    INDEX idx_empresa_sbin  (empresa_id, sbin_code),
    INDEX idx_empresa_adult (empresa_id, is_adult)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_suppliers (
    product_id  INT NOT NULL,
    supplier_id INT NOT NULL,
    qty         INT NOT NULL DEFAULT 0,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, supplier_id),
    CONSTRAINT fk_ps_product  FOREIGN KEY (product_id)  REFERENCES products(id)  ON DELETE CASCADE,
    CONSTRAINT fk_ps_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    INDEX idx_supplier (supplier_id)
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

CREATE TABLE IF NOT EXISTS anticipos (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id     INT NOT NULL,
    customer_name  VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NULL,
    total_amount   DECIMAL(10,2) NOT NULL,
    paid_amount    DECIMAL(10,2) DEFAULT 0,
    status         ENUM('pending','completed','cancelled') DEFAULT 'pending',
    created_by     INT NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at   TIMESTAMP NULL,
    notes          TEXT NULL,
    CONSTRAINT fk_ant_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_ant_user    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_empresa (empresa_id),
    INDEX idx_status  (status),
    INDEX idx_created (created_at)
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
    INDEX idx_anticipo (anticipo_id),
    INDEX idx_product  (product_id)
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

-- FIX 2 — foreign keys reales a sales y clientes. Antes eran INT sueltos: nada
-- impedia un pedido huerfano en la tabla que une Stripe con el inventario.
-- FIX 3 — UNIQUE en payment_intent_id. Es la llave de idempotencia contra
-- Stripe; un webhook reintentado ahora lo rechaza la base, no el codigo.
-- FIX 4 — sin items_json. Los renglones viven en sale_items, que ya existia
-- normalizado. Antes /api/orders hacia JSON.parse dentro de un loop y no se
-- podia preguntar "cuantas unidades del producto X se vendieron por web".
CREATE TABLE IF NOT EXISTS bisonte_orders (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    sale_id           INT NOT NULL,
    cliente_id        INT NULL,
    payment_intent_id VARCHAR(255) NOT NULL,
    status            ENUM('pending','captured','cancelled','refunded') NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_bo_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
    CONSTRAINT fk_bo_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    UNIQUE KEY uniq_payment_intent (payment_intent_id),
    INDEX idx_sale           (sale_id),
    INDEX idx_status         (status),
    INDEX idx_cliente_status (cliente_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FIX 1 — las 8 columnas de envio que vivian en `sales`. Solo existe fila
-- cuando hay pedido web, asi que las ventas de mostrador dejan de cargar NULLs
-- y la tienda ya no necesita ALTER TABLE sobre la tabla del POS.
CREATE TABLE IF NOT EXISTS bisonte_shipments (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    sale_id               INT NOT NULL,
    web_status            ENUM('pendiente','pagado','preparando','enviado','entregado','cancelado')
                              NOT NULL DEFAULT 'pendiente',
    shipping_status       VARCHAR(50)  NULL,
    claim_status          VARCHAR(50)  NULL,
    shipping_method       VARCHAR(100) NULL,
    tracking_number       VARCHAR(150) NULL,
    shipping_address_json JSON NULL,
    envia_quote_data      JSON NULL,
    label_data            JSON NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_bs_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_sale (sale_id),
    INDEX idx_web_status (web_status),
    INDEX idx_tracking   (tracking_number)
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

SET FOREIGN_KEY_CHECKS = 1;

-- Semilla de feature flags del POS
INSERT IGNORE INTO features (name, display_name, description, icon) VALUES
    ('sales_statistics',  'Estadisticas de Ventas', 'Ver estadisticas avanzadas de ventas',            'chart-bar'),
    ('competitor_prices', 'Precios de Competencia', 'Registrar y comparar precios de la competencia',  'scale'),
    ('advances',          'Anticipos',              'Gestionar anticipos de clientes',                 'banknotes'),
    ('suppliers',         'Proveedores',            'Gestion de proveedores',                          'truck');
