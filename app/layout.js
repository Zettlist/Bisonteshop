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
import { SplashProvider } from '@/context/SplashContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
    title: 'Bisonte Manga',
    description: 'Tu tienda premium de mangas y coleccionables',
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

export default function RootLayout({ children }) {
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
                                <MundialWidget />
                                <Footer />
                                <CompletarPerfil />
                                <CookieBanner />
                                <Analytics />
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
