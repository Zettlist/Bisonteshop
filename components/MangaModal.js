'use client';

import { X, ShoppingBag, BookOpen, Layers, Globe, Building2, User2, AlignLeft, Barcode, Hash } from 'lucide-react';
import { useEffect } from 'react';
import styles from './MangaModal.module.css';
import { useCurrency } from '@/context/CurrencyContext';
import { useCart } from '@/context/CartContext';

export default function MangaModal({ manga, onClose }) {
    const { formatPrice, currency } = useCurrency();
    const { addToCart } = useCart();
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    if (!manga) return null;
    const isOutOfStock = manga.stock <= 0;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

                {/* Close button */}
                <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
                    <X size={20} />
                </button>

                {/* Left: Image */}
                <div className={`${styles.imageCol} ${isOutOfStock ? styles.outOfStock : ''}`}>
                    {manga.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={manga.image_url}
                            alt={manga.title || 'Portada'}
                            className={styles.image}
                        />
                    ) : (
                        <div className={styles.imagePlaceholder}>📚</div>
                    )}
                    {isOutOfStock && (
                        <div className={styles.outOfStockOverlay}>
                            <span className={styles.outOfStockLabel}>Agotado</span>
                        </div>
                    )}
                </div>

                {/* Right: Details */}
                <div className={styles.detailCol}>
                    <div className={styles.badges}>
                        {manga.publisher && <span className={styles.publisherBadge}>{manga.publisher}</span>}
                        {manga.category && <span className={styles.categoryBadge}>{manga.category}</span>}
                        {manga.gender && <span className={styles.genderBadge}>{manga.gender}</span>}
                    </div>

                    <h2 className={styles.title}>{manga.title}</h2>

                    <div className={styles.priceRow}>
                        <span className={styles.price}>{formatPrice(manga.price)} <small>{currency}</small></span>
                        {!isOutOfStock && (
                            <span className={styles.stockIndicator}>
                                <span className={styles.dot} />
                                {manga.stock} disponibles
                            </span>
                        )}
                    </div>

                    <button
                        onClick={() => {
                            addToCart(manga);
                            onClose();
                        }}
                        disabled={isOutOfStock}
                        className={`${styles.ctaBtn} ${isOutOfStock ? styles.ctaDisabled : styles.ctaActive}`}
                    >
                        <ShoppingBag size={20} />
                        {isOutOfStock ? 'No disponible temporalmente' : 'Agregar al Carrito'}
                    </button>

                    <hr className={styles.divider} />

                    <h3 className={styles.detailsTitle}>Detalles del Producto</h3>
                    <div className={styles.detailsGrid}>
                        {manga.isbn && <DetailItem icon={<Hash size={14} />} label="ISBN" value={manga.isbn} />}
                        {manga.barcode && <DetailItem icon={<Barcode size={14} />} label="Código" value={manga.barcode} />}
                        {manga.pages > 0 && <DetailItem icon={<BookOpen size={14} />} label="Páginas" value={manga.pages} />}
                        {manga.language && <DetailItem icon={<Globe size={14} />} label="Idioma" value={manga.language} />}
                        {(manga.artist || manga.author) && <DetailItem icon={<User2 size={14} />} label="Artista" value={manga.artist || manga.author} />}
                        {manga.dimensions && <DetailItem icon={<Layers size={14} />} label="Dimensiones" value={manga.dimensions} />}
                        {manga.weight > 0 && <DetailItem icon={<AlignLeft size={14} />} label="Peso" value={`${manga.weight} g`} />}
                    </div>

                    {manga.tags?.length > 0 && (
                        <div className={styles.tagSection}>
                            <h4 className={styles.tagSectionTitle}>Etiquetas</h4>
                            <div className={styles.tagList}>
                                {manga.tags.map(tag => (
                                    <span key={tag} className={styles.tag}>{tag}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function DetailItem({ icon, label, value }) {
    return (
        <div className={styles.detailItem}>
            <span className={styles.detailIcon}>{icon}</span>
            <div>
                <div className={styles.detailLabel}>{label}</div>
                <div className={styles.detailValue}>{value}</div>
            </div>
        </div>
    );
}
