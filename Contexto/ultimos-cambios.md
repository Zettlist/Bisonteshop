# Contexto — últimos cambios

_Actualizado: 2026-09-15_

> Este archivo se sobrescribe cada sesión. Es el estado vigente, no un historial.

---

## Lo último que hice

### 1 · Reserva de inventario en los pedidos web (el trabajo grande)

El POS daba por hecho, **por escrito** en `TorlanPOS/backend/routes/webOrders.js`,
que «la tienda reserva al confirmar el checkout (`stock_reservado += cantidad`)».
La tienda no lo hacía: no había una sola escritura de `stock_reservado` en todo
el proyecto. No se notaba porque el POS la resta con `GREATEST(0, ...)` —
restarle a un cero que nunca subió no rompe nada visible.

Consecuencia: con nueve piezas entraban nueve pedidos, **y el décimo, y el
undécimo**, todos con la tarjeta ya autorizada. `stock` no descuenta lo que ya
tiene dueño, así que los pedidos anteriores eran invisibles para el siguiente.

Se cerró por tres puertas, de fuera adentro:

- **`Bisonteshop/lib/reserva.mjs`** (nuevo) — `reservarStock()`. La condición va
  DENTRO del UPDATE (`WHERE stock_reservado + N <= stock`): leer y luego
  escribir deja una ventana, y dos clientes que leen «queda 1» a la vez leen
  los dos que sí. Agrupa por producto (un carrito puede traer el mismo id dos
  veces) y ordena por id (para no cruzar candados y provocar un deadlock).
  Es `.mjs` y no `.js` porque el `package.json` de la tienda no declara
  `"type": "module"` y las pruebas de `db/tests/` no podrían importarlo.
- **`Bisonteshop/lib/pricing.js`** — `priceCart` lee `stock_disponible` y
  devuelve `disponible` por renglón más una lista `sinExistencia`. NO descarta
  renglones: la huella del carrito se calcula sobre esa lista y quitar uno haría
  que `/confirm` contestara «el carrito no coincide con el pago».
- **`Bisonteshop/app/api/checkout/route.js`** — rechaza con 409 **antes** de
  crear el PaymentIntent.
- **`Bisonteshop/app/api/checkout/confirm/route.js`** — aparta de verdad dentro
  de la transacción; si no alcanza, hace rollback, **cancela el PaymentIntent**
  (libera el dinero retenido) y contesta 409.
- **`app/api/{mangas,figuras,adultos}/route.js`** — las tres consultas del
  catálogo añaden `p.stock_disponible`. Antes pedían `p.stock` y la tarjeta
  anunciaba nueve piezas con las nueve vendidas.
- **`app/checkout/page.js`** — al recibir `sinExistencia` devuelve al cliente al
  paso 1 (el carrito) y olvida el `clientSecret`, que ya está cancelado.
- **`db/migrations/2026-09-15-reserva-de-pedidos-web.sql`** — **YA APLICADA.**
  Puso al día el contador con los pedidos que ya existían (5 filas, 20 piezas).
  No es idempotente: suma, no asigna. No volver a correrla.
- **`db/tests/reserva-web.mjs`** (nuevo, 9 pruebas) + `conexionAparte()` en
  `db/tests/harness.mjs`, que permite probar la carrera con dos transacciones
  de verdad. Suite completa: **197/197**.

### 2 · El pedido que se cuela se cancela solo (POS)

`TorlanPOS/backend/routes/webOrders.js` — al confirmar sin mercancía, antes
contestaba «Stock insuficiente. Cancela manualmente y contacta al cliente» y
dejaba el pedido en `pendiente` con la tarjeta autorizada, esperando a que
alguien se acordara. Ahora se anula en la misma transacción: libera lo
apartado, encola la liberación del cargo y manda el correo.

El cuerpo de la cancelación salió a `anularPedido()` y lo comparten `/cancel` y
la confirmación. Tenerlo duplicado garantizaba que acabaran divergiendo, y la
copia que olvidara `releaseReservation` dejaría piezas apartadas para un pedido
muerto.

### 3 · La pantalla de Pedidos leía la respuesta… o no

`TorlanPOS/frontend/src/pages/WebOrders/index.jsx` — `ejecutar()` tiraba la
respuesta entera a la basura: ni leía el cuerpo ni miraba el código. Con la
cancelación automática puesta habría sido peor que antes (el pedido desaparece
de la cola y parece confirmado). Ahora se pinta lo que contesta el servidor,
con el detalle de qué artículo faltó.

### 4 · Un pedido `pendiente` no puede tener el paquete entregado

Dos fallos encadenados:

- `estados.js` — la insignia de la lista elegía mal. La fase del paquete ganaba
  SIEMPRE, así que un pedido sin confirmar con una guía «entregada» salía en
  verde dentro de «Por atender». Ahora manda de quién es el pedido: `pendiente`
  y `confirmado` son del mostrador, de `envio` en adelante del transportista.
  Función `insignia()`.
- `backend/tools/simulador-envio.mjs` — escribía `shipping_status = 'entregada'`
  sobre pedidos en `pendiente`. Simula a la paquetería, y la paquetería no puede
  mover un paquete que nunca le entregaron. Nuevo guardia `exigirDespachado()`
  en `guia`, `avanzar` y `paso`. **`ver` y `limpiar` quedan fuera a propósito**:
  el segundo es justo lo que hace falta para reparar un pedido que ya quedó así.

Los 3 pedidos sucios (#60, #56, #53) se limpiaron con ese `limpiar`.

### 5 · Meses sin intereses

`app/api/checkout/route.js` — mínimo **$3,000** medido contra el **subtotal de
la mercancía**, no contra lo que acaba pasando por la tarjeta. Un carrito de
$3,200 con $500 de saldo cobra $2,700 y sigue llevando meses: la regla es del
carrito. De paso arregla una comparación que nunca cuadraba (`amountInCents` va
en la moneda del cargo; con la tienda en USD comparaba centavos de dólar contra
un mínimo en pesos).

### 6 · `MAINTENANCE_BYPASS` rotado

Lo hizo Ricardo desde su terminal. 48 caracteres hexadecimales, huella sha256
`98046d938d69`. El valor viejo, que había quedado escrito en una conversación,
ya no sirve.

---

## Lo último que deployé

Los tres, el 2026-09-15. **Revisiones confirmadas preguntándole al servicio**,
no de memoria:

| Qué | Comando | Revisión viva |
|---|---|---|
| Tienda | `gcloud run deploy bisonte-manga --source . --project torlan-pro --region us-central1 --update-env-vars MSI_ACTIVO=1,MSI_MONTO_MINIMO=3000` | `bisonte-manga-00027-c5g` |
| POS backend | `gcloud run deploy torlan-api --source . --project torlan-web --region us-central1` (con el intercambio de `.gcloudignore`) | `torlan-api-00012-9qd` |
| POS frontend | `npm run build` + `npx firebase-tools deploy --only hosting --project torlan-web` | `assets/index-DFxjQD7v.js` |

La revisión 00027 de la tienda es la del `MAINTENANCE_BYPASS` rotado, posterior
al despliegue del código (00026).

`bisontemanga.com` contesta **503 con la página de «En construcción»**, que es
lo correcto: `MAINTENANCE_MODE=1`. El contenedor arranca bien, está cerrado al
público a propósito.

---

## Decisiones tomadas (aún sin construir)

Abre **después del 23 de septiembre de 2026**.

### Apartados y preventa por web

Hoy **no existe**: `ApartarDialogo` informa y no envía nada, y
`/api/me/apartados` es sólo lectura («la tabla `anticipos` la escribe el POS»).
Nacen únicamente en el mostrador. Se decidió construir el camino de compra:

- El cliente **elige cuánto paga**, entre el mínimo de su tipo y el 100%.
  Mínimos: **30% apartado, 50% preventa**, piso de $100. Ya están en
  `lib/apartado.js` y son correctos.
- **Cobro real inmediato, no retención.** Una autorización de Stripe caduca a
  los ~7 días y una preventa tarda semanas.
- **Carrito mixto se parte en dos pedidos.**
- El saldo se liquida desde **`/perfil/apartados`**, con anuncio en la web al
  llegar. Sólo correo a la llegada, sin fecha estimada en la ficha.
- **Si no paga en 30 días, pierde el anticipo.** Esto YA es el comportamiento:
  `apartadosVencidos.js` y `preventasVencidas.js` vencen, devuelven la pieza y
  avisan, y ninguno reembolsa. Al ser la regla más dura, tiene que quedar
  escrita en la propia pantalla de compra, junto al monto.
- **Preventa sólo por web**: hay que DESACTIVAR su creación desde el mostrador.
  El apartado sigue en los dos sitios.

### Rediseño de la pantalla de Productos (lo siguiente)

`TorlanPOS/frontend/src/pages/Products.jsx` son **2.245 líneas**, con
`CatalogoProductos` ocupando 2.068 de ellas en un solo componente, ~30
`useState` y **9 modales**. El formulario solo son ~600 líneas con 13 secciones
en una columna. Es el mismo monolito que era `WebOrders.jsx` antes de partirlo.

**Ricardo NO tiene tienda física.** Toda la venta es web; sólo vende en persona
en eventos ocasionales. Eso reordena las prioridades del rediseño (ver abajo).

---

## Hallazgos sin resolver

### La venta de mostrador no descuenta inventario

`TorlanPOS/backend/routes/sales.js`, `POST /` — inserta `sales`, inserta
`sale_items`, suma el cupón y contesta. **Nunca toca `products.stock`.**
Comprobado de tres formas: leyendo el manejador entero, buscando `SET stock` en
todo el backend (sólo aparece en apartados, preventas y pedidos web) y mirando
qué llama `Sales.jsx` (sólo `POST /sales`, no hay segunda llamada). Tampoco va
en transacción.

Hay **0 ventas de mostrador** registradas, así que nunca ha mordido. Como no hay
tienda física, esto sólo afecta a **eventos**. Pendiente de saber cómo cobra
Ricardo en ellos: si usa el POS con caja abierta, cada evento desfasa el
inventario por todo lo vendido ese día.

### La cotización de envío ignora las medidas

`Bisonteshop/app/api/shipping/quote/route.js` — `getPackaging()` calcula el
paquete con una **tabla fija según cuántos artículos lleve el carrito** (1 pieza
= 23×32×1 cm y 250 g; 2-3 = 600 g; 4+ = 1.2 kg) y **nunca consulta `products`**.
Ni `format_id`, ni `dimensions`, ni `weight`.

El POS usa `quote.pkg` al comprar la guía, o sea lo mismo, así que los dos lados
coinciden entre sí — eso es lo que evita perder dinero por descuadre. Pero los
dos están adivinando: cuatro tomos pesados se cotizan igual que cuatro revistas
delgadas, y la diferencia contra lo que factura Envía la paga la tienda.

Ricardo dice que los productos **sí tienen medidas capturadas**. Queda por
recontar cuántos: mi cifra de «11 sin medidas» contaba `format_id` vacío *y*
peso vacío, y puede que esos 11 las tengan en el campo de texto libre
`dimensions`. **No se pudo recomprobar: se cayó el proxy de Cloud SQL.**

### El catálogo está casi agotado

De 52 productos reales: **3 agotados y 34 con una o dos piezas**. En una tienda
sólo-web, un agotado es una página muerta y nadie se entera. Es lo más urgente
del rediseño de Productos.

### Pedidos pendientes abandonados

Un pedido pagado que nadie confirma ni cancela retiene sus piezas para siempre.
La autorización de Stripe caduca a los ~7 días; el aparte no. **Decisión de
Ricardo: dejarlo por ahora.**

### Preventa por web hoy se auto-cancelaría

Un producto en `estado = 'preventa'` tiene `stock = 0`, así que al confirmarlo
el POS lo mete en `faltantes` y (con el cambio de hoy) lo cancela solo. Hoy no
hay ningún producto en preventa, así que es teórico — pero avisar antes de
marcar el primero.

---

## Pendientes para abrir

1. **Claves de Stripe EN VIVO** (`sk_live_`, `pk_live_`) y destino de webhook
   nuevo con su firma. **Nunca por el chat**: van al archivo gitignored o
   directo a Cloud Run.
2. **Borrar los datos de prueba** — `db/limpiar-datos-de-prueba.sql`, escrito y
   sin correr. Ricardo pidió dejar unos pocos pendientes para probar el flujo
   nuevo del simulador. Hoy: 20 pendientes, 40 cancelados, 1 en camino.
3. **`MAINTENANCE_MODE=0`** el día de abrir.
4. **Pasar `db/.credenciales-TODAS.txt` a Bitwarden y borrarlo.**
5. Los dos correos al cliente («en reparto» y «entregado») — el paso 5 del
   rediseño de Pedidos, nunca construido.

**Envía se queda en pruebas** por decisión de Ricardo. Ojo con la trampa: la
tienda cotiza contra `api.envia.com` (producción, token `369077de46`) y el POS
generaría las guías contra `api-test.envia.com` (token `1fd8c48b04`, y sin
`ENVIA_API_URL` el código cae a ese valor por defecto). El día que se manden
pedidos reales hacen falta **las dos cosas a la vez**: token de producción
propio para el POS y `ENVIA_API_URL=https://api.envia.com` en `torlan-api`.
Sólo una de las dos deja el POS sin autenticar.

---

## Cosas que NO hay que hacer

- **No commitear `.claude/launch.json`** del POS: su cambio local apunta a
  `C:/Users/hable/...`, una ruta absoluta que no existe en otra máquina.
- **No commitear `Bisonteshop/Bisonteshop/`** — son 368 MB de una copia del
  repo dentro del repo. Ya hay un commit que trató ese problema.
- **No volver a correr** `2026-09-15-reserva-de-pedidos-web.sql` ni
  `2026-09-15-productos-de-prueba.sql`: suman, no asignan.
- **Nada de credenciales por el chat.** No las redacta. En este proyecto ya se
  filtraron así `MAINTENANCE_BYPASS`, la contraseña de `pos_app` y `CRON_SECRET`
  dos veces — una porque gcloud devolvió el valor dentro de un mensaje de error.
  Para comprobar que un secreto está puesto, pasar la salida por un hash y
  enseñar sólo la huella y el largo.
- En Windows usar **`gcloud.cmd`**, no `gcloud`: el segundo es un `.ps1` y
  PowerShell tiene desactivada la ejecución de scripts.
