# Base de datos

Esquema de la base compartida entre **Bisonte Shop** (Next.js) y **Torlan POS** (Express).

| Archivo | Qué es |
|---|---|
| `schema.sql` | Las 29 tablas. Única fuente de verdad. Idempotente. |
| `grants.sql` | Usuarios MySQL con permisos acotados por dominio. |
| `tests/` | 80 pruebas contra un MySQL 8 efímero. |
| `DEPLOY.md` | Plan de despliegue a Aiven + Cloud Run. |

## Correr las pruebas

```bash
cd db && npm install && npm test
```

Levanta un MySQL 8 temporal (descarga los binarios la primera vez, ~400 MB),
carga `schema.sql` y verifica los constraints por comportamiento — inserta filas
inválidas y confirma que la base las rechaza, en vez de leer el DDL.

Las dependencias viven en `db/package.json`, aparte del `package.json` de la app,
para que el `npm ci` del Dockerfile no las arrastre a la imagen de producción.

## Por qué una sola base

El POS escribe inventario y la tienda lo lee en la misma transacción. Ese
auto-sync que ven los proveedores cuando suben stock no es una función
programada: es la consecuencia de compartir base. Separarlas obligaría a
construir sincronización (API, webhooks o job) y abriría la puerta a sobreventa.

El aislamiento se resuelve con `grants.sql`: la tienda tiene `SELECT` sobre
`products` y nada más. No puede corromper el inventario.

## El intercambio POS ↔ tienda

El punto de contacto es **una sola tabla**: `bisonte_orders`. Ahí vive el pedido
web completo, con sus dos ejes de estado en la misma fila:

- `pago_estado` — autorizado → capturado → reembolsado (eje Stripe)
- `estado` — pendiente → confirmado → preparando → enviado → entregado (eje operación)

Son ejes distintos y avanzan por separado, pero al compartir fila una sola
transacción los mueve y no pueden divergir. Antes vivían partidos entre
`sales.web_status` (POS) y `bisonte_orders.status` (tienda), sincronizados por
HTTP: si la llamada fallaba, el POS marcaba cancelado y la tienda seguía en
pending, dejando dinero autorizado en la tarjeta del cliente.

```
tienda                     bisonte_orders                    POS
  │ checkout confirma                                         │
  ├─► INSERT (pago=autorizado, estado=pendiente)              │
  ├─► products.stock_reservado += cantidad                    │
  │                                                           │
  │                              lee cola por estado ◄────────┤
  │                                                           │
  │                                     staff confirma ───────┤
  │                                    (SELECT ... FOR UPDATE)│
  │◄── outbox: capture ───────────────────────────────────────┤
  ├─► Stripe capture                                          │
  ├─► UPDATE pago=capturado, estado=confirmado                │
  │    stock -= cantidad, stock_reservado -= cantidad         │
```

La disponibilidad ya no se calcula sumando la cola de pedidos pendientes en cada
consulta — está materializada en `stock_reservado`, y `stock_disponible` es una
columna generada. El `CHECK (stock_reservado <= stock)` hace que la sobreventa
la rechace la base.

Las llamadas HTTP entre las dos apps pasan por `integration_outbox`: la
intención se escribe en la misma transacción que cambia el estado, y un worker
la reintenta. Un fallo queda visible en vez de perderse en un `catch` vacío.

## Las 16 correcciones

Se aplicaron durante la reconstrucción de jun-ago 2026. Con datos en producción
cada una habría requerido su propia migración; sin datos costaron cero.

| # | Antes | Ahora |
|---|---|---|
| 1 | `sales` cargaba 16 columnas del pedido web, NULL en cada venta de mostrador | `bisonte_orders` |
| 2 | `bisonte_orders` sin foreign keys | FK a `sales` y `clientes` |
| 3 | `payment_intent_id` sin UNIQUE — webhook duplicado creaba dos pedidos | UNIQUE |
| 4 | `items_json` duplicaba `sale_items`; `/api/orders` hacía `JSON.parse` en loop | `sale_items` + `sales.origen` |
| 5 | El mismo producto entraba dos veces al carrito | UNIQUE `(cart_id, product_id)` |
| 6 | `price`, `cost_price` y `sale_price` conviviendo | `price` eliminada |
| 7 | `products.damian` y `products.bernat` | `suppliers` + `product_suppliers` |
| 8 | `cart_items.product_id` sin FK | FK a `products` |
| 9 | `cliente_id >= 900001` marcaba votos de prueba | `event_votes.is_demo` |
| 10 | `clientes` sin índices en las 4 búsquedas reales | 4 índices |
| 11 | Listados paginados en filesort | Índices `(cliente_id, created_at DESC)` |
| 12 | `event_results` sin llave que validara el upsert | `evento` PRIMARY KEY |
| 13 | 6 rutas API creaban tablas en cada request | Todo en `schema.sql` |
| 14 | Lo reservado se recalculaba sumando la cola: 1 subquery por item, O(n²) al cancelar en cascada, sin bloqueo → sobreventa | `stock_reservado` + `stock_disponible` generada + CHECK |
| 15 | Estado partido entre `sales.web_status` y `bisonte_orders.status`, sincronizados por HTTP | Los dos ejes en `bisonte_orders` |
| 16 | `try { await callBisonteCapture(id,'cancel') } catch { }` — cancelaba en el POS aunque Stripe no se enterara | `integration_outbox` con reintento |

Todos piden cambio de código además del esquema. Ver `DEPLOY.md`, fase 0.
