'use client';

import { X, ShoppingBag, BookOpen, Layers, Globe, Building2, User2, Weight, Barcode, Hash, PackageCheck } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import styles from './MangaModal.module.css';
import { useCurrency } from '@/context/CurrencyContext';
import { useCartStore } from '@/store/cartStore';

// Parsea el campo dimensions que puede venir como JSON string o string plano
function parseDimensions(raw) {
    if (!raw) return null;
    try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const parts = [];
        if (obj.length) parts.push(`L: ${obj.length} cm`);
        if (obj.width)  parts.push(`An: ${obj.width} cm`);
        if (obj.height) parts.push(`Al: ${obj.height} cm`);
        return parts.length ? parts.join('  ·  ') : String(raw);
    } catch {
        return String(raw);
    }
}

export default function MangaModal({ manga, onClose }) {
    const { formatPrice, currency } = useCurrency();
    const addItem = useCartStore(state => state.addItem);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    if (!manga || typeof document === 'undefined') return null;

    const isOutOfStock = (manga.stock ?? 0) <= 0;
    const price = manga.price != null ? Number(manga.price) : null;
    const tags = Array.isArray(manga.tags) ? manga.tags.filter(t => t?.trim()) : [];
    const dimensions = parseDimensions(manga.dimensions);
    const publisher = manga.publisher?.toLowerCase() !== 'undefined' ? manga.publisher : null;

    const details = [
        manga.isbn      && { icon: Hash,         label: 'ISBN',        value: manga.isbn },
        manga.barcode   && { icon: Barcode,       label: 'Código',      value: manga.barcode },
        manga.pages > 0 && { icon: BookOpen,      label: 'Páginas',     value: `${manga.pages} págs` },
        manga.language  && { icon: Globe,         label: 'Idioma',      value: manga.language },
        (manga.artist || manga.author) && { icon: User2, label: 'Artista', value: manga.artist || manga.author },
        dimensions      && { icon: Layers,        label: 'Dimensiones', value: dimensions },
        manga.weight > 0 && { icon: Weight,       label: 'Peso',        value: `${manga.weight} g` },
        publisher       && { icon: Building2,     label: 'Editorial',   value: publisher },
    ].filter(Boolean);

    const content = (
        <motion.div
            className={styles.overlay}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
        >
            <motion.div
                className={styles.modal}
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
                <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
                    <X size={18} />
                </button>

                {/* ── Imagen ── */}
                <div className={`${styles.imageCol} ${isOutOfStock ? styles.outOfStock : ''}`}>
                    {manga.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={manga.image_url} alt={manga.title || 'Portada'} className={styles.image} />
                    ) : (
                        <div className={styles.imagePlaceholder}>📚</div>
                    )}
                    {isOutOfStock && (
                        <div className={styles.outOfStockOverlay}>
                            <span className={styles.outOfStockLabel}>Agotado</span>
                        </div>
                    )}
                </div>

                {/* ── Detalle ── */}
                <div className={styles.detailCol}>

                    {/* Badges */}
                    <div className={styles.badges}>
                        {publisher && <span className={styles.publisherBadge}>{publisher}</span>}
                        {manga.category && <span className={styles.categoryBadge}>{manga.category}</span>}
                        {manga.gender && <span className={styles.genderBadge}>{manga.gender}</span>}
                    </div>

                    {/* Título */}
                    <h2 className={styles.title}>{manga.title || 'Sin título'}</h2>

                    {/* Precio + stock */}
                    <div className={styles.priceRow}>
                        <span className={styles.price}>
                            {price != null ? formatPrice(price) : '—'}
                            {price != null && <small> {currency}</small>}
                        </span>
                        <span className={`${styles.stockPill} ${isOutOfStock ? styles.stockPillOut : styles.stockPillIn}`}>
                            {isOutOfStock ? 'Agotado' : <><span className={styles.dot} />{manga.stock} disponibles</>}
                        </span>
                    </div>

                    {/* CTA */}
                    <button
                        onClick={() => { addItem(manga); onClose(); }}
                        disabled={isOutOfStock}
                        className={`${styles.ctaBtn} ${isOutOfStock ? styles.ctaDisabled : styles.ctaActive}`}
                    >
                        <ShoppingBag size={18} />
                        {isOutOfStock ? 'No disponible' : 'Agregar al Carrito'}
                    </button>

                    {/* Detalles */}
                    {details.length > 0 && (
                        <>
                            <p className={styles.detailsTitle}>Detalles</p>
                            <div className={styles.detailsGrid}>
                                {details.map(({ icon: Icon, label, value }) => (
                                    <div key={label} className={styles.detailItem}>
                                        <span className={styles.detailIcon}><Icon size={13} /></span>
                                        <div>
                                            <div className={styles.detailLabel}>{label}</div>
                                            <div className={styles.detailValue}>{value}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Tags */}
                    {tags.length > 0 && (
                        <div className={styles.tagSection}>
                            <div className={styles.tagList}>
                                {tags.map(tag => (
                                    <span key={tag} className={styles.tag}>{tag}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );

    return createPortal(content, document.body);
}
