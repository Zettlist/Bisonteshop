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

/**
 * Fecha de nacimiento en formato ISO estricto (YYYY-MM-DD) y con edad minima.
 *
 * El formato se exige con una expresion regular y no con `new Date(...)`,
 * porque los dos lados de esto interpretan las cadenas raras de forma DISTINTA
 * y ahi estaba el agujero: `new Date('20150615')` es Invalid Date en
 * JavaScript, la edad salia NaN, y `NaN < 18` es false — el corte de 18 años lo
 * dejaba pasar. MySQL, en cambio, acepta '20150615' encantado y lo guarda como
 * 2015-06-15. Resultado: una cuenta de 11 años en una tienda +18.
 *
 * La regla es entonces: una sola forma valida, la que mandan los <input
 * type="date">, y comprobada ANTES de calcular nada.
 *
 * @returns {{ok:true, fecha:string}|{ok:false, error:string}}
 */
export function fechaNacimientoValida(v, { edadMinima = 18 } = {}) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return { ok: false, error: 'Fecha de nacimiento inválida.' };
    }
    const [a, m, d] = v.split('-').map(Number);
    const fecha = new Date(Date.UTC(a, m - 1, d));
    // El round-trip descarta los dias que no existen: '2015-02-30' pasa la
    // expresion regular pero Date lo corre al 2 de marzo, y eso ya no coincide.
    if (Number.isNaN(fecha.getTime())
        || fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) {
        return { ok: false, error: 'Fecha de nacimiento inválida.' };
    }

    const hoy = new Date();
    if (fecha.getTime() > hoy.getTime()) {
        return { ok: false, error: 'Fecha de nacimiento inválida.' };
    }
    // Nadie vive 120 años: una fecha asi es un error de captura, no una persona.
    if (a < hoy.getUTCFullYear() - 120) {
        return { ok: false, error: 'Fecha de nacimiento inválida.' };
    }

    const edad = hoy.getUTCFullYear() - a
        - (hoy < new Date(Date.UTC(hoy.getUTCFullYear(), m - 1, d)) ? 1 : 0);
    if (edad < edadMinima) {
        return { ok: false, error: `Debes ser mayor de ${edadMinima} años para registrarte.` };
    }

    return { ok: true, fecha: v };
}
