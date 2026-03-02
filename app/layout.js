import './globals.css';
import { Inter } from 'next/font/google';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { ThemeProvider } from '@/context/ThemeContext';
import { CurrencyProvider } from '@/context/CurrencyContext';
import { CartProvider } from '@/context/CartContext';
import CartSidebar from '@/components/CartSidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
    title: 'Bisonte Manga',
    description: 'Tu tienda premium de mangas y coleccionables',
    icons: {
        icon: '/logo.png',
        apple: '/logo.png',
    },
};

export default function RootLayout({ children }) {
    return (
        <html lang="es">
            <body className={inter.className}>
                <CurrencyProvider>
                    <CartProvider>
                        <ThemeProvider>
                            <Navbar />
                            {children}
                            <CartSidebar />
                            <Footer />
                        </ThemeProvider>
                    </CartProvider>
                </CurrencyProvider>
            </body>
        </html>
    );
}
