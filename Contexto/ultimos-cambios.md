# Contexto — últimos cambios

_Actualizado: 2026-06-13_

## Lo último que hice
Rediseño checkout estilo zine + más opciones de envío + quitar toggle día/noche + bloqueo zoom móvil.

### Rediseño checkout zine (`app/checkout/checkout.module.css`, `app/checkout/page.js`)
- CSS reescrito completo con vibe cómic de la landing: bordes negros 3px, sombras duras (`Xpx Ypx 0 #000`), Bebas Neue, Caveat, amarillo `#ffd60a` + rojo `#e63946`, rotaciones, paneles sticker.
- Mismos nombres de clase → no rompe lógica Stripe/Envía.
- Step 3 (paquetería) + mensajes de error migrados de estilos inline a clases zine (`.shipOption`, `.shipRadio`, `.shipPrice`, `.fieldError`).

### Más opciones de envío (`app/api/shipping/quote/route.js`)
- `rateCarrier` ahora devuelve **todos** los servicios de cada paquetería (antes solo el más barato). `POST` aplana, dedup por paquetería+servicio, cap `MAX_PER_CARRIER = 3`, ordena por precio.
- **Pendiente de config (no código):** que salgan Estafeta/DHL/Paquetexpress depende de Envía → `ENVIA_API_URL=https://api.envia.com` (prod, no sandbox) + `ENVIA_BEARER_TOKEN` prod con esas paqueterías contratadas. Sandbox suele dar solo Fedex.

### Quitar toggle día/noche (`components/Navbar.js`)
- Eliminado `<ThemeToggle />` de desktop y menú móvil + import. Tema fijo en oscuro. `ThemeToggle.js` queda huérfano (inofensivo).

### Bloqueo zoom móvil (`app/layout.js`)
- `export const viewport` con `maximumScale: 1`, `userScalable: false`. Desactiva pellizco/doble-tap-zoom en todo el sitio.
- Caveat: iOS Safari 10+ puede ignorar `user-scalable=no` (requeriría JS: bloquear `gesturestart`/`touchmove`). No implementado.

### Nota checkout: producto $0 no se puede pagar
- `lib/pricing.js:44` rechaza `sale_price <= 0` a propósito (recalcula desde BD, anti-manipulación; Stripe no autoriza $0). "Producto prueba" tiene precio 0 → "no tiene precio válido". No es bug; dar precio real para probar pago.

### (sesión previa) Rediseño /adultos + widget

### Landing adultos (`components/LandingZineAdultos.{js,module.css}`)
- Clon del landing principal en mood **morado/magenta** (palette `data-theme=adultos`: `#9b5de5` / `#e040fb` / `#0d0010`).
- Usado en `app/adultos/page.js` cuando `!showCatalog`. Disclaimer +18 y catálogo+filtros intactos.
- Hero: logo `/logo-hentai-sm.webp`, handNote "Bienvenido a… tu zona favorita", stickers SOLO+18 / ENVÍO DISCRETO / FORMATO ALTA CALIDAD, texto "...Todo lo que busca tu pervertida imaginación 😈".
- Botones doodle de redes: FB, IG, **X** (`x.com/bisontemanga`), mail→`/contacto` (filtro `#pencil-texture-adultos`).
- Sección "Categorías" **eliminada**.
- Story "Lo que buscabas, jeje": imagen chicas `/hentai-logo-main.png` **sin marco polaroid** (`.storyArt`).
- Novedades = `AdultProductGrid` (slot machine desde `/api/adultos`).

### Fix bug navbar lock
- En `/adultos` los links navbar (`?open=1&cat=...`) quedaban atorados en categoría vieja (Figuras→Mangas no limpiaba). El effect auto-open ahora setea `selectedCategory(cat)` + limpia tags/event reflejando la URL siempre. (`app/adultos/page.js`)

### X en landing principal
- Activada (estaba comentada) en `components/LandingZine.js` → `x.com/bisontemanga`.

### Widget evento (`components/eventos/mundial2026/MundialWidget.{js,module.css}`)
- Mascota grande adultos-aware: en `/adultos` usa `/bisonta-adultos.png`, fuera `/mundial-mascota.webp`. Votos van a la **misma DB** sin separar.
- Estado cerrado rediseñado: arranca cerrado; a los **2s** la Bisonta (`/bisonta-noti.png`) entra deslizándose desde la derecha + **bocadillo cómic** "¡Hay evento! click en mí para saber :3". Click → abre widget completo.
- Ícono cerrado **sin círculo** (solo PNG transparente, `object-fit: contain`, 130px, drop-shadow).

### Imágenes nuevas en `/public`
- `hentai-logo-main.png` (14MB — pendiente comprimir a webp)
- `bisonta-adultos.png` (2.3MB)
- `bisonta-noti.png` (5MB)

## Lo último que deployé
- **Servicio:** Cloud Run `bisonte-manga`, proyecto `bisonte-manga-shop-8202`, región `us-central1`.
- **Comando:** `gcloud run deploy bisonte-manga --source . --region us-central1 --project bisonte-manga-shop-8202`
- **Revisión actual (en producción):** `bisonte-manga-00120-6rf` — rediseño checkout zine + más opciones envío + quitar toggle día/noche + zoom móvil.
- **Revisión previa:** `bisonte-manga-00119-452` (bloqueo zoom móvil).

## Notas / pendientes
- Imágenes PNG pesadas — comprimir a `.webp`.
- CSS viejo en `app/adultos/adultos.module.css` quedó huérfano (inofensivo).
- `onCategory` prop sin uso tras quitar categorías (inofensivo).
- Deploy manda el working tree completo (no usa git); prod ya trae el WIP de deploys previos.
