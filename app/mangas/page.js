'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import MangaCard from '@/components/MangaCard';
import MangaModal from '@/components/MangaModal';
import { Search, Loader2, Filter, PackageX, X } from 'lucide-react';
import styles from './mangas.module.css';

export default function MangasPage() {
    const [mangas, setMangas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Search y Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedPublisher, setSelectedPublisher] = useState('');
    const [selectedLanguage, setSelectedLanguage] = useState('');
    const [selectedTags, setSelectedTags] = useState([]); // múltiples tags (AND)
    const [selectedStock, setSelectedStock] = useState('all'); // 'all' or 'inStock'
    const [sortBy, setSortBy] = useState('recent');

    // Estado UI
    const [selectedManga, setSelectedManga] = useState(null);

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
        const map = new Map();
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
            if (v && !map.has(v.toLowerCase())) map.set(v.toLowerCase(), v);
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

        if (selectedStock === 'inStock') {
            result = result.filter(m => m.stock > 0);
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
    }, [mangas, searchTerm, selectedCategory, selectedPublisher, selectedLanguage, selectedTags, sortBy]);

    const resetAllFilters = () => {
        setSelectedCategory('');
        setSelectedPublisher('');
        setSelectedLanguage('');
        setSelectedTags([]);
        setSelectedStock('all');
        setSortBy('recent');
    };

    return (
        <div className={`${styles.pageWrapper} ${styles.pageTransition}`}>
            <div className={styles.container}>

                {/* Top Bar: solo búsqueda + conteo */}
                <div className={styles.header}>
                    <div className={styles.searchBox}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="Buscar por título, ISBN, autor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={styles.searchInput}
                        />
                    </div>
                </div>

                {/* Filtros activos (chips visuales) */}
                {hasActiveFilters && (
                    <div className={styles.activeFiltersBar}>
                        <span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 700 }}>Filtros activos:</span>
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

                {/* Layout Flex */}
                <div className={styles.layout}>

                    {/* Sidebar Filtros */}
                    <aside className={styles.sidebar}>
                        <div className={styles.filterGroup}>
                            <h3 className={styles.filterTitle}><Filter size={16} /> Filtros</h3>

                            {/* Ordenar por */}
                            <div style={{ marginBottom: '1.25rem' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>ORDENAR POR</span>
                                <select className={styles.select} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
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

                            <div className={styles.sectionDivider} />

                            {/* Categorías */}
                            {categories.length > 0 && (
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>CATEGORÍA</span>
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

                            <div className={styles.sectionDivider} />

                            {/* Idiomas */}
                            {languages.length > 0 && (
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>IDIOMA</span>
                                    <div className={styles.tagChips}>
                                        {languages.map(lang => (
                                            <button key={lang} className={styles.tagChip} data-active={selectedLanguage === lang} onClick={() => setSelectedLanguage(selectedLanguage === lang ? '' : lang)}>
                                                {lang}
                                            </button>
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
                                            <button key={tag} className={styles.tagChip} data-active={selectedTags.includes(tag)} onClick={() => toggleTag(tag)}>
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={styles.sectionDivider} />

                            {/* Editoriales */}
                            {publishers.length > 0 && (
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>EDITORIAL</span>
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
                                <>
                                    <div className={styles.sectionDivider} />
                                    <button className={styles.resetBtn} onClick={resetAllFilters}>
                                        Limpiar Filtros
                                    </button>
                                </>
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
                                    {processedMangas.map((manga) => (
                                        <div key={manga.id} className={styles.gridItem}>
                                            <MangaCard
                                                manga={manga}
                                                onClick={(m) => setSelectedManga(m)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </main>
                </div>
            </div>

            {selectedManga && (
                <MangaModal
                    manga={selectedManga}
                    onClose={() => setSelectedManga(null)}
                />
            )}
        </div>
    );
}
