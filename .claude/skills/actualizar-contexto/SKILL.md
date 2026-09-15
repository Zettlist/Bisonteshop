---
name: actualizar-contexto
description: Guarda el contexto de la sesión en la carpeta Contexto/ del proyecto (últimos cambios, lo último que se hizo y lo último que se deployó) y luego pide compactar la conversación. Úsala cuando el usuario diga "actualiza contexto", "guarda contexto", "anota lo último" o pida cerrar/compactar la sesión documentando el avance.
---

# Actualizar Contexto

Documenta el estado de la sesión en disco para no perder el hilo al compactar o iniciar un chat nuevo.

## Pasos

1. **Verifica el último deploy.** No lo anotes de memoria: pregunta cuál está
   sirviendo de verdad. Según lo que se haya tocado (ver el mapa de abajo):

   - Tienda: `gcloud run services describe bisonte-manga --region us-central1 --project torlan-pro --format="value(status.latestReadyRevisionName)"`
   - Backend del POS: `gcloud run services describe torlan-api --region us-central1 --project torlan-web --format="value(status.latestReadyRevisionName)"`
   - Frontend del POS: `curl -s https://torlan.pro | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'`

   Si hay un deploy corriendo en segundo plano, espera a que termine y lee su
   revisión antes de anotar.

2. **Escribe/actualiza `Contexto/ultimos-cambios.md`** en la raíz del proyecto
   (`Bisonteshop/`). Crea la carpeta `Contexto/` si no existe. Estructura:
   - **Fecha** de actualización (usa la fecha actual real).
   - **Lo último que hice** — lista concreta de cambios por archivo/feature (rutas exactas).
   - **Lo último que deployé** — servicio, proyecto, región, comando exacto y **revisión confirmada**.
   - **Notas / pendientes** — deuda técnica, cosas a revisar.
   - Sobrescribe el archivo con el estado más reciente (no acumular historial
     infinito; deja solo lo vigente y los pendientes).

3. **Refleja también en la memoria** lo que sea duradero y no se pueda deducir
   del código ni del historial de git — una decisión y su porqué, una
   restricción del negocio, algo que se probó y no funcionó. Un fichero por
   hecho, con su línea en `MEMORY.md`. Lo que ya cuenta el repo no va aquí.

4. **Pide compactar.** Avisa al usuario que ejecute `/compact` (la compactación
   es un comando del CLI; el asistente no la dispara solo). Ofrece un resumen de
   una línea de lo guardado.

## El mapa de despliegues

Son dos proyectos de Google Cloud y cuatro sitios distintos. Equivocarse de
proyecto es silencioso: el comando funciona y toca otra cosa.

| Qué | Dónde | Proyecto |
|---|---|---|
| Tienda (Next.js) | Cloud Run `bisonte-manga`, us-central1 | `torlan-pro` |
| Backend del POS | Cloud Run `torlan-api`, us-central1 | `torlan-web` |
| Frontend del POS | Firebase Hosting, sitio `torlan-web` | `torlan-web` |
| POS en App Engine | `torlan-pro.uc.r.appspot.com` | `torlan-pro` |
| Base de datos | Cloud SQL `torlan-mysql`, base `torlan_pos` | **`torlan-web`** |

- `gcloud` apunta por defecto a **`torlan-pro`**, así que para cualquier cosa
  del POS o de la base hay que pasar `--project torlan-web` a mano.
- La base vive en `torlan-web` aunque la tienda esté en `torlan-pro`. No existe
  ninguna instancia `torlan-pro:us-central1:torlan-mysql`: si un comando la
  nombra, está mal.
- **El POS que usa el mostrador es el de Cloud Run**, no el de App Engine. Los
  tres dominios (`torlan.pro`, `torlanpos.com`, `torlan-web.web.app`) llaman a
  `torlan-api`. App Engine sigue desplegado y respondiendo, pero no lo usa
  nadie: comprobar ahí que "el POS está bien" no prueba nada.
- La tienda se despliega con `gcloud run deploy --source .` desde
  `Bisonteshop/` (no usa git: sube el working tree tal cual está).
- El backend del POS también, desde `TorlanPOS/backend/`. Pero ahí hay que
  intercambiar `.gcloudignore` por `.gcloudignore.run` primero y devolverlo
  después: el de App Engine no puede excluir `app.yaml` porque lo necesita, y
  ese archivo lleva dentro todo el entorno de producción.
- El frontend del POS: `npm run build` en `TorlanPOS/frontend/`, luego
  `firebase deploy --only hosting --project torlan-web` desde `TorlanPOS/`.
  Backend y frontend van juntos o se descuadran.

## Notas

- Las credenciales de la base están en `db/.credenciales-TODAS.txt`
  (ignorado por git). Cuatro cuentas con permisos distintos a propósito:
  `bisonte_app` para la tienda, `pos_app` para el POS, `torlan_user` para
  migraciones, `root` solo para repartir permisos.
- Los scripts de `db/` necesitan el túnel levantado:
  `cloud-sql-proxy --gcloud-auth --port=3307 torlan-web:us-central1:torlan-mysql`
