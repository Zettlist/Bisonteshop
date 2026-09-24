import { headers } from 'next/headers';
import './globals.css';
import { Inter } from 'next/font/google';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { ThemeProvider } from '@/context/ThemeContext';
import { CurrencyProvider } from '@/context/CurrencyContext';
import { CartProvider } from '@/context/CartContext';
import MundialWidget from '@/components/eventos/mundial2026/MundialWidget';
import SplashScreen from '@/components/SplashScreen';
import CompletarPerfil from '@/components/CompletarPerfil';
import CookieBanner from '@/components/CookieBanner';
import Analytics from '@/components/Analytics';
import FichasEnPopup from '@/components/producto/FichasEnPopup';
import { SplashProvider } from '@/context/SplashContext';

const inter = Inter({ subsets: ['latin'] });

// La base de todas las paginas. Antes cada pagina se llamaba "Bisonte Manga"
// a secas: en Google y en las pestañas del navegador eran indistinguibles, y al
// compartir un enlace en WhatsApp no salia imagen. Cada pagina pone ahora su
// propio titulo y la plantilla le agrega la marca.
export const metadata = {
    metadataBase: new URL('https://bisontemanga.com'),
    title: {
        default: 'Bisonte Manga — manga japonés, revistas y figuras originales',
        template: '%s | Bisonte Manga',
    },
    description: 'Tienda en línea de manga japonés, revistas y figuras originales, directo de Japón. Envíos a todo México.',
    openGraph: {
        siteName: 'Bisonte Manga',
        locale: 'es_MX',
        type: 'website',
    },
    twitter: { card: 'summary_large_image' },
    icons: {
        icon: '/logo.png',
        apple: '/logo.png',
    },
};

// Bloquea zoom en móvil (pellizco / doble-tap)
export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export default async function RootLayout({ children }) {
    // El nonce de esta respuesta, que puso middleware.js. Los scripts inline
    // solo se ejecutan si lo llevan: sin esto, la CSP nueva silenciaria GA4 sin
    // decir nada. Next se lo pone solo a los SUYOS; el de analitica es nuestro
    // y hay que darselo a mano.
    const nonce = (await headers()).get('x-nonce') || undefined;

    return (
        <html lang="es">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&family=Bebas+Neue&family=Permanent+Marker&family=Caveat:wght@600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500&display=swap" />
            </head>
            <body className={inter.className}>
                <CurrencyProvider>
                    <CartProvider>
                        <ThemeProvider>
                            <SplashProvider>
                                <Navbar />
                                {children}
                                {/* Fuera de template.js: el popup no debe entrar
                                    ni salir con la transicion de pagina. */}
                                <FichasEnPopup />
                                <MundialWidget />
                                <Footer />
                                <CompletarPerfil />
                                <CookieBanner />
                                <Analytics nonce={nonce} />
                                {/* Ultimo y fuera de template.js: tapa TODO —
                                    barra incluida — desde el primer pintado. */}
                                <SplashScreen />
                            </SplashProvider>
                        </ThemeProvider>
                    </CartProvider>
                </CurrencyProvider>
            </body>
        </html>
    );
}
