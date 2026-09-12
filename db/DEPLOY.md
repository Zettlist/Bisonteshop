# Despliegue — Cloud Run + Cloud SQL

Cómo está montado hoy y cómo se sube un cambio.

## El mapa

```
  navegador
     │
     ▼
  Firebase Hosting            proyecto torlan-pro
     │   rewrites ** ─────────────────┐
     ▼                                │
  Cloud Run  bisonte-manga            │  us-central1
     │   socket unix /cloudsql/...    │
     ▼                                │
  Cloud SQL  torlan-mysql        proyecto torlan-web   ← OJO: otro proyecto
     └── base torlan_pos  (compartida con el POS)
```

Dos cosas de este dibujo sorprenden y son a propósito:

**La app y la base viven en proyectos distintos.** `bisonte-manga` está en
`torlan-pro` y la instancia MySQL en `torlan-web`. Funciona porque la anotación
`cloudsql-instances` del servicio nombra la instancia completa
(`torlan-web:us-central1:torlan-mysql`), no solo su nombre. Hubo una segunda
instancia llamada igual en `torlan-pro`; ya no existe, pero el nombre repetido
sigue siendo la trampa clásica de este proyecto — apuntar a la que no es no da
ningún error, solo devuelve un catálogo vacío.

**La base es una sola y la comparte el POS.** No es un descuido: es lo que hace
que el inventario se sincronice sin job ni webhook. El aislamiento se resuelve
con permisos (`grants.sql`), no separando bases. Ver `README.md`.

## Subir un cambio de código

```bash
gcloud run deploy bisonte-manga --source . --project torlan-pro --region us-central1
```

No hay `cloudbuild.yaml`: `--source .` construye con el `Dockerfile` del repo y
deja la imagen en `us-central1-docker.pkg.dev/torlan-pro/cloud-run-source-deploy/`.
El Dockerfile compila Next en modo `standalone` (ver `next.config.js`) y sirve en
el puerto 8080.

`.env.local` está en `.gcloudignore` y no debe salir de ahí: su
`NEXT_PUBLIC_BASE_URL=localhost` pisaría al de producción, y lleva secretos. Las
variables de producción viven en la configuración del servicio de Cloud Run, no
en un archivo del repo.

Rollback: `gcloud run services update-traffic bisonte-manga --to-revisions=<REV>=100`.

## Subir un cambio de esquema

**El esquema NO se migra en el arranque.** La app no crea ni altera tablas —
eso se quitó a propósito (ver el commit «La tienda creaba y alteraba tablas en
cada petición»). Cada cambio con datos ya dentro necesita un ALTER escrito a
mano en `db/migrations/`.

El orden importa: **primero la base, después el código.** Al revés, el código
nuevo busca columnas que todavía no existen y se cae en la primera petición que
las toque.

```bash
# 1. el túnel (dejar la terminal abierta)
cloud-sql-proxy --gcloud-auth --port=3307 torlan-web:us-central1:torlan-mysql

# 2. ver qué haría, sin escribir nada
node db/aplicar-migracion.mjs migrations/<archivo>.sql

# 3. aplicarla
node db/aplicar-migracion.mjs migrations/<archivo>.sql --aplicar

# 4. comprobar que la base quedó como el repo cree
node db/revisar-base.mjs
```

`revisar-base.mjs` compara la base viva contra `schema.sql` y cuadra el saldo de
tienda. Correrlo antes de cada despliegue cuesta diez segundos y contesta la
única pregunta que importa: si la base de allá tiene lo que este código da por
hecho.

## Verificar después de subir

1. Registro de cuenta → llega el correo de verificación (Resend).
2. Carrito: el mismo producto dos veces → un solo renglón, cantidad 2.
3. Compra con tarjeta de prueba de Stripe.
4. Comprar saldo desde Mi Cuenta, y luego un pedido pagado con ese saldo.
5. En el POS: el pedido aparece y el stock baja.

Los puntos 3 a 5 necesitan llaves de Stripe en el servicio. Las de prueba
(`sk_test_`) no cobran nada; las `sk_live_` sí — no confundirlas.

`scripts/prueba-credito.mjs` hace el 4 entero y sin manos, pero contra el
servidor local.

## Lo que falta

**El POS.** `routes/webOrders.js` (en el repo de TorlanPos, no en este) todavía
apunta a columnas que el esquema movió: `sales.web_status`, `items_json`,
`products.price`. Mientras no se migre, el POS no puede capturar ni cancelar
pedidos — y un pedido sin capturar se queda en `autorizado` hasta que la
autorización de Stripe caduca, a los 7 días.

Eso afecta al checkout de mercancía. **No afecta a la compra de saldo**, que no
pasa por el POS en ningún punto.

---

## Qué pasó con el plan de Aiven

Hasta el 7 de septiembre este archivo describía otra cosa: mover la base a
**Aiven**, crear un proyecto GCP nuevo (`bisonte-shop-2026`) y desplegar allí.
Ese plan se descartó — la base se quedó en Cloud SQL y la app en `torlan-pro`.

Se anota porque el documento viejo tenía una «Fase 0 (bloqueante)» que decía que
el código no se podía desplegar contra el esquema nuevo. Eso era cierto cuando
se escribió y dejó de serlo: la parte de la tienda se migró en los commits del 7
de septiembre y lleva desplegada desde entonces. Lo único que sobrevive de
aquella advertencia es lo del POS, arriba.
