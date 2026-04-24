'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import styles from './ProductGrid.module.css';
import Link from 'next/link';
import MangaCard from '@/components/MangaCard';
import MangaModal from '@/components/MangaModal';

const SLOT_VISIBLE = 5;
const SLOT_INTERVAL = 3200;

function SlotGrid({ products, onCardClick }) {
    const [offset, setOffset] = useState(0);
    const [phase, setPhase] = useState('idle');
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

export default function ProductGrid() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedProduct, setSelectedProduct] = useState(null);

    useEffect(() => {
        fetch('/api/mangas?all=1')
            .then(r => r.json())
            .then(data => {
                if (data.success) setProducts(data.mangas);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const novedadesRaw = useMemo(() =>
        products.filter(p => p.events?.novedad?.active === true),
        [products]
    );

    const fallback = [...products].sort((a, b) => b.id - a.id).slice(0, 10);

    const displayProducts = novedadesRaw.length >= SLOT_VISIBLE
        ? novedadesRaw
        : fallback;

    const isFallback = novedadesRaw.length < SLOT_VISIBLE;

    if (loading) return (
        <section className={styles.gridSection}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div>
                        <p className={styles.sectionLabel}>Lo más nuevo</p>
                        <h2 className={styles.sectionTitle}>NOVEDADES</h2>
                    </div>
                </div>
                <div className={styles.skeletonGrid}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className={styles.skeletonCard} />
                    ))}
                </div>
            </div>
        </section>
    );

    if (displayProducts.length === 0) return null;

    return (
        <>
            <section className={styles.gridSection}>
                <div className={styles.container}>
                    <div className={styles.header}>
                        <div>
                            <p className={styles.sectionLabel}>Lo más nuevo</p>
                            <h2 className={styles.sectionTitle}>
                                NOVEDADES
                                {isFallback && <span className={styles.fallbackBadge}>Próximamente</span>}
                            </h2>
                        </div>
                        <Link href="/mangas" className={styles.seeAll}>Ver todo →</Link>
                    </div>
                    <SlotGrid products={displayProducts} onCardClick={setSelectedProduct} />
                </div>
            </section>

            {selectedProduct && (
                <MangaModal manga={selectedProduct} onClose={() => setSelectedProduct(null)} />
            )}
        </>
    );
}
