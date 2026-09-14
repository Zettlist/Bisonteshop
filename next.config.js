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

    // Optimización de imágenes: SOLO los hosts que la tienda usa de verdad.
    //
    // Aqui decia `hostname: '**'`, que es cualquier dominio de internet. El
    // optimizador de Next es un `fetch` del lado del servidor: con el comodin,
    // /_next/image?url=https://loquesea convierte la tienda en un proxy de
    // imagenes ajenas — ancho de banda y CPU nuestros, cacheados en nuestro
    // CDN, saliendo desde nuestra IP. Las imagenes de productos viven todas en
    // storage.googleapis.com (41 de 41 en la base); el segundo host es el de
    // las fotos de perfil de Google.
    //
    // Si el POS empieza a subir imagenes a otro sitio, hay que añadirlo aqui o
    // se veran rotas. Es el precio de que la lista signifique algo.
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'storage.googleapis.com' },
            { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
        ],
        formats: ['image/webp'],
    },
};

module.exports = nextConfig;

