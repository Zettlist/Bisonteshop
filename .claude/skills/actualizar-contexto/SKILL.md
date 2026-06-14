---
name: actualizar-contexto
description: Guarda el contexto de la sesión en la carpeta Contexto/ del proyecto (últimos cambios, lo último que se hizo y lo último que se deployó) y luego pide compactar la conversación. Úsala cuando el usuario diga "actualiza contexto", "guarda contexto", "anota lo último" o pida cerrar/compactar la sesión documentando el avance.
---

# Actualizar Contexto

Documenta el estado de la sesión en disco para no perder el hilo al compactar o iniciar un chat nuevo.

## Pasos

1. **Verifica el último deploy.** Si hubo un deploy en esta sesión, confirma la revisión real:
   - Cloud Run de la tienda: `gcloud run services describe bisonte-manga --region us-central1 --project bisonte-manga-shop-8202 --format="value(status.latestReadyRevisionName)"`
   - Si hay un deploy corriendo en background, espera a que termine y lee su revisión antes de anotar.

2. **Escribe/actualiza `Contexto/ultimos-cambios.md`** en la raíz del proyecto (`Bisonteshop/`). Crea la carpeta `Contexto/` si no existe. Estructura:
   - **Fecha** de actualización (usa la fecha actual real).
   - **Lo último que hice** — lista concreta de cambios por archivo/feature (rutas exactas).
   - **Lo último que deployé** — servicio, proyecto, región, comando exacto y **revisión confirmada**.
   - **Notas / pendientes** — deuda técnica, cosas a revisar.
   - Sobrescribe el archivo con el estado más reciente (no acumular historial infinito; deja solo lo vigente y los pendientes).

3. **Refleja también en la memoria** del proyecto (`bisonte-estado-trabajo.md`) si el cambio es duradero y no derivable del código.

4. **Pide compactar.** Avisa al usuario que ejecute `/compact` (la compactación es un comando del CLI; el asistente no la dispara solo). Ofrece un resumen de una línea de lo guardado.

## Notas del proyecto
- Deploy de la tienda = Cloud Run `bisonte-manga`, proyecto `bisonte-manga-shop-8202`, `us-central1`, vía `gcloud run deploy --source .` (no usa git; sube el working tree).
- gcloud por defecto apunta a `pos-torlan` (POS) — SIEMPRE pasar `--project bisonte-manga-shop-8202` para la tienda.
