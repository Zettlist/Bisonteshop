/** @type {import('next').NextConfig} */

// La CSP ya NO vive aqui: la arma middleware.js, porque cada respuesta lleva su
// propio nonce y esto se sirve igual para todas. Los headers de abajo si son
// fijos y se quedan.
const SECURITY_HEADERS = [
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

