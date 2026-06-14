'use client';

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import MangaCard from '@/components/MangaCard';
import MangaModal from '@/components/MangaModal';
import LandingZineAdultos from '@/components/LandingZineAdultos';
import { Search, ShieldAlert, SlidersHorizontal, AlertTriangle, ArrowLeft, Tag, X } from 'lucide-react';
import styles from './adultos.module.css';

const ADULT_TAGS = [
    'Furry', 'NTR', 'Milf', 'Shotacon', 'Futanari', 'Bara',
    'Yaoi', 'Vanilla', 'Tentáculos', 'Yuri', 'Parodias', 'Original',
    'Maid', 'Escolar', 'Mind Control', 'Pokemon', 'Fetish',
    'Videojuegos', 'BL', 'Manhwa',
];

// ── Main Page ─────────────────────────────────────────────────
export default function AdultosPage() {
    return (
        <Suspense fallback={null}>
            <AdultosPageInner />
        </Suspense>
    );
}

function AdultosPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
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

    // Mobile filter sheet
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [filtersClosing, setFiltersClosing] = useState(false);
    const [mounted, setMounted] = useState(false);
    const closeTimerRef = useRef(null);

    useEffect(() => { setMounted(true); }, []);

    const closeFilters = () => {
        if (filtersClosing) return;
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        setFiltersClosing(true);
        closeTimerRef.current = setTimeout(() => {
            setFiltersOpen(false);
            setFiltersClosing(false);
            closeTimerRef.current = null;
        }, 290);
    };

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

    const handleOpenCatalog = useCallback((tag = '', event = '', cat = '') => {
        if (tag) setSelectedTags([tag]);
        if (event) setSelectedEvent(event);
        if (cat) setSelectedCategory(cat);
        setShowCatalog(true);
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    }, []);

    // Auto-open catalog when navigated with ?open=1 (from navbar adultos links).
    // Refleja la URL siempre: limpia filtros previos al cambiar de enlace
    // (p.ej. Figuras -> Mangas) para no quedar "lock" en una categoría vieja.
    useEffect(() => {
        if (searchParams?.get('open') === '1') {
            const cat = searchParams.get('cat') || '';
            setSelectedCategory(cat);
            setSelectedTags([]);
            setSelectedEvent('');
            setShowCatalog(true);
            setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
        }
    }, [searchParams]);

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

            <div className={`${styles.wrapper} ${styles.pageTransition} ${!hasAccepted && !isChecking ? styles.blurredContent : ''} ${showCatalog ? styles.wrapperCatalog : ''}`}>

                {/* ══════════════════════════════════════════
                    LANDING
                ══════════════════════════════════════════ */}
                {!showCatalog && (
                    <LandingZineAdultos
                        products={products}
                        loading={loading}
                        onExplore={() => handleOpenCatalog()}
                        onCategory={(tag) => handleOpenCatalog(tag)}
                        onSelectProduct={setSelectedProduct}
                    />
                )}

                {/* ══════════════════════════════════════════
                    CATÁLOGO
                ══════════════════════════════════════════ */}
                {showCatalog && (
                    <div ref={catalogRef} className={styles.catalogWrapper}>
                        {/* topBar rendered via portal — avoids framer-motion filter:blur(0px) containing block */}

                        <div className={styles.layout}>
                            {/* Sidebar */}
                            <aside className={styles.sidebar}>
                                <div className={styles.filterHeader}><SlidersHorizontal size={14} />FILTROS</div>

                                {/* Ordenar */}
                                <div className={styles.filterSection}>
                                    <span className={styles.filterSectionLabel}>Ordenar por</span>
                                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={styles.select}>
                                        <option value="recent">Novedades Primero</option>
                                        <option value="price_asc">Precio: Menor a Mayor</option>
                                        <option value="price_desc">Precio: Mayor a Menor</option>
                                        <option value="alpha">Alfabético</option>
                                    </select>
                                </div>

                                {/* Disponibilidad */}
                                <div className={styles.filterSection}>
                                    <span className={styles.filterSectionLabel}>Disponibilidad</span>
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
                                    <div className={styles.filterSection}>
                                        <span className={styles.filterSectionLabel}>Categoría</span>
                                        <div className={styles.filterList}>
                                            <button className={styles.filterBtn} data-active={!selectedCategory} onClick={() => setSelectedCategory('')}>Todas</button>
                                            {categories.map(cat => (
                                                <button key={cat} className={styles.filterBtn} data-active={selectedCategory === cat} onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}>{cat}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Eventos */}
                                <div className={styles.filterSection}>
                                    <span className={styles.filterSectionLabel}>Eventos</span>
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

                                {/* Tags */}
                                <div className={styles.filterSection}>
                                    <span className={styles.filterSectionLabel}>
                                        Tags
                                        {selectedTags.length > 0 && (
                                            <button className={styles.clearTagsBtn} onClick={() => setSelectedTags([])}>limpiar</button>
                                        )}
                                    </span>
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

            {/* ── TopBar portal — escapes framer-motion filter:blur(0px) containing block ── */}
            {mounted && showCatalog && createPortal(
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
                    <button className={styles.filterToggleBtn} onClick={() => setFiltersOpen(true)}>
                        <SlidersHorizontal size={15} />
                        Filtros
                        {(selectedCategory || selectedTags.length > 0 || selectedEvent || selectedStock !== 'all') && (
                            <span className={styles.filterBadge} />
                        )}
                    </button>
                </div>,
                document.body
            )}

            {/* ── Mobile Filter Sheet (portal) ── */}
            {mounted && (filtersOpen || filtersClosing) && createPortal(
                <>
                    <div
                        className={`${styles.filterOverlay} ${filtersClosing ? styles.filterOverlayOut : ''}`}
                        onClick={closeFilters}
                    />
                    <div className={`${styles.mobileSheet} ${filtersClosing ? styles.mobileSheetOut : ''}`}>
                        <div className={styles.sidebarMobileHeader}>
                            <span className={styles.filterHeader}><SlidersHorizontal size={14} />FILTROS</span>
                            <button className={styles.sidebarCloseBtn} onClick={closeFilters}><X size={20} /></button>
                        </div>

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
                            <p className={styles.filterTitle}>EVENTOS</p>
                            <div className={styles.filterList}>
                                <button className={styles.filterBtn} data-active={selectedEvent === ''} onClick={() => setSelectedEvent('')}>Todos</button>
                                <button className={styles.filterBtn} data-active={selectedEvent === 'novedad'} onClick={() => setSelectedEvent(selectedEvent === 'novedad' ? '' : 'novedad')}>Novedades</button>
                                <button className={styles.filterBtn} data-active={selectedEvent === 'liquidacion'} onClick={() => setSelectedEvent(selectedEvent === 'liquidacion' ? '' : 'liquidacion')}>Liquidación</button>
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
                    </div>
                </>,
                document.body
            )}
        </>
    );
}
