/**
 * Rate limiter en memoria (por instancia).
 * Suficiente para frenar fuerza bruta básica en login.
 * Para escala multi-instancia, migrar a Redis/Upstash.
 */
const buckets = new Map();

// Limpieza periódica de entradas viejas para no crecer sin límite.
let lastSweep = Date.now();
function sweep(now, windowMs) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, data] of buckets) {
        if (now - data.start > windowMs) buckets.delete(key);
    }
}

/**
 * @param {string} key      Identificador (ej. ip o ip+email)
 * @param {number} limit    Máximo de intentos permitidos en la ventana
 * @param {number} windowMs Tamaño de la ventana en milisegundos
 * @returns {{ allowed: boolean, retryAfter: number }}  retryAfter en segundos
 */
export function rateLimit(key, limit = 5, windowMs = 60_000) {
    const now = Date.now();
    sweep(now, windowMs);

    const data = buckets.get(key);
    if (!data || now - data.start > windowMs) {
        buckets.set(key, { count: 1, start: now });
        return { allowed: true, retryAfter: 0 };
    }

    data.count += 1;
    if (data.count > limit) {
        const retryAfter = Math.ceil((windowMs - (now - data.start)) / 1000);
        return { allowed: false, retryAfter };
    }
    return { allowed: true, retryAfter: 0 };
}

/** Reinicia el contador (ej. tras un login exitoso). */
export function rateLimitReset(key) {
    buckets.delete(key);
}
