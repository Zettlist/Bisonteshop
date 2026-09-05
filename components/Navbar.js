'use client';

import Link from 'next/link';
import { ShoppingCart, Menu, X, User, LogOut, Settings, Package, ChevronDown, Search } from 'lucide-react';
import styles from './Navbar.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import CurrencySelector from './CurrencySelector';
import LoginModal from './LoginModal';
import { useCartStore } from '@/store/cartStore';
import { useSearchStore } from '@/store/searchStore';
import { busqueda } from '@/lib/analytics';
import CartPopover from './CartPopover';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useEffect, useMemo, useRef, useState } from 'react';

// ── Logo tipo "shuffle" ──────────────────────────────────────────────────────
// Cada letra vive en una cajita con overflow hidden y se DESLIZA dentro de ella:
// entra desde la izquierda y sale por la derecha, siempre recortada por el
// borde. No se desvanece ni se encoge — el recorte hace todo el trabajo.
const LETRA_IN = 0.3;      // s que tarda una letra en entrar
const LETRA_OUT = 0.24;    // ...y en salir
const LETRA_STAGGER = 0.02;

// Retardo de cada letra a partir de su indice. Las impares arrancan de una y
// las pares un pelo despues: eso es lo que da el aire barajado en vez de una
// ola pareja. Se calcula aqui dentro, con el indice como unico dato, porque
// `custom` tiene que ser un valor ESTABLE — pasandole un objeto, framer volvia
// a resolver las variantes cada vez que cambiaba la marca (Manga <-> Hentai) y
// reaplicaba el `initial` sin relanzar la entrada: las letras se quedaban
// clavadas fuera de su cajita y el logo se veia vacio.
const ARRANQUE_PARES = 0.16;

const retardoEntrada = (i) => (i % 2 === 1
    ? ((i - 1) / 2) * LETRA_STAGGER
    : ARRANQUE_PARES + (i / 2) * LETRA_STAGGER);

// Al salir se van en orden, de izquierda a derecha, hacia las iniciales.
const retardoSalida = (i) => i * LETRA_STAGGER * 0.6;

const letraVariants = {
    initial: { '--desliz': '-115%' },
    animate: (i) => ({
        '--desliz': '0%',
        transition: { duration: LETRA_IN, ease: [0.16, 1, 0.3, 1], delay: retardoEntrada(i || 0) },
    }),
    exit: (i) => ({
        '--desliz': '115%',
        transition: { duration: LETRA_OUT, ease: [0.7, 0, 0.84, 0], delay: retardoSalida(i || 0) },
    }),
};

// Umbral de scroll para compactar la barra y colapsar el logo a siglas.
const SCROLL_COMPACT = 28;

export default function Navbar() {
    const setIsCartOpen = useCartStore((state) => state.setIsCartOpen);
    const isCartOpen = useCartStore((state) => state.isCartOpen);
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

    // ?login=1 abre el modal de sesion. Es como vuelven las rutas protegidas
    // (middleware) y los enlaces que antes iban a la pagina /login, que ya no
    // existe. Se lee de window y no con useSearchParams para no obligar a toda
    // la app a render dinamico; el parametro se limpia enseguida de la URL.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('login') !== '1') return;
        setIsLoginOpen(true);
        params.delete('login');
        const query = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
    }, [setIsLoginOpen]);

    // ── Buscador ─────────────────────────────────────────────────────────────
    // Colapsado es solo la lupa (la barra es angosta y no cabe un input fijo).
    // Al abrirlo se expande sobre los links. El termino vive en un store global
    // porque quien filtra son los catálogos, no la barra.
    const term = useSearchStore((s) => s.term);
    const setTerm = useSearchStore((s) => s.setTerm);

    // El buscador filtra mientras se escribe, asi que medir cada tecla mandaria
    // "n", "na", "nar", "naru"... y el informe de busquedas seria basura. Se
    // espera a que la escritura se detenga y solo cuenta lo que parece una
    // busqueda de verdad.
    useEffect(() => {
        const limpio = term.trim();
        if (limpio.length < 3) return;
        const id = setTimeout(() => busqueda(limpio), 1200);
        return () => clearTimeout(id);
    }, [term]);
    const [buscarAbierto, setBuscarAbierto] = useState(false);
    const inputBuscar = useRef(null);
    const RUTAS_CATALOGO = ['/mangas', '/figuras', '/adultos'];
    const enCatalogo = RUTAS_CATALOGO.some((r) => pathname?.startsWith(r));

    useEffect(() => {
        if (buscarAbierto) inputBuscar.current?.focus();
    }, [buscarAbierto]);

    // Enter fuera de un catálogo: lleva al catálogo que corresponde, ya filtrado.
    const irABuscar = (e) => {
        e.preventDefault();
        if (!term.trim() || enCatalogo) return;
        router.push(isAdultos ? '/adultos?open=1' : '/mangas');
    };

    // La barra flota (no está pegada al borde) y viaja con el scroll. Al bajar
    // se compacta y el logo se colapsa a las siglas para ocupar menos.
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > SCROLL_COMPACT);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

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
        } else if (pathname === '/') {
            // La home general es la version no adulta: llegar ahi (por logout,
            // por el pie de pagina, por donde sea) apaga el modo. Si no, la
            // barra dice BISONTE HENTAI encima del landing normal.
            setIsAdultosMode(false);
            if (typeof window !== 'undefined') sessionStorage.removeItem('adultos_mode');
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
        // Cerrar sesion manda a la home general, asi que el modo adultos tiene
        // que apagarse: si no, la barra se queda en BISONTE HENTAI (y el switch
        // encendido) sobre el landing normal.
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('adultos_mode');
            sessionStorage.removeItem('adultos_accepted');
        }
        setIsAdultosMode(false);
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

    // Anclas del logo: la primera letra de cada palabra (B y M / B y H). Son las
    // unicas que sobreviven al scroll; el resto se guarda dentro de ellas.
    const marcaTexto = isAdultos ? 'Bisonte Hentai' : 'Bisonte Manga';
    const letras = useMemo(() => {
        const iSegundaPalabra = marcaTexto.indexOf(' ') + 1;
        return marcaTexto.split('').map((ch, i) => ({
            ch, i, ancla: i === 0 || i === iSegundaPalabra,
        }));
    }, [marcaTexto]);

    return (
        <>
        <div className={`${styles.navShell} ${scrolled ? styles.navShellScrolled : ''}`}>
        <nav className={`${styles.navbar} ${scrolled ? styles.navbarScrolled : ''}`}>
            <div className={styles.logoGroup}>
                {/* Logo: completo arriba del todo; al bajar las letras se
                    recogen dentro de las iniciales y queda BM / BH. */}
                <Link href={isAdultos ? '/adultos' : '/'} className={styles.logo} aria-label={marcaTexto}>
                    <span className={`${styles.logoLetras} ${isAdultos ? styles.logoHentai : ''}`} aria-hidden="true">
                        {/* popLayout saca del flujo a la que sale, asi las que
                            quedan se juntan mientras la otra se desliza.
                            Sin initial={false}: cada letra que se monta corre
                            su entrada, tambien la primera vez. */}
                        <AnimatePresence mode="popLayout">
                            {letras.map(({ ch, i, ancla }) => (
                                (!scrolled || ancla) && (
                                    // Cajita que recorta; adentro la letra se desliza.
                                    <motion.span
                                        key={i}
                                        className={styles.logoLetra}
                                        custom={i}
                                        variants={letraVariants}
                                        // Las iniciales (B y M/H) nunca se
                                        // desmontan: arrancan ya colocadas. Si
                                        // tambien entraran deslizando y algo
                                        // interrumpia esa entrada (cambio de
                                        // marca, scroll encima), se quedaban a
                                        // medias fuera de su cajita y el logo
                                        // desaparecia. Con initial={false} eso
                                        // no puede pasar.
                                        initial={ancla ? false : 'initial'}
                                        animate="animate"
                                        exit="exit"
                                    >
                                        <span className={styles.logoLetraInner}>
                                            {ch === ' ' ? ' ' : ch}
                                        </span>
                                    </motion.span>
                                )
                            ))}
                        </AnimatePresence>
                    </span>
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

            {/* Solo secciones activas. Viajes a Japón y Preventas viven como
                avisos en la home (bajo las redes) hasta que se habiliten. */}
            <ul className={styles.navLinks}>
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
            </ul>

            <div className={styles.actions}>
                {/* Buscador: lupa que se expande. Al abrirse tapa los links. */}
                <form
                    onSubmit={irABuscar}
                    className={`${styles.buscador} ${buscarAbierto ? styles.buscadorAbierto : ''}`}
                >
                    <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label={buscarAbierto ? 'Cerrar búsqueda' : 'Buscar'}
                        aria-expanded={buscarAbierto}
                        onClick={() => {
                            if (buscarAbierto && !term) setBuscarAbierto(false);
                            else setBuscarAbierto(true);
                        }}
                    >
                        <Search size={19} />
                    </button>
                    <input
                        ref={inputBuscar}
                        type="search"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        placeholder={enCatalogo ? 'Buscar en el catálogo…' : 'Buscar título, autor, ISBN…'}
                        className={styles.buscadorInput}
                        tabIndex={buscarAbierto ? 0 : -1}
                        aria-hidden={!buscarAbierto}
                        onKeyDown={(e) => {
                            if (e.key !== 'Escape') return;
                            if (term) setTerm('');
                            else setBuscarAbierto(false);
                        }}
                        // Al salir se cierra solo si quedó vacío: si hay término,
                        // sigue filtrando y tiene que verse por qué.
                        onBlur={() => { if (!term) setBuscarAbierto(false); }}
                    />
                    {term && (
                        <button type="button" className={styles.buscadorLimpiar} onClick={() => { setTerm(''); inputBuscar.current?.focus(); }} aria-label="Limpiar búsqueda">
                            <X size={14} />
                        </button>
                    )}
                </form>
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
                                <User size={30} color="var(--primary)" />
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
                {/* El carrito cuelga de su propio boton (popover). Se edita
                    ahi mismo y solo se va a /checkout al pagar. */}
                <div className={styles.carritoAncla}>
                    <button
                        className={styles.iconBtn}
                        aria-label="Carrito"
                        aria-expanded={isCartOpen}
                        onClick={() => setIsCartOpen(!isCartOpen)}
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
                    <CartPopover />
                </div>
                <button
                    className={styles.mobileMenuBtn}
                    aria-label="Menu"
                    onClick={() => setMobileOpen(v => !v)}
                >
                    <Menu size={24} />
                </button>
            </div>
        </nav>
        </div>

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
                            <Link href={isAdultos ? '/adultos?open=1' : '/mangas'} className={styles.drawerLink} onClick={() => setMobileOpen(false)}>Mangas</Link>
                            <Link href={isAdultos ? '/adultos?open=1&cat=figuras' : '/figuras'} className={styles.drawerLink} onClick={() => setMobileOpen(false)}>Figuras y accesorios</Link>
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
                                            <img src={`${user.avatar}?v=2`} alt="Avatar" className={`${styles.userAvatar} ${styles.drawerAvatar}`} />
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


