'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import MangaCard from '@/components/MangaCard';
import MangaModal from '@/components/MangaModal';
import { Search, ShieldAlert, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import styles from './adultos.module.css';

const ADULT_TAGS = [
    'Furry', 'NTR', 'Milf', 'Shotacon', 'Futanari', 'Bara',
    'Yaoi', 'Vanilla', 'Tentáculos', 'Yuri', 'Parodias', 'Original',
    'Maid', 'Escolar', 'Mind Control', 'Pokemon', 'Fetish',
    'Videojuegos', 'BL', 'Manhwa',
];

export default function AdultosPage() {
    const router = useRouter();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedTags, setSelectedTags] = useState([]);
    const [selectedStock, setSelectedStock] = useState('all');
    const [sortBy, setSortBy] = useState('recent');

    // Disclaimer state
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

    const handleDeclineTerms = () => {
        router.push('/');
    };

    useEffect(() => {
        async function fetchProducts() {
            try {
                const res = await fetch('/api/adultos');
                const data = await res.json();
                if (data.success) setProducts(data.products);
                else setError(data.error);
            } catch (e) {
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

    const toggleTag = (tag) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const filtered = useMemo(() => {
        let result = [...products];

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

        if (selectedTags.length > 0) {
            result = result.filter(p => {
                const pTags = (p.tags || []).map(t => t.trim().toLowerCase());
                return selectedTags.every(tag => pTags.includes(tag.toLowerCase()));
            });
        }

        if (selectedStock === 'inStock') {
            result = result.filter(p => p.stock > 0);
        }

        result.sort((a, b) => {
            if (sortBy === 'recent') return b.id - a.id;
            if (sortBy === 'price_asc') return a.price - b.price;
            if (sortBy === 'price_desc') return b.price - a.price;
            if (sortBy === 'alpha') return (a.title || '').localeCompare(b.title || '');
            return 0;
        });
        return result;
    }, [products, searchTerm, selectedCategory, selectedTags, sortBy]);

    return (
        <>
            {!hasAccepted && !isChecking && (
                <div className={styles.disclaimerOverlay}>
                    <div className={styles.disclaimerModal}>

                        {/* Brand Logo */}
                        <div className={styles.disclaimerLogoWrapper}>
                            <Image
                                src="/logo-hentai.webp"
                                alt="Bisonte Hentai"
                                width={120}
                                height={120}
                                className={styles.disclaimerLogo}
                                priority
                            />
                        </div>

                        {/* Welcome */}
                        <div className={styles.welcomeBadge}>
                            <span>🔞 Zona Exclusiva +18</span>
                        </div>
                        <h1 className={styles.disclaimerTitle}>
                            Bienvenido a<br />
                            <span className={styles.disclaimerAccent}>Bisonte Hentai</span>
                        </h1>
                        <p className={styles.disclaimerSubtitle}>
                            El catálogo más completo de contenido adulto ilustrado.
                        </p>

                        {/* Divider */}
                        <div className={styles.disclaimerDivider} />

                        {/* Legal Warning */}
                        <div className={styles.warningBox}>
                            <AlertTriangle size={20} className={styles.disclaimerIcon} />
                            <p>
                                Esta sección contiene material explícito exclusivo para mayores de edad.
                                Al continuar, confirmas que eres <strong>mayor de 18 años</strong> y
                                que tienes la responsabilidad legal de visualizar este contenido en tu región.
                            </p>
                        </div>

                        <div className={styles.disclaimerActions}>
                            <button className={styles.btnDecline} onClick={handleDeclineTerms}>
                                No, volver al inicio
                            </button>
                            <button className={styles.btnAccept} onClick={handleAcceptTerms}>
                                Sí, soy mayor de 18 años
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={`${styles.wrapper} ${styles.pageTransition} ${!hasAccepted && !isChecking ? styles.blurredContent : ''}`}>
                {/* Top bar sticky */}
                <div className={styles.topBar}>
                    <div className={styles.topBarLeft}>
                        <ShieldAlert size={18} className={styles.adultIcon} />
                        <span className={styles.adultLabel}>Contenido para adultos +18</span>
                    </div>
                    <div className={styles.searchBox}>
                        <Search size={16} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className={styles.searchInput}
                        />
                    </div>
                </div>

                {/* ── Mural Banner ── */}
                <div className={styles.muralBanner}>
                    <img
                        src="/mural-adultos.webp"
                        alt="Bisonte Hentai Mural"
                        className={styles.muralBannerImg}
                    />
                    <div className={styles.muralBannerOverlay} />
                    <div className={styles.muralBannerContent}>
                        <Image
                            src="/logo-hentai.webp"
                            alt="Bisonte Hentai"
                            width={100}
                            height={100}
                            className={styles.muralBannerLogo}
                            priority
                        />
                        <div className={styles.muralBannerText}>
                            <h1 className={styles.muralBannerTitle}>Bisonte Hentai</h1>
                            <p className={styles.muralBannerSub}>Contenido adulto exclusivo +18</p>
                        </div>
                    </div>
                </div>

                <div className={styles.layout}>
                    {/* Sidebar */}
                    <aside className={styles.sidebar}>
                        <div className={styles.filterHeader}>
                            <SlidersHorizontal size={14} />
                            FILTROS
                        </div>

                        {/* Ordenar */}
                        <div className={styles.filterGroup}>
                            <p className={styles.filterTitle}>ORDENAR</p>
                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value)}
                                className={styles.select}
                            >
                                <option value="recent">Novedades Primero</option>
                                <option value="price_asc">Precio: Menor a Mayor</option>
                                <option value="price_desc">Precio: Mayor a Menor</option>
                                <option value="alpha">Alfabético</option>
                            </select>
                        </div>

                        {/* Disponibilidad */}
                        <div className={styles.filterGroup}>
                            <p className={styles.filterTitle}>DISPONIBILIDAD</p>
                            <label className={styles.switchContainer}>
                                <div className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={selectedStock === 'inStock'}
                                        onChange={(e) => setSelectedStock(e.target.checked ? 'inStock' : 'all')}
                                        className={styles.switchInput}
                                    />
                                    <span className={styles.slider}></span>
                                </div>
                                <span className={styles.switchLabel}>Solo disponibles</span>
                            </label>
                        </div>

                        {/* Categoría */}
                        {categories.length > 0 && (
                            <div className={styles.filterGroup}>
                                <p className={styles.filterTitle}>CATEGORÍA</p>
                                <div className={styles.filterList}>
                                    <button
                                        className={styles.filterBtn}
                                        data-active={!selectedCategory}
                                        onClick={() => setSelectedCategory('')}
                                    >
                                        Todas
                                    </button>
                                    {categories.map(cat => (
                                        <button
                                            key={cat}
                                            className={styles.filterBtn}
                                            data-active={selectedCategory === cat}
                                            onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tags */}
                        <div className={styles.filterGroup}>
                            <p className={styles.filterTitle}>
                                TAGS
                                {selectedTags.length > 0 && (
                                    <button className={styles.clearTagsBtn} onClick={() => setSelectedTags([])}>
                                        limpiar
                                    </button>
                                )}
                            </p>
                            <div className={styles.tagChips}>
                                {ADULT_TAGS.map(tag => (
                                    <button
                                        key={tag}
                                        className={styles.tagChip}
                                        data-active={selectedTags.includes(tag)}
                                        onClick={() => toggleTag(tag)}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </aside>

                    {/* Content */}
                    <main className={styles.content}>
                        <p className={styles.count}>
                            Mostrando <strong>{filtered.length}</strong> de <strong>{products.length}</strong> artículos
                        </p>

                        {loading ? (
                            <div className={styles.logoLoaderContainer}>
                                <div className={styles.logoWrapper}>
                                    <div className={styles.spinnerRing}></div>
                                    <Image src="/logo.png" alt="Cargando Bisonte Manga Logo" width={65} height={65} className={styles.pulsingLogo} priority />
                                </div>
                                <h3>Sincronizando Inventario...</h3>
                            </div>
                        ) : error && (
                            <div className={styles.state}>
                                <p className={styles.errorTitle}>Error de Conexión</p>
                                <p>{error}</p>
                            </div>
                        )}

                        {!loading && !error && filtered.length === 0 && (
                            <div className={styles.state}>
                                <p>No se encontraron productos con esos filtros.</p>
                            </div>
                        )}

                        {!loading && !error && filtered.length > 0 && (
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

                {selectedProduct && (
                    <MangaModal manga={selectedProduct} onClose={() => setSelectedProduct(null)} />
                )}
            </div>
        </>
    );
}
