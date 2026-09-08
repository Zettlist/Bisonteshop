'use client';

import { useState, useEffect, useMemo, Suspense, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import MangaCard from '@/components/MangaCard';
import { useSearchStore } from '@/store/searchStore';
import { Filter, PackageX, X } from 'lucide-react';
import styles from './mangas.module.css';
import { disponiblesDe } from '@/lib/apartado';

const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.04, duration: 0.3, ease: 'easeOut' }
    }),
};

function MangasPageInner() {
    const searchParams = useSearchParams();
    const [mangas, setMangas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Search y Filtros
    // Mismo termino que el buscador de la barra de navegacion: escriban
    // donde escriban, el catalogo filtra igual y ambos campos se ven iguales.
    const searchTerm = useSearchStore((st) => st.term);
    const setSearchTerm = useSearchStore((st) => st.setTerm);
    const [selectedCategory, setSelectedCategory] = useState(searchParams.get('categoria') || '');
    const [selectedPublisher, setSelectedPublisher] = useState('');
    const [selectedLanguage, setSelectedLanguage] = useState('');
    // La ficha de producto enlaza cada etiqueta aqui. Llega una sola en la
    // URL; el filtro sigue admitiendo varias a la vez desde el panel.
    const [selectedTags, setSelectedTags] = useState(
        searchParams.get('etiqueta') ? [searchParams.get('etiqueta')] : []
    );
    const [selectedStock, setSelectedStock] = useState('all'); // 'all' or 'inStock'
    const [sortBy, setSortBy] = useState('recent');

    // Estado UI
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [filtersClosing, setFiltersClosing] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); };
    }, []);
    const closeTimerRef = useRef(null);

    const closeFilters = () => {
        if (filtersClosing) return; // ya está cerrando, ignorar
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        setFiltersClosing(true);
        closeTimerRef.current = setTimeout(() => {
            setFiltersOpen(false);
            setFiltersClosing(false);
            closeTimerRef.current = null;
        }, 290);
    };

    // Cargar mangas
    useEffect(() => {
        async function fetchMangas() {
            try {
                const res = await fetch('/api/mangas');
                if (!res.ok) throw new Error('Error al cargar la base de datos');
                const data = await res.json();
                if (data.success) {
                    setMangas(data.mangas);
                } else {
                    throw new Error(data.error || 'Error desconocido');
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchMangas();
    }, []);

    // Extraer opciones únicas para filtros (normalizadas: trim + case-insensitive)
    const normalize = (str) => str?.trim() || '';

    const categories = useMemo(() => {
        const PRESET = ['Accesorio'];
        const map = new Map();
        PRESET.forEach(c => map.set(c.toLowerCase(), c));
        mangas.forEach(m => {
            const v = normalize(m.category);
            if (v && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), v);
        });
        return [...map.values()].sort();
    }, [mangas]);

    const publishers = useMemo(() => {
        const map = new Map();
        mangas.forEach(m => {
            const v = normalize(m.publisher);
            if (v && v.toLowerCase() !== 'undefined' && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), v);
        });
        return [...map.values()].sort();
    }, [mangas]);

    const languages = useMemo(() => {
        const map = new Map();
        mangas.forEach(m => {
            const v = normalize(m.language);
            if (v && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), v);
        });
        return [...map.values()].sort();
    }, [mangas]);

    const genders = useMemo(() => {
        const map = new Map();
        mangas.forEach(m => {
            const v = normalize(m.gender);
            if (v && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), v);
        });
        return [...map.values()].sort();
    }, [mangas]);

    const allTags = useMemo(() => {
        const PREDEFINED = [
            'Manga', 'Revistas', 'BL', 'Shonen', 'Seinen', 'Fantasía', 'GL',
            'Manhwa', 'Romance', 'Novela Ligera', 'Ciencia Ficción', 'Costumbrismo',
            'Psicológico', 'Comedia', 'Shojo', 'Terror'
        ];
        const map = new Map();
        PREDEFINED.forEach(t => map.set(normalize(t).toLowerCase(), normalize(t)));

        mangas.forEach(m => {
            m.tags?.forEach(t => {
                const v = normalize(t);
                if (v && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), v);
            });
            const g = normalize(m.gender);
            if (g && !map.has(g.toLowerCase())) map.set(g.toLowerCase(), g);
        });

        map.delete('preventa'); // Excluir preventa explicitly
        return [...map.values()].sort();
    }, [mangas]);


    const toggleTag = (tag) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const hasActiveFilters = selectedCategory || selectedPublisher || selectedLanguage || selectedTags.length > 0 || sortBy !== 'recent' || selectedStock !== 'all';

    // Aplicar filtros y ordenamiento
    const processedMangas = useMemo(() => {
        let result = mangas.filter(m => m.is_adult !== 1 && m.is_adult !== true);

        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            result = result.filter(m =>
                (m.title && m.title.toLowerCase().includes(q)) ||
                (m.isbn && m.isbn.toLowerCase().includes(q)) ||
                (m.barcode && m.barcode.toLowerCase().includes(q)) ||
                (m.artist && m.artist.toLowerCase().includes(q))
            );
        }
        if (selectedCategory) result = result.filter(m => m.category?.trim().toLowerCase() === selectedCategory.toLowerCase());
        if (selectedPublisher) result = result.filter(m => m.publisher?.trim().toLowerCase() === selectedPublisher.toLowerCase());
        if (selectedLanguage) result = result.filter(m => m.language?.trim().toLowerCase() === selectedLanguage.toLowerCase());

        // Tags: un manga debe tener TODOS los tags seleccionados (ya sea en el array de tags o en su campo gender)
        if (selectedTags.length > 0) {
            result = result.filter(m =>
                selectedTags.every(tag => {
                    const tagLower = tag.toLowerCase();
                    const hasInTags = m.tags?.map(t => t.trim().toLowerCase()).includes(tagLower);
                    const hasInGender = m.gender?.trim().toLowerCase() === tagLower;
                    return hasInTags || hasInGender;
                })
            );
        }

        // El interruptor dice «Solo disponibles», no «solo lo que esta en el
        // estante»: una preventa se puede comprar y apartar, asi que cuenta como
        // disponible aunque su stock sea cero. Filtrar por `stock > 0` las
        // escondia todas justo del cliente que pidio ver lo que puede llevarse.
        if (selectedStock === 'inStock') {
            result = result.filter(m => disponiblesDe(m) > 0);
        }

        result = [...result].sort((a, b) => {
            switch (sortBy) {
                case 'price_asc': return Number(a.price) - Number(b.price);
                case 'price_desc': return Number(b.price) - Number(a.price);
                case 'abc': return (a.title || '').localeCompare(b.title || '');
                default: return b.id - a.id;
            }
        });

        return result;
    }, [mangas, searchTerm, selectedCategory, selectedPublisher, selectedLanguage, selectedTags, sortBy, selectedStock]);

    const resetAllFilters = () => {
        setSearchTerm('');
        setSelectedCategory('');
        setSelectedPublisher('');
        setSelectedLanguage('');
        setSelectedTags([]);
        setSelectedStock('all');
        setSortBy('recent');
    };

    return (
        <>
        <div className={`${styles.pageWrapper} ${styles.pageTransition}`}>
            <div className={styles.container}>

                {/* Cabecera: solo el boton de filtros — la busqueda vive en la
                    barra de navegacion, este campo la duplicaba. */}
                <div className={styles.header}>
                    <button
                        className={styles.filterToggleBtn}
                        onClick={() => setFiltersOpen(true)}
                        aria-label="Abrir filtros"
                    >
                        <Filter size={16} />
                        Filtros
                        {hasActiveFilters && <span className={styles.filterBadge} />}
                    </button>
                </div>

                {/* Layout Flex */}
                <div className={styles.layout}>

                    {/* Sidebar Filtros — desktop only */}
                    <aside className={styles.sidebar}>
                        <div className={styles.filterGroup}>
                            <h3 className={styles.filterTitle}><Filter size={16} /> Filtros</h3>

                            {/* Filtros activos (chips visuales) — sidebar */}
                            {hasActiveFilters && (
                                <div className={styles.activeFiltersBar}>
                                    <span style={{ color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 700 }}>Filtros activos:</span>
                                    {selectedCategory && (
                                        <span className={styles.activeFilterChip}>
                                            {selectedCategory} <button onClick={() => setSelectedCategory('')}><X size={12} /></button>
                                        </span>
                                    )}
                                    {selectedPublisher && (
                                        <span className={styles.activeFilterChip}>
                                            {selectedPublisher} <button onClick={() => setSelectedPublisher('')}><X size={12} /></button>
                                        </span>
                                    )}
                                    {selectedLanguage && (
                                        <span className={styles.activeFilterChip}>
                                            {selectedLanguage} <button onClick={() => setSelectedLanguage('')}><X size={12} /></button>
                                        </span>
                                    )}
                                    {selectedTags.map(tag => (
                                        <span key={tag} className={styles.activeFilterChip}>
                                            #{tag} <button onClick={() => toggleTag(tag)}><X size={12} /></button>
                                        </span>
                                    ))}
                                    <button className={styles.resetBtn} style={{ width: 'auto', padding: '0.3rem 1rem', fontSize: '0.8rem' }} onClick={resetAllFilters}>
                                        Limpiar todo
                                    </button>
                                </div>
                            )}

                            {/* Ordenar por */}
                            <div className={styles.filterSection}>
                                <span className={styles.filterSectionLabel}>Ordenar por</span>
                                <select className={styles.select} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                                    <option value="recent">Novedades Primero</option>
                                    <option value="price_asc">Precio: Menor a Mayor</option>
                                    <option value="price_desc">Precio: Mayor a Menor</option>
                                    <option value="abc">Alfabético (A-Z)</option>
                                </select>
                            </div>

                            {/* Disponibilidad */}
                            <div className={styles.filterSection}>
                                <span className={styles.filterSectionLabel}>Disponibilidad</span>
                                <label className={styles.switchContainer}>
                                    <div className={styles.switch}>
                                        <input
                                            type="checkbox"
                                            checked={selectedStock === 'inStock'}
                                            onChange={(e) => setSelectedStock(e.target.checked ? 'inStock' : 'all')}
                                            className={styles.switchInput}
                                        />
                                        <span className={styles.slider}></span>
                                        <img className={styles.switchOff} alt="" src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAIG/8QAIxAAAgIABQQDAAAAAAAAAAAAAQMCBAAREiExBUFRcROBsf/EABQBAQAAAAAAAAAAAAAAAAAAAAX/xAAWEQADAAAAAAAAAAAAAAAAAAAAEiL/2gAMAwEAAhEDEQA/AMBTp03dNglMVuttjqnKQ2UPOfntkOThbqVVUJ12BKnogZQZpy+Ucc8knwePWJrWqyqEHVmrTahEBqpbBoAH1n635wt3a9mjN1p8X2pw0qVEbKB/CO/c4OphSVP/2Q==" />
                                        <img className={styles.switchOn} alt="" src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAQIEBf/EACMQAAEDAwQDAQEAAAAAAAAAAAQBAgUDESEAEjFBBlFhMkL/xAAUAQEAAAAAAAAAAAAAAAAAAAAF/8QAGBEAAwEBAAAAAAAAAAAAAAAAABIiMUH/2gAMAwEAAhEDEQA/AM+Bg4mS8coRccMOdNG01qVyH/kRvHPKKmMdr8uujPwUTG+NkRpw1AKWCbvHKa2zTGphc9u9p0q+rLqeMl4kSCGkYgtoE0HTahIz3bWGNanPrdyqWzn7p5ibh5CArnyZNMyVLpK0QSkt2BNXtVX+7ol1wuLJiyaHt+6Kyp//2Q==" />
                                    </div>
                                    <span className={styles.switchLabel}>Solo disponibles</span>
                                </label>
                            </div>

                            {/* Categorías */}
                            {categories.length > 0 && (
                                <div className={styles.filterSection}>
                                    <span className={styles.filterSectionLabel}>Categoría</span>
                                    <div className={styles.filterList}>
                                        <button className={styles.filterBtn} data-active={!selectedCategory} onClick={() => setSelectedCategory('')}>Todas</button>
                                        {categories.map(cat => (
                                            <button key={cat} className={styles.filterBtn} data-active={selectedCategory === cat} onClick={() => setSelectedCategory(cat)}>
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Idiomas */}
                            {languages.length > 0 && (
                                <div className={styles.filterSection}>
                                    <span className={styles.filterSectionLabel}>Idioma</span>
                                    <div className={styles.tagChips}>
                                        {languages.map(lang => (
                                            <button key={lang} className={styles.tagChip} data-active={selectedLanguage === lang} onClick={() => setSelectedLanguage(selectedLanguage === lang ? '' : lang)}>
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Tags */}
                            {allTags.length > 0 && (
                                <div className={styles.filterSection}>
                                    <span className={styles.filterSectionLabel}>Etiquetas</span>
                                    <div className={styles.tagChips}>
                                        {allTags.map(tag => (
                                            <button key={tag} className={styles.tagChip} data-active={selectedTags.includes(tag)} onClick={() => toggleTag(tag)}>
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Editoriales */}
                            {publishers.length > 0 && (
                                <div className={styles.filterSection}>
                                    <span className={styles.filterSectionLabel}>Editorial</span>
                                    <div className={styles.filterList}>
                                        <button className={styles.filterBtn} data-active={!selectedPublisher} onClick={() => setSelectedPublisher('')}>Todas</button>
                                        {publishers.map(pub => (
                                            <button key={pub} className={styles.filterBtn} data-active={selectedPublisher === pub} onClick={() => setSelectedPublisher(pub)}>
                                                {pub}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {hasActiveFilters && (
                                <button className={styles.resetBtn} onClick={resetAllFilters}>
                                    Limpiar Filtros
                                </button>
                            )}
                        </div>
                    </aside>

                    {/* Catálogo Principal */}
                    <main className={styles.content}>
                        {loading ? (
                            <div className={styles.logoLoaderContainer}>
                                <div className={styles.logoWrapper}>
                                    <div className={styles.spinnerRing}></div>
                                    <Image src="/logo.png" alt="Cargando Bisonte Manga Logo" width={65} height={65} className={styles.pulsingLogo} priority />
                                </div>
                                <h3>Sincronizando Inventario...</h3>
                            </div>
                        ) : error ? (
                            <div className={styles.noResults}>
                                <h3 style={{ color: 'var(--primary)' }}>Error de Conexión</h3>
                                <p style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{error}</p>
                            </div>
                        ) : processedMangas.length === 0 ? (
                            <div className={styles.noResults}>
                                <PackageX size={64} style={{ color: 'var(--muted)', margin: '0 auto 1.5rem' }} />
                                <h3>Sin resultados</h3>
                                <p>Intenta ajustar los filtros o busca con otras palabras.</p>
                            </div>
                        ) : (
                            <>
                                <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontWeight: '600' }}>
                                    Mostrando <span style={{ color: 'var(--foreground)' }}>{processedMangas.length}</span> de <span style={{ color: 'var(--foreground)' }}>{mangas.length}</span> artículos
                                </p>
                                <div className={styles.grid}>
                                    {processedMangas.map((manga, i) => (
                                        <motion.div
                                            key={manga.id}
                                            className={styles.gridItem}
                                            custom={i}
                                            variants={cardVariants}
                                            initial="hidden"
                                            animate="visible"
                                        >
                                            <MangaCard manga={manga} />
                                        </motion.div>
                                    ))}
                                </div>
                            </>
                        )}
                    </main>
                </div>
            </div>

        </div>

        {/* ── Mobile Filter Sheet — Portal directo a body, evita stacking context de framer-motion ── */}
        {mounted && (filtersOpen || filtersClosing) && createPortal(
            <>
                <div
                    className={`${styles.filterOverlay} ${filtersClosing ? styles.filterOverlayOut : ''}`}
                    onClick={() => closeFilters()}
                />
                <div className={`${styles.mobileSheet} ${filtersClosing ? styles.mobileSheetOut : ''}`}>
                        {/* Header con botón cerrar */}
                        <div className={styles.sidebarMobileHeader}>
                            <span className={styles.filterTitle}><Filter size={16} /> Filtros</span>
                            <button className={styles.sidebarCloseBtn} onClick={() => closeFilters()} aria-label="Cerrar filtros">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Ordenar por */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>ORDENAR POR</span>
                            <select className={styles.select} value={sortBy} onChange={(e) => { setSortBy(e.target.value); }}>
                                <option value="recent">Novedades Primero</option>
                                <option value="price_asc">Precio: Menor a Mayor</option>
                                <option value="price_desc">Precio: Mayor a Menor</option>
                                <option value="abc">Alfabético (A-Z)</option>
                            </select>
                        </div>
                        <div className={styles.sectionDivider} />

                        {/* Disponibilidad */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>DISPONIBILIDAD</span>
                            <label className={styles.switchContainer}>
                                <div className={styles.switch}>
                                    <input type="checkbox" checked={selectedStock === 'inStock'} onChange={(e) => setSelectedStock(e.target.checked ? 'inStock' : 'all')} className={styles.switchInput} />
                                    <span className={styles.slider}></span>
                                    <span className={styles.switchOff}></span>
                                    <span className={styles.switchOn}></span>
                                </div>
                                <span className={styles.switchLabel}>Solo disponibles</span>
                            </label>
                        </div>
                        <div className={styles.sectionDivider} />

                        {/* Categorías */}
                        {categories.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>CATEGORÍA</span>
                                <div className={styles.filterList}>
                                    <button className={styles.filterBtn} data-active={!selectedCategory} onClick={() => setSelectedCategory('')}>Todas</button>
                                    {categories.map(cat => (
                                        <button key={cat} className={styles.filterBtn} data-active={selectedCategory === cat} onClick={() => setSelectedCategory(cat)}>{cat}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className={styles.sectionDivider} />

                        {/* Idiomas */}
                        {languages.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>IDIOMA</span>
                                <div className={styles.tagChips}>
                                    {languages.map(lang => (
                                        <button key={lang} className={styles.tagChip} data-active={selectedLanguage === lang} onClick={() => setSelectedLanguage(selectedLanguage === lang ? '' : lang)}>{lang}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className={styles.sectionDivider} />

                        {/* Tags */}
                        {allTags.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>ETIQUETAS</span>
                                <div className={styles.tagChips}>
                                    {allTags.map(tag => (
                                        <button key={tag} className={styles.tagChip} data-active={selectedTags.includes(tag)} onClick={() => toggleTag(tag)}>{tag}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className={styles.sectionDivider} />

                        {/* Editoriales */}
                        {publishers.length > 0 && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>EDITORIAL</span>
                                <div className={styles.filterList}>
                                    <button className={styles.filterBtn} data-active={!selectedPublisher} onClick={() => setSelectedPublisher('')}>Todas</button>
                                    {publishers.map(pub => (
                                        <button key={pub} className={styles.filterBtn} data-active={selectedPublisher === pub} onClick={() => setSelectedPublisher(pub)}>{pub}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {hasActiveFilters && (
                            <>
                                <div className={styles.sectionDivider} />
                                <button className={styles.resetBtn} onClick={() => { resetAllFilters(); closeFilters(); }}>
                                    Limpiar Filtros
                                </button>
                            </>
                        )}
                </div>
            </>,
            document.body
        )}
        </>
    );
}

export default function MangasPage() { return <Suspense><MangasPageInner /></Suspense>; }
