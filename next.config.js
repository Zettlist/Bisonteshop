/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',

    // Cache agresivo para recursos estáticos (imágenes, fuentes, etc.)
    async headers() {
        return [
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

