/** @type {import('next').NextConfig} */

// CSP compatible con Stripe Elements (js.stripe.com iframes + api.stripe.com) y
// con GA4. Sin los dominios de Google el script de analitica se bloquea en
// silencio: la etiqueta queda puesta y no llega un solo dato, que es la forma
// mas facil de creer que se mide sin estar midiendo nada.
const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://api.stripe.com https://m.stripe.network https://open.er-api.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
].join('; ');

const SECURITY_HEADERS = [
    { key: 'Content-Security-Policy', value: CSP },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
    output: 'standalone',

    async headers() {
        return [
            // Headers de seguridad en toda la app
            {
                source: '/:path*',
                headers: SECURITY_HEADERS,
            },
            // Cache agresivo para recursos estáticos (imágenes, fuentes, etc.)
            {
                source: '/:all*(webp|png|jpg|jpeg|svg|gif|ico|woff2|woff|ttf)',
                locale: false,
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
        ];
    },

    // Optimización de imágenes: permite las URLs externas que usa la tienda
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
        formats: ['image/webp'],
    },
};

module.exports = nextConfig;

