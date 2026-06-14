/**
 * Validadores ligeros de input para las rutas API.
 * No dependen de librerías externas. Lanzan strings de error legibles.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(v) {
    return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
}

/** Contraseña: 8-128 chars, al menos una letra y un número. */
export function isStrongPassword(v) {
    return typeof v === 'string'
        && v.length >= 8 && v.length <= 128
        && /[A-Za-z]/.test(v) && /[0-9]/.test(v);
}

/** Texto requerido con límite de largo. */
export function isValidText(v, { min = 1, max = 255 } = {}) {
    return typeof v === 'string' && v.trim().length >= min && v.length <= max;
}

/** Texto opcional: vacío/null OK, pero si viene debe respetar el largo. */
export function isValidOptionalText(v, { max = 255 } = {}) {
    if (v === undefined || v === null || v === '') return true;
    return typeof v === 'string' && v.length <= max;
}

/**
 * Corre un conjunto de reglas. `rules` = [[bool, 'mensaje'], ...].
 * Devuelve el primer mensaje fallido o null si todo pasa.
 */
export function firstError(rules) {
    for (const [ok, msg] of rules) {
        if (!ok) return msg;
    }
    return null;
}
