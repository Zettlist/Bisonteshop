---
name: simular-envio
description: Simula el recorrido de un paquete por la paquetería sobre un pedido de prueba, para ver la línea de tiempo y la pantalla de pedidos evolucionar sin esperar a un envío real. Úsala cuando el usuario diga "simula un envío", "simular envio", "mueve un paquete", "quiero ver el rastreo", "prueba el recorrido del pedido", o pida ver qué pasa con un intento de entrega fallido, una devolución o un paquete extraviado.
---

# Simular un envío

Envía no manda avisos cuando un paquete se mueve: hay que preguntarle. Sin un
paquete circulando de verdad no hay forma de ver la pantalla evolucionar, y en
la base no hay ningún envío real todavía. Esta habilidad inventa el recorrido.

Lo que escribe pasa por el **mismo traductor** que usa el consultor de verdad
(`backend/services/rastreoEnvia.js`), así que lo que se prueba es el camino
real y no una maqueta.

## Dónde está todo

El simulador vive en el repo del POS, que es **hermano** del de la tienda:

    ../TorlanPOS/backend/tools/simulador-envio.mjs

Si la sesión está en `Bisonteshop/`, hay que salir a la carpeta de al lado.
Todos los comandos se corren desde `TorlanPOS/` (no desde `backend/`).

## Pasos

1. **Comprueba el túnel a la base.** El simulador escribe en la base real a
   través del Cloud SQL Auth Proxy, en el puerto 3307:

       netstat -an | grep "3307.*LISTEN"

   Si no hay nada escuchando, **no lo levantes tú**: es un proceso que se queda
   corriendo y ocuparía la terminal. Dale al usuario el comando y espera:

       cloud-sql-proxy --gcloud-auth --port=3307 torlan-web:us-central1:torlan-mysql

2. **Mira qué hay.** Desde `TorlanPOS/`:

       node backend/tools/simulador-envio.mjs lista

   Sale la lista de pedidos de prueba con su estado, su guía y cuántos eventos
   tiene cada uno.

3. **Elige el pedido.** Si el usuario dijo un número, usa ese. Si no, toma uno
   que esté **sin guía** y **no esté cancelado** — la lista enseña las dos
   cosas. Un pedido cancelado no tiene envío que seguir, y verlo avanzar hasta
   "entregada" es justo la clase de escena que confunde en vez de enseñar. De
   los que hay, los que están en `pendiente` son los buenos. Dile cuál elegiste
   y por qué.

4. **Corre el escenario.** Si el usuario no pidió uno concreto, haz el
   completo. Cada comando es un paso; córrelos en orden:

   **Recorrido normal** — termina entregado:

       node backend/tools/simulador-envio.mjs guia <pedido>
       node backend/tools/simulador-envio.mjs avanzar <pedido>    (cinco veces)

   **Entrega fallida** — el pedido salta a "con problema":

       ... guía, luego `avanzar` cuatro veces (hasta "en reparto"),
       node backend/tools/simulador-envio.mjs paso <pedido> 17
       node backend/tools/simulador-envio.mjs paso <pedido> 18

   **Se recupera** — falla y entrega al segundo intento:

       ... igual que el anterior, y después:
       node backend/tools/simulador-envio.mjs paso <pedido> 3

   **Devuelto al remitente**:

       ... tras los intentos fallidos:
       node backend/tools/simulador-envio.mjs paso <pedido> 11

   **Extraviado**:

       node backend/tools/simulador-envio.mjs paso <pedido> 10

5. **Enseña el resultado.**

       node backend/tools/simulador-envio.mjs ver <pedido>

   Reproduce la línea de tiempo en la respuesta y di en una frase qué le pasó
   al pedido: en qué estado de envío quedó y si eso lo saca o lo mete en la
   cola de problemas del mostrador.

6. **Ofrece deshacerlo.** No lo hagas sin que lo pidan — normalmente el usuario
   quiere dejar el pedido así para mirar la pantalla:

       node backend/tools/simulador-envio.mjs limpiar <pedido>

## Los estados que se pueden disparar

Del catálogo de Envía. Los del recorrido normal los pone `avanzar` solo; estos
son los que rompen el camino, que son los interesantes:

| n  | Qué es                        | Dónde deja el pedido |
|----|-------------------------------|----------------------|
| 17, 18, 19 | Intento de entrega fallido | con problema |
| 28 | Intento de entrega            | con problema |
| 21 | Dirección incorrecta          | con problema |
| 22 | No se puede entregar          | con problema |
| 23 | Retrasado                     | con problema |
| 24 | Rechazado por el cliente      | con problema |
| 14 | Dañado                        | con problema |
| 10 | Extraviado                    | con problema |
| 27 | Entregado parcialmente        | con problema |
| 11 | Devuelto al remitente         | devuelta |
| 13 | Entregado en origen           | devuelta |
| 12 | Esperando en sucursal         | en reparto |
| 4  | Cancelado                     | cancelada |

El catálogo entero está en `../TorlanPOS/backend/utils/fasesEnvio.js`.

## Lo que NO hay que hacer

- **No toques un pedido sin `es_prueba`.** El script se niega solo, pero no
  intentes rodearlo marcando un pedido real como prueba para "probar rápido".
  Un "entregado" inventado sobre un pedido real lo cierra, le manda al cliente
  el correo de entrega y apaga la alarma del mostrador.
- **No levantes tú el túnel** en segundo plano para "arreglarlo": si no está,
  el usuario lo abre en su propia ventana.
- **No inventes eventos escribiendo SQL a mano.** Todo pasa por el script, que
  es lo que garantiza que el traductor de verdad se ejercita y que cada fila
  queda marcada con `origen='simulador'`.

## Notas

- Las guías que inventa llevan el prefijo `SIMULADA`. Es a propósito: una guía
  falsa con forma de guía real acaba en alguien llamando a la paquetería por un
  paquete que no existe.
- Las horas se reparten hacia atrás — el primer evento hace dos días y los
  demás escalonados — porque avanzar cinco pasos en diez segundos dejaría cinco
  eventos con la misma hora, y así no se puede juzgar una línea de tiempo.
- El estado del pedido lo decide **el último evento por fecha**, no el peor. Por
  eso un pedido en "con problema" vuelve a "entregada" si el segundo intento
  funciona.
- Esto escribe en la base de **producción**. Hoy los 61 pedidos que existen son
  de prueba porque la tienda no ha abierto. El día que entre uno real, el
  simulador lo dejará en paz solo.
