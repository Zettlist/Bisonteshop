// Tipo de cambio MXN→USD calculado en el SERVIDOR.
// Nunca se usa el rate que manda el cliente (manipulable → cobro arbitrario).

const FALLBACK_USD_RATE = parseFloat(process.env.FX_USD_RATE) || 0.049;
const TTL = 12 * 60 * 60 * 1000; // 12h

let cache = { rate: null, ts: 0 };

export async function getUsdRate() {
    const now = Date.now();
    if (cache.rate && now - cache.ts < TTL) return cache.rate;
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/MXN', {
            signal: AbortSignal.timeout(4000),
            cache: 'no-store',
        });
        const data = await res.json();
        const rate = data?.rates?.USD;
        // Sanidad: el peso ronda 0.04–0.07 USD. Fuera de rango = API rara → fallback.
        if (rate && rate > 0.03 && rate < 0.1) {
            cache = { rate, ts: now };
            return rate;
        }
    } catch { /* red caída → fallback */ }
    return FALLBACK_USD_RATE;
}
