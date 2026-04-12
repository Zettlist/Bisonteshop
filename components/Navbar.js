'use client';

import Link from 'next/link';
import { ShoppingCart, Menu, User } from 'lucide-react';
import styles from './Navbar.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeToggle from './ThemeToggle';
import CurrencySelector from './CurrencySelector';
import LoginModal from './LoginModal';
import { useCartStore } from '@/store/cartStore';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useEffect } from 'react';

const brandVariants = {
    initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
    exit: { opacity: 0, y: -12, filter: 'blur(4px)', transition: { duration: 0.25, ease: 'easeIn' } },
};

export default function Navbar() {
    const setIsCartOpen = useCartStore((state) => state.setIsCartOpen);
    const cartItems = useCartStore((state) => state.items);
    const totalItemsCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
    const isLoginOpen = useCartStore((state) => state.isLoginOpen);
    const setIsLoginOpen = useCartStore((state) => state.setIsLoginOpen);
    const [isMounted, setIsMounted] = require('react').useState(false);
    require('react').useEffect(() => { setIsMounted(true); }, []);
    const { isAuthenticated, user, setUser, _hydrated } = useAuthStore();
    const pathname = usePathname();

    // Hydrate auth store from cookie on mount (persists session across reloads)
    useEffect(() => {
        if (!isAuthenticated) {
            fetch('/api/me')
                .then(r => r.json())
                .then(({ user }) => { if (user) setUser(user); })
                .catch(() => {});
        }
    }, []);
    const isAdultos = pathname?.startsWith('/adultos');

    return (
        <>
        <nav className={styles.navbar}>
            <Link href="/" className={styles.logo} style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
                <AnimatePresence mode="wait" initial={false}>
                    {isAdultos ? (
                        <motion.span
                            key="hentai"
                            className={styles.logoHentai}
                            variants={brandVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                        >
                            Bisonte Hentai
                        </motion.span>
                    ) : (
                        <motion.span
                            key="manga"
                            variants={brandVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                        >
                            Bisonte Manga
                        </motion.span>
                    )}
                </AnimatePresence>
            </Link>

            <ul className={styles.navLinks}>
                <li>
                    <span className={styles.navLinkDisabled}>
                        Viajes a Japón
                        <span className={styles.comingSoon}>Muy pronto</span>
                    </span>
                </li>
                <li><Link href="/mangas" className={styles.navLink}>Mangas</Link></li>
                <li><Link href="/figuras" className={styles.navLink}>Figuras y accesorios</Link></li>
                <li><Link href="/preventas" className={styles.navLinkPreventa}>🔥 Preventas</Link></li>
                <li><Link href="/adultos" className={styles.navLinkAdultos}>🔞 Adultos</Link></li>
                <li><Link href="/nosotros" className={styles.navLink}>Nosotros</Link></li>
            </ul>

            <div className={styles.actions}>
                <CurrencySelector />
                {_hydrated && isAuthenticated && user ? (
                    <Link href="/perfil" className={styles.iconBtn} aria-label="Mi Perfil" title={`Hola, ${user.nombre}`}>
                        {user.avatar ? (
                            <img
                                src={user.avatar}
                                alt="Avatar"
                                style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }}
                            />
                        ) : (
                            <User size={20} color="var(--primary)" />
                        )}
                    </Link>
                ) : _hydrated ? (
                    <button className={styles.iconBtn} aria-label="Iniciar sesión" onClick={() => setIsLoginOpen(true)}>
                        <User size={20} />
                    </button>
                ) : (
                    <button className={styles.iconBtn} aria-label="Iniciar sesión">
                        <User size={20} />
                    </button>
                )}
                <ThemeToggle />
                <button
                    className={styles.iconBtn}
                    aria-label="Cart"
                    onClick={() => setIsCartOpen(true)}
                >
                    <div className={styles.cartIconWrapper}>
                        <ShoppingCart size={20} />
                        <AnimatePresence>
                            {isMounted && totalItemsCount > 0 && (
                                <motion.span
                                    className={styles.cartBadge}
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0 }}
                                >
                                    {totalItemsCount}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </div>
                </button>
                <button className={styles.mobileMenuBtn} aria-label="Menu">
                    <Menu size={24} />
                </button>
            </div>
        </nav>

        <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
        </>
    );
}


