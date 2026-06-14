'use client';

import Link from 'next/link';
import { ShoppingCart, Menu, X, User, LogOut, Settings, Package, ChevronDown } from 'lucide-react';
import styles from './Navbar.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import CurrencySelector from './CurrencySelector';
import LoginModal from './LoginModal';
import { useCartStore } from '@/store/cartStore';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useEffect, useRef, useState } from 'react';

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
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => { setIsMounted(true); }, []);
    const { isAuthenticated, user, setUser, clearUser, _hydrated } = useAuthStore();
    const pathname = usePathname();
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [showAgeGate, setShowAgeGate] = useState(false);
    const [isAdultosMode, setIsAdultosMode] = useState(false);
    const menuRef = useRef(null);

    // Init adultos mode from sessionStorage
    useEffect(() => {
        const stored = typeof window !== 'undefined' && sessionStorage.getItem('adultos_mode') === 'true';
        setIsAdultosMode(stored);
    }, []);

    // Auto-enable mode when navigating to /adultos
    useEffect(() => {
        if (pathname?.startsWith('/adultos')) {
            setIsAdultosMode(true);
            if (typeof window !== 'undefined') sessionStorage.setItem('adultos_mode', 'true');
        }
    }, [pathname]);

    const handleAdultosToggle = () => {
        if (isAdultos) {
            setIsAdultosMode(false);
            if (typeof window !== 'undefined') sessionStorage.removeItem('adultos_mode');
            router.push('/');
            return;
        }
        const accepted = typeof window !== 'undefined' && sessionStorage.getItem('adultos_accepted') === 'true';
        if (accepted) {
            setIsAdultosMode(true);
            if (typeof window !== 'undefined') sessionStorage.setItem('adultos_mode', 'true');
            router.push('/adultos');
        } else {
            setShowAgeGate(true);
        }
    };

    const handleAgeAccept = () => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('adultos_accepted', 'true');
            sessionStorage.setItem('adultos_mode', 'true');
        }
        setIsAdultosMode(true);
        setShowAgeGate(false);
        router.push('/adultos');
    };

    const handleAgeDecline = () => {
        setShowAgeGate(false);
    };

    // Lock body scroll cuando el drawer mobile está abierto
    useEffect(() => {
        if (mobileOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [mobileOpen]);

    useEffect(() => {
        const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleLogout = async () => {
        setMenuOpen(false);
        clearUser();
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch {
            // sin red igual limpiamos el estado local
        }
        // Recarga completa: garantiza que cookie y stores queden sincronizados
        window.location.href = '/';
    };

    // Hydrate auth store from cookie on mount (persists session across reloads)
    useEffect(() => {
        if (!isAuthenticated) {
            fetch('/api/me')
                .then(r => r.json())
                .then(({ user }) => { if (user) setUser(user); })
                .catch(() => {});
        }
    }, []);
    const isAdultos = isAdultosMode || pathname?.startsWith('/adultos');

    return (
        <>
        <nav className={styles.navbar}>
            <div className={styles.logoGroup}>
                <Link href={isAdultos ? '/adultos' : '/'} className={styles.logo} style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
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

                {/* ── Neon Adultos Sign ── */}
                <div className={styles.neonSignGroup}>
                    <button
                        role="switch"
                        aria-checked={isAdultos}
                        className={`${styles.neonSwitch} ${isAdultos ? styles.neonSwitchOn : ''}`}
                        onClick={handleAdultosToggle}
                        aria-label="Modo adultos"
                    >
                        <span className={styles.neonSwitchThumb} />
                    </button>
                    <button
                        onClick={handleAdultosToggle}
                        className={`${styles.neonLabel} ${isAdultos ? styles.neonLabelOn : ''}`}
                    >
                        ADULTOS
                    </button>
                </div>
            </div>

            <ul className={styles.navLinks}>
                <li>
                    <span className={isAdultos ? styles.navLinkDisabledAdultos : styles.navLinkDisabled}>
                        Viajes a Japón
                        <span className={isAdultos ? styles.comingSoonAdultos : styles.comingSoon}>Pronto</span>
                    </span>
                </li>
                <li>
                    <Link href={isAdultos ? '/adultos?open=1' : '/mangas'} className={styles.navLink}>
                        Mangas
                    </Link>
                </li>
                <li>
                    <Link href={isAdultos ? '/adultos?open=1&cat=figuras' : '/figuras'} className={styles.navLink}>
                        Figuras
                    </Link>
                </li>
                <li>
                    <span className={isAdultos ? styles.navLinkPreventaAdultos : styles.navLinkPreventaNeon}>
                        <span className={isAdultos ? styles.preventasTextAdultos : styles.preventasText}>Preventas</span>
                        <span className={isAdultos ? styles.neonMuyProntoAdultos : styles.neonMuyPronto}>Muy Pronto</span>
                    </span>
                </li>
            </ul>

            <div className={styles.actions}>
                <span className={styles.desktopOnly}><CurrencySelector /></span>
                {_hydrated && isAuthenticated && user ? (
                    <div ref={menuRef} className={styles.userMenuWrap}>
                        <button
                            className={styles.userMenuTrigger}
                            onClick={() => setMenuOpen(v => !v)}
                            aria-label="Menú de usuario"
                        >
                            {user.avatar ? (
                                <img src={`${user.avatar}?v=2`} alt="Avatar" className={styles.userAvatar} />
                            ) : (
                                <User size={20} color="var(--primary)" />
                            )}
                            <ChevronDown size={13} className={`${styles.userChevron} ${menuOpen ? styles.userChevronOpen : ''}`} />
                        </button>

                        <AnimatePresence>
                            {menuOpen && (
                                <motion.div
                                    className={styles.userDropdown}
                                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    {/* Header */}
                                    <div className={styles.dropdownHeader}>
                                        <span className={styles.dropdownName}>{user.nombre} {user.apellido || ''}</span>
                                        <span className={styles.dropdownEmail}>{user.email}</span>
                                    </div>
                                    <div className={styles.dropdownDivider} />

                                    {/* Links */}
                                    <Link href="/perfil" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}>
                                        <User size={15} /> Mi cuenta
                                    </Link>
                                    <Link href="/perfil/mis-pedidos" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}>
                                        <Package size={15} /> Mis pedidos
                                    </Link>
                                    <Link href="/perfil/ajustes" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}>
                                        <Settings size={15} /> Configuración
                                    </Link>

                                    <div className={styles.dropdownDivider} />
                                    <button className={`${styles.dropdownItem} ${styles.dropdownLogout}`} onClick={handleLogout}>
                                        <LogOut size={15} /> Cerrar sesión
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ) : _hydrated ? (
                    <button className={styles.iconBtn} aria-label="Iniciar sesión" onClick={() => setIsLoginOpen(true)}>
                        <User size={20} />
                    </button>
                ) : (
                    <button className={styles.iconBtn} aria-label="Iniciar sesión">
                        <User size={20} />
                    </button>
                )}
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
                <button
                    className={styles.mobileMenuBtn}
                    aria-label="Menu"
                    onClick={() => setMobileOpen(v => !v)}
                >
                    <Menu size={24} />
                </button>
            </div>
        </nav>

        <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />

        {/* ── Mobile Drawer ── */}
        <AnimatePresence>
            {mobileOpen && (
                <>
                    {/* Overlay */}
                    <motion.div
                        className={styles.mobileOverlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setMobileOpen(false)}
                    />

                    {/* Drawer panel */}
                    <motion.div
                        className={styles.mobileDrawer}
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'tween', duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* Header del drawer */}
                        <div className={styles.drawerHeader}>
                            <Link href={isAdultos ? '/adultos' : '/'} className={styles.drawerLogo} onClick={() => setMobileOpen(false)}>
                                {isAdultos ? (
                                    <span className={styles.drawerLogoHentai}>Bisonte Hentai</span>
                                ) : (
                                    <span>Bisonte Manga</span>
                                )}
                            </Link>
                            <button
                                className={styles.drawerClose}
                                onClick={() => setMobileOpen(false)}
                                aria-label="Cerrar menú"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        {/* Links de navegación */}
                        <nav className={styles.drawerNav}>
                            <span className={isAdultos ? styles.drawerLinkDisabledAdultos : styles.drawerLinkDisabled}>
                                Viajes a Japón
                                <span className={isAdultos ? styles.comingSoonAdultos : styles.comingSoon}>Pronto</span>
                            </span>
                            <Link href={isAdultos ? '/adultos?open=1' : '/mangas'} className={styles.drawerLink} onClick={() => setMobileOpen(false)}>Mangas</Link>
                            <Link href={isAdultos ? '/adultos?open=1&cat=figuras' : '/figuras'} className={styles.drawerLink} onClick={() => setMobileOpen(false)}>Figuras y accesorios</Link>
                            <span className={isAdultos ? styles.drawerLinkPreventaAdultos : styles.drawerLinkPreventaNeon}>
                                <span className={isAdultos ? styles.preventasTextAdultos : styles.preventasText}>Preventas</span>
                                <span className={isAdultos ? styles.neonMuyProntoAdultos : styles.neonMuyPronto}>Muy Pronto</span>
                            </span>
                            {!isAdultos && <Link href="/adultos" className={styles.drawerLinkAdultos} onClick={() => setMobileOpen(false)}>Adultos</Link>}
                        </nav>

                        {/* Footer del drawer — acciones rápidas */}
                        <div className={styles.drawerFooter}>
                            {/* Moneda */}
                            <div className={styles.drawerTools}>
                                <CurrencySelector />
                            </div>
                            <div className={styles.drawerDivider} />
                            {_hydrated && isAuthenticated && user ? (
                                <>
                                    <div className={styles.drawerUser}>
                                        {user.avatar ? (
                                            <img src={`${user.avatar}?v=2`} alt="Avatar" className={styles.userAvatar} />
                                        ) : (
                                            <User size={18} color="var(--primary)" />
                                        )}
                                        <div>
                                            <div className={styles.drawerUserName}>{user.nombre} {user.apellido || ''}</div>
                                            <div className={styles.drawerUserEmail}>{user.email}</div>
                                        </div>
                                    </div>
                                    <div className={styles.drawerDivider} />
                                    <Link href="/perfil/mis-pedidos" className={styles.drawerLink} onClick={() => setMobileOpen(false)}>
                                        <Package size={15} /> Mis pedidos
                                    </Link>
                                    <Link href="/perfil" className={styles.drawerLink} onClick={() => setMobileOpen(false)}>
                                        <Settings size={15} /> Mi cuenta
                                    </Link>
                                    <button
                                        className={`${styles.drawerLink} ${styles.drawerLogout}`}
                                        onClick={() => { setMobileOpen(false); handleLogout(); }}
                                    >
                                        <LogOut size={15} /> Cerrar sesión
                                    </button>
                                </>
                            ) : _hydrated ? (
                                <button
                                    className={styles.drawerSignIn}
                                    onClick={() => { setMobileOpen(false); setIsLoginOpen(true); }}
                                >
                                    <User size={16} /> Iniciar sesión
                                </button>
                            ) : null}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>

        {/* ── Age Gate Modal ── */}
        <AnimatePresence>
            {showAgeGate && (
                <motion.div
                    className={styles.ageGateOverlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div
                        className={styles.ageGateModal}
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.97 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div className={styles.ageGateBadge}>🔞 Zona Exclusiva +18</div>
                        <h2 className={styles.ageGateTitle}>
                            Bienvenido a<br />
                            <span className={styles.ageGateAccent}>Bisonte Hentai</span>
                        </h2>
                        <p className={styles.ageGateDesc}>
                            Esta sección contiene material gráfico de naturaleza sexual explícita,
                            destinado <strong>exclusivamente a personas mayores de 18 años</strong>.
                        </p>
                        <div className={styles.ageGateWarning}>
                            <p>
                                📌 <strong>Aviso legal:</strong> Todo el contenido presentado en esta sección
                                —incluyendo ilustraciones, cómics, mangas y cualquier otra representación visual—
                                es de carácter <strong>completamente ficticio</strong>. Los personajes, situaciones
                                y escenarios no representan a personas reales.
                            </p>
                            <p>
                                Todos los personajes representados son <strong>mayores de edad</strong> dentro
                                de su universo ficticio, independientemente de su apariencia.
                                Bisonte Manga no promueve, condona ni glorifica ninguna actividad ilegal.
                            </p>
                            <p>
                                Al acceder confirmas que: eres mayor de 18 años, tienes capacidad legal
                                para visualizar este contenido en tu región, y liberas a Bisonte Manga
                                de toda responsabilidad derivada de su visualización.
                            </p>
                        </div>
                        <div className={styles.ageGateActions}>
                            <button className={styles.ageGateDecline} onClick={handleAgeDecline}>
                                No, volver
                            </button>
                            <button className={styles.ageGateAccept} onClick={handleAgeAccept}>
                                Sí, soy mayor de 18
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
        </>
    );
}


