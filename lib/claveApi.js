import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// La clave compartida con el POS (CAPTURE_API_KEY).
//
// Es lo unico que separa a cualquiera de internet de capturar cobros, liberar
// autorizaciones y emitir reembolsos, asi que la comparacion importa. Cada
// ruta hacia `apiKey !== process.env.CAPTURE_API_KEY`, y `!==` sobre cadenas
// corta en el primer caracter distinto: el tiempo de respuesta filtra cuantos
// caracteres se acertaron, y con eso una clave se adivina de izquierda a
// derecha en vez de por fuerza bruta.
//
// Comparar los hashes y no las cadenas resuelve dos cosas de una: el tiempo no
// depende del contenido, y como los digest miden lo mismo siempre, la longitud
// de la clave tampoco se filtra.
// ─────────────────────────────────────────────────────────────────────────────

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

/**
 * @param {unknown} recibida  La clave que viene en la peticion.
 * @returns {boolean} true solo si coincide con CAPTURE_API_KEY.
 */
export function claveApiValida(recibida) {
    const esperada = process.env.CAPTURE_API_KEY;
    // Sin clave configurada no se autoriza a nadie. Es explicito a proposito:
    // si esa variable falta en el entorno, lo correcto es que el POS deje de
    // funcionar y se note, no que la puerta quede abierta.
    if (!esperada || typeof recibida !== 'string' || !recibida) return false;
    return crypto.timingSafeEqual(digest(recibida), digest(esperada));
}
