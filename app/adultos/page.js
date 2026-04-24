'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import MangaCard from '@/components/MangaCard';
import MangaModal from '@/components/MangaModal';
import FeaturedBanner from '@/components/FeaturedBanner';
import SplitBanners from '@/components/SplitBanners';
import { Search, ShieldAlert, SlidersHorizontal, AlertTriangle, ChevronRight, ArrowLeft, Tag } from 'lucide-react';
import styles from './adultos.module.css';

const ADULT_TAGS = [
    'Furry', 'NTR', 'Milf', 'Shotacon', 'Futanari', 'Bara',
    'Yaoi', 'Vanilla', 'Tentáculos', 'Yuri', 'Parodias', 'Original',
    'Maid', 'Escolar', 'Mind Control', 'Pokemon', 'Fetish',
    'Videojuegos', 'BL', 'Manhwa',
];

const ADULT_CATEGORIES_LANDING = [
    { label: 'Mangas', sub: 'Todo el catálogo adulto', icon: '📖', tag: '' },
    { label: 'BL / Yaoi', sub: 'Amor entre hombres', icon: '💙', tag: 'Yaoi' },
    { label: 'Yuri', sub: 'Amor entre mujeres', icon: '🌸', tag: 'Yuri' },
    { label: 'Vanilla', sub: 'Contenido suave', icon: '✨', tag: 'Vanilla' },
];

const ADULT_SPLIT_BANNERS_BASE = [
    {
        id: 'promo-adult',
        imageSrc: '/banners/promo-left.webp',
        badge: 'OFERTA',
        title: 'ENVÍO GRATIS',
        subtitle: 'En compras mayores a $999',
        cta: 'Comprar ahora',
        colorClass: 'left',
        action: 'catalog',
    },
    {
        id: 'preventa-adult',
        imageSrc: '/banners/promo-right.webp',
        badge: 'PRÓXIMAMENTE',
        title: 'NUEVOS TÍTULOS',
        subtitle: 'Cada semana títulos frescos en el catálogo',
        cta: 'Ver catálogo',
        colorClass: 'right',
        action: 'catalog',
    },
];

const SLOT_VISIBLE = 4;
const SLOT_INTERVAL = 3200;

// ── Slot Machine Grid ─────────────────────────────────────────
function SlotGrid({ products, onCardClick }) {
    const [offset, setOffset] = useState(0);
    const [phase, setPhase] = useState('idle'); // 'idle' | 'exit' | 'enter'
    const hasMore = products.length > SLOT_VISIBLE;

    const advance = useCallback(() => {
        setPhase('exit');
        setTimeout(() => {
            setOffset(prev => (prev + SLOT_VISIBLE) % products.length);
            setPhase('enter');
            setTimeout(() => setPhase('idle'), 500);
        }, 380);
    }, [products.length]);

    useEffect(() => {
        if (!hasMore) return;
        const timer = setInterval(advance, SLOT_INTERVAL);
        return () => clearInterval(timer);
    }, [hasMore, advance]);

    const visible = useMemo(() =>
        Array.from({ length: Math.min(SLOT_VISIBLE, products.length) }, (_, i) =>
            products[(offset + i) % products.length]
        ),
        [products, offset]
    );

    const itemClass = phase === 'exit' ? styles.slotExit
        : phase === 'enter' ? styles.slotEnter
            : styles.slotIdle;

    return (
        <div className={styles.slotGrid}>
            {visible.map((p, i) => (
                <div
                    key={`${p.id}-${offset}-${i}`}
                    className={`${styles.slotItem} ${itemClass}`}
                    style={{ animationDelay: phase === 'enter' ? `${i * 0.07}s` : '0s' }}
                >
                    <MangaCard manga={p} onClick={onCardClick} />
                </div>
            ))}
            {hasMore && (
                <div className={styles.slotIndicator}>
                    {Array.from({ length: Math.ceil(products.length / SLOT_VISIBLE) }, (_, i) => (
                        <span
                            key={i}
                            className={`${styles.slotDot} ${Math.floor(offset / SLOT_VISIBLE) === i ? styles.slotDotActive : ''}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdultosPage() {
    const router = useRouter();
    const catalogRef = useRef(null);

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedTags, setSelectedTags] = useState([]);
    const [selectedStock, setSelectedStock] = useState('all');
    const [selectedEvent, setSelectedEvent] = useState('');
    const [sortBy, setSortBy] = useState('recent');
    const [showCatalog, setShowCatalog] = useState(false);

    const [hasAccepted, setHasAccepted] = useState(false);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        const accepted = sessionStorage.getItem('adultos_accepted');
        if (accepted === 'true') setHasAccepted(true);
        setIsChecking(false);
    }, []);

    const handleAcceptTerms = () => {
        sessionStorage.setItem('adultos_accepted', 'true');
        setHasAccepted(true);
    };
    const handleDeclineTerms = () => router.push('/');

    const handleOpenCatalog = (tag = '', event = '') => {
        if (tag) setSelectedTags([tag]);
        if (event) setSelectedEvent(event);
        setShowCatalog(true);
        setTimeout(() => catalogRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    useEffect(() => {
        async function fetchProducts() {
            try {
                const res = await fetch('/api/adultos');
                const data = await res.json();
                if (data.success) setProducts(data.products);
                else setError(data.error);
            } catch {
                setError('Error de conexión');
            } finally {
                setLoading(false);
            }
        }
        fetchProducts();
    }, []);

    // ── Derived lists ──────────────────────────────────────────
    const recentFallback = useMemo(() =>
        [...products].sort((a, b) => b.id - a.id).slice(0, 8),
        [products]
    );

    const cheapFallback = useMemo(() =>
        [...products].sort((a, b) => a.price - b.price).slice(0, 8),
        [products]
    );

    const novedadesRaw = useMemo(() =>
        products.filter(p => p.events?.novedad?.active === true),
        [products]
    );
    const novedades = novedadesRaw.length >= SLOT_VISIBLE ? novedadesRaw : recentFallback;
    const novedadesFallback = novedadesRaw.length < SLOT_VISIBLE;

    const promocionesRaw = useMemo(() =>
        products.filter(p => p.events?.liquidacion?.active === true),
        [products]
    );
    const promociones = promocionesRaw.length >= SLOT_VISIBLE ? promocionesRaw : cheapFallback;
    const promocionesFallback = promocionesRaw.length < SLOT_VISIBLE;

    const categories = useMemo(() => {
        const map = new Map();
        products.forEach(p => {
            const v = p.category?.trim();
            if (v && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), v);
        });
        return [...map.values()].sort();
    }, [products]);

    const toggleTag = (tag) =>
        setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

    const filtered = useMemo(() => {
        let result = [...products];

        if (selectedEvent === 'novedad') result = result.filter(p => p.events?.novedad?.active === true);
        else if (selectedEvent === 'liquidacion') result = result.filter(p => p.events?.liquidacion?.active === true);

        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            result = result.filter(p =>
                p.title?.toLowerCase().includes(q) ||
                p.artist?.toLowerCase().includes(q) ||
                p.isbn?.toLowerCase().includes(q)
            );
        }
        if (selectedCategory)
            result = result.filter(p => p.category?.trim().toLowerCase() === selectedCategory.toLowerCase());
        if (selectedTags.length > 0)
            result = result.filter(p => {
                const pTags = (p.tags || []).map(t => t.trim().toLowerCase());
                return selectedTags.every(tag => pTags.includes(tag.toLowerCase()));
            });
        if (selectedStock === 'inStock') result = result.filter(p => p.stock > 0);

        result.sort((a, b) => {
            if (sortBy === 'recent') return b.id - a.id;
            if (sortBy === 'price_asc') return a.price - b.price;
            if (sortBy === 'price_desc') return b.price - a.price;
            if (sortBy === 'alpha') return (a.title || '').localeCompare(b.title || '');
            return 0;
        });
        return result;
    }, [products, searchTerm, selectedCategory, selectedTags, sortBy, selectedStock, selectedEvent]);

    return (
        <>
            {/* ── Disclaimer ── */}
            {!hasAccepted && !isChecking && (
                <div className={styles.disclaimerOverlay}>
                    <div className={styles.disclaimerModal}>
                        <div className={styles.disclaimerLogoWrapper}>
                            <Image src="/logo-hentai-sm.webp" alt="Bisonte Hentai" width={120} height={120} className={styles.disclaimerLogo} priority />
                        </div>
                        <div className={styles.welcomeBadge}><span>🔞 Zona Exclusiva +18</span></div>
                        <h1 className={styles.disclaimerTitle}>
                            Bienvenido a<br />
                            <span className={styles.disclaimerAccent}>Bisonte Hentai</span>
                        </h1>
                        <p className={styles.disclaimerSubtitle}>El catálogo más completo de contenido adulto ilustrado.</p>
                        <div className={styles.disclaimerDivider} />
                        <div className={styles.warningBox}>
                            <AlertTriangle size={20} className={styles.disclaimerIcon} />
                            <p>
                                Esta sección contiene material explícito exclusivo para mayores de edad.
                                Al continuar, confirmas que eres <strong>mayor de 18 años</strong> y
                                que tienes la responsabilidad legal de visualizar este contenido en tu región.
                            </p>
                        </div>
                        <div className={styles.disclaimerActions}>
                            <button className={styles.btnDecline} onClick={handleDeclineTerms}>No, volver al inicio</button>
                            <button className={styles.btnAccept} onClick={handleAcceptTerms}>Sí, soy mayor de 18 años</button>
                        </div>
                    </div>
                </div>
            )}

            <div className={`${styles.wrapper} ${styles.pageTransition} ${!hasAccepted && !isChecking ? styles.blurredContent : ''}`}>

                {/* ══════════════════════════════════════════
                    LANDING
                ══════════════════════════════════════════ */}
                {!showCatalog && (
                    <div className={styles.landing}>

                        {/* Hero */}
                        <section className={styles.hero}>
                            <div className={styles.heroBg}>
                                <img src="/mural-adultos.webp" alt="" className={styles.heroBgImg} />
                            </div>
                            <div className={styles.heroOverlay} />
                            <div className={styles.heroContent}>
                                <div className={styles.heroBadge}>
                                    <ShieldAlert size={14} /><span>Contenido Exclusivo +18</span>
                                </div>
                                <div className={styles.heroLogoWrap}>
                                    <Image src="/logo-hentai-sm.webp" alt="Bisonte Hentai" width={110} height={110} className={styles.heroLogo} priority />
                                </div>
                                <h1 className={styles.heroTitle}>
                                    BISONTE<br /><span className={styles.heroAccent}>HENTAI</span>
                                </h1>
                                <p className={styles.heroSub}>El catálogo más completo de manga adulto ilustrado</p>
                                <div className={styles.heroButtons}>
                                    <button className={styles.heroCta} onClick={() => handleOpenCatalog()}>Explorar Catálogo</button>
                                    <button className={styles.heroSecondary} onClick={() => document.getElementById('novedades-adultos')?.scrollIntoView({ behavior: 'smooth' })}>Novedades</button>
                                </div>
                            </div>
                            <div className={styles.heroScroll}><span>↓</span><span>Scroll</span></div>
                        </section>

                        {/* Categorías */}
                        <section className={styles.categoriesSection}>
                            <p className={styles.sectionEyebrow}>EXPLORA</p>
                            <h2 className={styles.sectionTitle}>NUESTRAS CATEGORÍAS</h2>
                            <div className={styles.categoriesGrid}>
                                {ADULT_CATEGORIES_LANDING.map((cat) => (
                                    <button key={cat.label} className={styles.categoryCard} onClick={() => handleOpenCatalog(cat.tag)}>
                                        <div className={styles.categoryCardBg} />
                                        <span className={styles.categoryNum}>{cat.icon}</span>
                                        <div className={styles.categoryCardContent}>
                                            <h3 className={styles.categoryCardLabel}>{cat.label}</h3>
                                            <p className={styles.categoryCardSub}>{cat.sub}</p>
                                            <span className={styles.categoryCardCta}>VER TODO →</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* FeaturedBanner */}
                        <FeaturedBanner
                            title="Nuevos Títulos Adultos"
                            subtitle="Los títulos más esperados ya están en el catálogo"
                            badge="NUEVO"
                            ctaText="Ver catálogo"
                            ctaHref="#"
                            imageSrc="/mural-adultos.webp"
                        />

                        {/* Novedades */}
                        {(loading || novedades.length > 0) && (
                            <section id="novedades-adultos" className={styles.novedadesSection}>
                                <div className={styles.novedadesHeader}>
                                    <div>
                                        <p className={styles.sectionEyebrow}>LO MÁS NUEVO</p>
                                        <h2 className={styles.sectionTitle}>
                                            NOVEDADES
                                            {novedadesFallback && !loading && <span className={styles.fallbackBadge}>Próximamente</span>}
                                        </h2>
                                    </div>
                                    <button className={styles.verTodoLink} onClick={() => handleOpenCatalog('', 'novedad')}>VER TODO →</button>
                                </div>
                                {loading ? (
                                    <div className={styles.logoLoaderContainer}>
                                        <div className={styles.logoWrapper}>
                                            <div className={styles.spinnerRing} />
                                            <Image src="/logo.png" alt="Cargando" width={65} height={65} className={styles.pulsingLogo} priority />
                                        </div>
                                    </div>
                                ) : (
                                    <SlotGrid products={novedades} onCardClick={setSelectedProduct} />
                                )}
                            </section>
                        )}

                        {/* Promociones */}
                        {(loading || promociones.length > 0) && (
                            <section className={styles.promocionesSection}>
                                <div className={styles.novedadesHeader}>
                                    <div>
                                        <p className={`${styles.sectionEyebrow} ${styles.eyebrowPromo}`}>LIQUIDACIÓN</p>
                                        <h2 className={styles.sectionTitle}>
                                            PROMOCIONES
                                            {promocionesFallback && !loading && <span className={styles.fallbackBadge}>Próximamente</span>}
                                        </h2>
                                    </div>
                                    <button className={styles.verTodoLink} onClick={() => handleOpenCatalog('', 'liquidacion')}>VER TODO →</button>
                                </div>
                                {loading ? (
                                    <div className={styles.logoLoaderContainer}>
                                        <div className={styles.logoWrapper}>
                                            <div className={styles.spinnerRing} />
                                            <Image src="/logo.png" alt="Cargando" width={65} height={65} className={styles.pulsingLogo} priority />
                                        </div>
                                    </div>
                                ) : (
                                    <SlotGrid products={promociones} onCardClick={setSelectedProduct} />
                                )}
                            </section>
                        )}

                        {/* Split Banners */}
                        <SplitBanners banners={ADULT_SPLIT_BANNERS_BASE.map(b => ({
                            ...b,
                            onClick: b.action === 'catalog' ? () => handleOpenCatalog() : undefined,
                        }))} />

                        {/* CTA Catálogo */}
                        <section className={styles.ctaSection}>
                            <div className={styles.ctaBox}>
                                <Image src="/logo-hentai-sm.webp" alt="" width={60} height={60} className={styles.ctaLogo} />
                                <h2 className={styles.ctaTitle}>¿Listo para explorar todo?</h2>
                                <p className={styles.ctaSub}>Accede al catálogo completo con filtros por categoría, etiquetas, precio y disponibilidad.</p>
                                <button className={styles.ctaBtn} onClick={() => handleOpenCatalog()}>
                                    VER CATÁLOGO COMPLETO <ChevronRight size={18} />
                                </button>
                            </div>
                        </section>
                    </div>
                )}

                {/* ══════════════════════════════════════════
                    CATÁLOGO
                ══════════════════════════════════════════ */}
                {showCatalog && (
                    <div ref={catalogRef}>
                        {/* Top bar */}
                        <div className={styles.topBar}>
                            <div className={styles.topBarLeft}>
                                <button className={styles.backBtn} onClick={() => { setShowCatalog(false); setSelectedTags([]); setSelectedEvent(''); }}>
                                    <ArrowLeft size={16} /> Inicio
                                </button>
                                <ShieldAlert size={18} className={styles.adultIcon} />
                                <span className={styles.adultLabel}>Contenido para adultos +18</span>
                            </div>
                            <div className={styles.searchBox}>
                                <Search size={16} className={styles.searchIcon} />
                                <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={styles.searchInput} />
                            </div>
                        </div>

                        {/* Mural Banner */}
                        <div className={styles.muralBanner}>
                            <img src="/mural-adultos.webp" alt="Bisonte Hentai" className={styles.muralBannerImg} />
                            <div className={styles.muralBannerOverlay} />
                            <div className={styles.muralBannerContent}>
                                <Image src="/logo-hentai-sm.webp" alt="Bisonte Hentai" width={100} height={100} className={styles.muralBannerLogo} priority />
                                <div className={styles.muralBannerText}>
                                    <h1 className={styles.muralBannerTitle}>Bisonte Hentai</h1>
                                    <p className={styles.muralBannerSub}>Contenido adulto exclusivo +18</p>
                                </div>
                            </div>
                        </div>

                        <div className={styles.layout}>
                            {/* Sidebar */}
                            <aside className={styles.sidebar}>
                                <div className={styles.filterHeader}><SlidersHorizontal size={14} />FILTROS</div>

                                {/* Ordenar */}
                                <div className={styles.filterGroup}>
                                    <p className={styles.filterTitle}>ORDENAR</p>
                                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={styles.select}>
                                        <option value="recent">Novedades Primero</option>
                                        <option value="price_asc">Precio: Menor a Mayor</option>
                                        <option value="price_desc">Precio: Mayor a Menor</option>
                                        <option value="alpha">Alfabético</option>
                                    </select>
                                </div>

                                {/* Eventos */}
                                <div className={styles.filterGroup}>
                                    <p className={styles.filterTitle}>
                                        <Tag size={10} style={{ display: 'inline', marginRight: '4px' }} />
                                        EVENTOS
                                    </p>
                                    <div className={styles.filterList}>
                                        <button className={styles.filterBtn} data-active={selectedEvent === ''} onClick={() => setSelectedEvent('')}>Todos</button>
                                        <button className={styles.filterBtn} data-active={selectedEvent === 'novedad'} onClick={() => setSelectedEvent(selectedEvent === 'novedad' ? '' : 'novedad')}>
                                            🆕 Novedades
                                        </button>
                                        <button className={styles.filterBtn} data-active={selectedEvent === 'liquidacion'} onClick={() => setSelectedEvent(selectedEvent === 'liquidacion' ? '' : 'liquidacion')}>
                                            🏷️ Liquidación
                                        </button>
                                    </div>
                                </div>

                                {/* Disponibilidad */}
                                <div className={styles.filterGroup}>
                                    <p className={styles.filterTitle}>DISPONIBILIDAD</p>
                                    <label className={styles.switchContainer}>
                                        <div className={styles.switch}>
                                            <input type="checkbox" checked={selectedStock === 'inStock'} onChange={e => setSelectedStock(e.target.checked ? 'inStock' : 'all')} className={styles.switchInput} />
                                            <span className={styles.slider} />
                                        </div>
                                        <span className={styles.switchLabel}>Solo disponibles</span>
                                    </label>
                                </div>

                                {/* Categoría */}
                                {categories.length > 0 && (
                                    <div className={styles.filterGroup}>
                                        <p className={styles.filterTitle}>CATEGORÍA</p>
                                        <div className={styles.filterList}>
                                            <button className={styles.filterBtn} data-active={!selectedCategory} onClick={() => setSelectedCategory('')}>Todas</button>
                                            {categories.map(cat => (
                                                <button key={cat} className={styles.filterBtn} data-active={selectedCategory === cat} onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}>{cat}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Tags */}
                                <div className={styles.filterGroup}>
                                    <p className={styles.filterTitle}>
                                        TAGS
                                        {selectedTags.length > 0 && (
                                            <button className={styles.clearTagsBtn} onClick={() => setSelectedTags([])}>limpiar</button>
                                        )}
                                    </p>
                                    <div className={styles.tagChips}>
                                        {ADULT_TAGS.map(tag => (
                                            <button key={tag} className={styles.tagChip} data-active={selectedTags.includes(tag)} onClick={() => toggleTag(tag)}>{tag}</button>
                                        ))}
                                    </div>
                                </div>
                            </aside>

                            {/* Content */}
                            <main className={styles.content}>
                                <p className={styles.count}>
                                    Mostrando <strong>{filtered.length}</strong> de <strong>{products.length}</strong> artículos
                                    {selectedEvent && <span className={styles.eventBadge}>{selectedEvent === 'novedad' ? '🆕 Novedades' : '🏷️ Liquidación'}</span>}
                                </p>
                                {loading ? (
                                    <div className={styles.logoLoaderContainer}>
                                        <div className={styles.logoWrapper}>
                                            <div className={styles.spinnerRing} />
                                            <Image src="/logo.png" alt="Cargando" width={65} height={65} className={styles.pulsingLogo} priority />
                                        </div>
                                        <h3>Sincronizando Inventario...</h3>
                                    </div>
                                ) : error ? (
                                    <div className={styles.state}><p className={styles.errorTitle}>Error de Conexión</p><p>{error}</p></div>
                                ) : filtered.length === 0 ? (
                                    <div className={styles.state}><p>No se encontraron productos con esos filtros.</p></div>
                                ) : (
                                    <div className={styles.grid}>
                                        {filtered.map(p => (
                                            <div key={p.id} className={styles.gridItem}>
                                                <MangaCard manga={p} onClick={setSelectedProduct} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </main>
                        </div>
                    </div>
                )}

                {selectedProduct && <MangaModal manga={selectedProduct} onClose={() => setSelectedProduct(null)} />}
            </div>
        </>
    );
}
