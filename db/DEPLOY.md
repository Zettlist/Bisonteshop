# Plan de despliegue — Aiven MySQL + Cloud Run

Estado de partida: proyectos `pos-torlan` y `bisonte-manga-shop-8202` desactivados
en jun 2026, datos de Cloud SQL perdidos. Esquema nuevo en `db/schema.sql`, 65
pruebas en verde. Nada desplegado.

Objetivo: base fuera de GCP (barata, ciclo de vida propio), app en Cloud Run.

---

## Fase 0 — Migrar el código (bloqueante)

**El esquema nuevo rompe la app actual.** No es opcional ni posterior: si se
despliega el código tal cual contra `schema.sql`, el checkout falla al primer
pedido. Medido sobre el repo:

| Cambio | Tienda | POS |
|---|---|---|
| `items_json` → `sale_items` | 3 archivos | — |
| Las 16 columnas web de `sales` → `bisonte_orders` | 6 archivos | 2 archivos, 81 refs |
| `products.price` → `sale_price` | — | 12 archivos, 30 refs |
| `damian`/`bernat` → `products.supplier_id` | — | 1 archivo |
| Quitar `ensureTable()` | 6 rutas | — |
| `checkFifoStock` → `stock_disponible` | — | `webOrders.js` |
| Llamadas HTTP → `integration_outbox` + worker | 1 ruta | `webOrders.js` |
| `lib/db.js` socket → TCP+TLS | 1 archivo | 1 archivo |

El grueso está en el POS, y casi todo se concentra en `routes/webOrders.js`
(985 líneas). Es el archivo que hay que reescribir: hoy mezcla la cola FIFO, el
descuento de stock, las llamadas a la tienda y la integración con Envia.com.

Los dos últimos renglones son los que cambian comportamiento, no solo nombres:
`checkFifoStock` desaparece (la disponibilidad ya está materializada) y las
llamadas a la tienda pasan por la bandeja de salida.

Orden sugerido: POS primero (es quien más rompe), tienda después, y recién
entonces desplegar. Las 65 pruebas de `db/tests/` sirven de red: corren sin
tocar nada desplegado.

> Si urge relanzar antes de terminar esto, la alternativa es desplegar con el
> esquema viejo y migrar después — pero entonces cada fix vuelve a costar una
> migración con datos, que es justo lo que este trabajo evita.

---

## Fase 1 — Aiven

1. Crear cuenta en aiven.io.
2. Servicio **MySQL 8**, nube **Google Cloud**, región **us-central1** (misma
   que Cloud Run; la latencia por query es lo que se está cuidando).
3. Verificar el plan gratuito vigente antes de comprometerse — los términos
   cambian y esta guía se escribió sin confirmarlos. Si el free tier no cubre
   `us-central1`, comparar contra el plan pago más chico antes de mover región:
   una base lejos de Cloud Run cuesta latencia en cada request.
4. Guardar del panel: host, puerto, usuario admin, contraseña, y descargar el
   **CA cert** (`ca.pem`). Aiven exige TLS.
5. Crear la base `torlan_pos`.

**Todo a Bitwarden en cuanto exista.**

---

## Fase 2 — Cargar esquema

```bash
mysql --host=<host> --port=<puerto> --user=avnadmin --password \
      --ssl-ca=ca.pem torlan_pos < db/schema.sql
```

Luego editar `db/grants.sql` — reemplazar las dos contraseñas
`CAMBIAR_ANTES_DE_EJECUTAR` por valores reales — y cargarlo igual.

Semilla mínima para que la tienda arranque:

```sql
INSERT INTO empresas (nombre_empresa, plan_contratado) VALUES ('Bisonte Manga', 'Premium');
-- Ese id es el EMPRESA_ID de las variables de entorno.
INSERT INTO users (username, password_hash, empresa_id, role)
VALUES ('admin', '<hash bcrypt>', 1, 'empresa_admin');
```

El catálogo de productos hay que recargarlo: no sobrevivió ningún respaldo.

---

## Fase 3 — Proyecto GCP nuevo

Sin Cloud SQL y sin conector VPC — la base es pública con TLS, así que el
conector (~8 USD/mes) ya no hace falta.

```bash
gcloud projects create bisonte-shop-2026 --name="Bisonte Shop"
gcloud config set project bisonte-shop-2026
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
                       secretmanager.googleapis.com
```

Vincular facturación desde la consola. Presupuesto con alerta a 5 USD para que
un descuido no repita la historia.

---

## Fase 4 — Secretos y deploy

Secretos nuevos (los viejos murieron con el proyecto): `JWT_SECRET`,
`DB_PASSWORD`, `CAPTURE_API_KEY`. Las llaves de Stripe y Resend siguen válidas.

```bash
echo -n "<valor>" | gcloud secrets create JWT_SECRET --data-file=-
```

`lib/db.js` en producción pasa de socket Unix a TCP con TLS:

```js
host: process.env.DB_HOST,
port: Number(process.env.DB_PORT),
ssl: { ca: process.env.DB_CA_CERT, rejectUnauthorized: true },
```

Deploy:

```bash
gcloud run deploy bisonte-manga --source . --region us-central1 \
  --allow-unauthenticated --port 8080 \
  --set-secrets=JWT_SECRET=JWT_SECRET:latest,DB_PASSWORD=DB_PASSWORD:latest
```

Firebase Hosting: `firebase.json` ya apunta al servicio `bisonte-manga` en
`us-central1`. Actualizar `.firebaserc` al proyecto nuevo y `firebase deploy
--only hosting`.

---

## Fase 5 — Verificar

1. Registro de cuenta → llega el correo de verificación (Resend).
2. Agregar al carrito dos veces el mismo producto → un solo renglón, cantidad 2.
3. Compra de prueba con tarjeta de test de Stripe.
4. Confirmar en el POS que el pedido aparece y el stock baja.
5. Reenviar el mismo webhook de Stripe → la base lo rechaza, no se duplica.
6. Revisar `gcloud run services logs read bisonte-manga` sin errores de conexión.

---

## Costo esperado

| Concepto | Antes | Después |
|---|---|---|
| Base de datos | Cloud SQL, 10–25 USD/mes, 24/7 | Aiven free tier o plan chico |
| Cloud Run | 0–3 USD/mes | igual (scale-to-zero) |
| Conector VPC | ~8 USD/mes | eliminado |
| Firebase Hosting | 0 | 0 |

El ahorro real está en salir de Cloud SQL y en no necesitar el conector VPC.

---

## Rollback

Cada fase es reversible por separado, que era el punto de sacar la base de GCP:

- Deploy malo → `gcloud run services update-traffic bisonte-manga --to-revisions=<anterior>=100`
- Esquema malo → recargar `db/schema.sql` sobre una base limpia (hay pruebas que lo respaldan)
- Aiven no convence → el mismo `schema.sql` carga en Railway, TiDB o Cloud SQL sin cambios

La app y la base ya no comparten ciclo de vida: se puede redesplegar una sin
tocar la otra.
