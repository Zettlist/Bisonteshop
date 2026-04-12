import styles from './MangaCard.module.css';
import { useCurrency } from '@/context/CurrencyContext';
import { useCartStore } from '@/store/cartStore';
import { ShoppingCart } from 'lucide-react';
import { useState } from 'react';

export default function MangaCard({ manga, onClick }) {
    const { formatPrice } = useCurrency();
    const addItem = useCartStore(state => state.addItem);
    const imageUrl = manga.image_url || null;
    const isOutOfStock = manga.stock <= 0;
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);

    return (
        <div
            onClick={() => onClick(manga)}
            className={`${styles.card} ${isOutOfStock ? styles.outOfStock : ''}`}
        >
            {/* Image Container */}
            <div className={styles.imageWrapper}>
                {imageUrl && !imgError ? (
                    <>
                        {!imgLoaded && <div className={styles.imageSkeleton} aria-hidden="true" />}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={imageUrl}
                            alt={manga.title || 'Portada'}
                            className={styles.image}
                            loading="lazy"
                            decoding="async"
                            onLoad={() => setImgLoaded(true)}
                            onError={() => setImgError(true)}
                            style={imgLoaded ? {} : { opacity: 0, position: 'absolute' }}
                        />
                    </>
                ) : (
                    <div className={styles.imagePlaceholder}>📚</div>
                )}

                {/* Quick Add To Cart Button */}
                {!isOutOfStock && (
                    <button
                        className={styles.quickAddBtn}
                        onClick={(e) => {
                            e.stopPropagation();
                            addItem(manga);
                        }}
                        aria-label="Agregar al carrito rápidamente"
                        title="Agregar rápido"
                    >
                        <ShoppingCart size={16} />
                        <span>Agregar</span>
                    </button>
                )}

                {/* Badges */}
                <div className={styles.badgeRow}>
                    {manga.publisher && manga.publisher.toLowerCase() !== 'undefined' && (
                        <span className={styles.publisherBadge} title={manga.publisher}>
                            {manga.publisher}
                        </span>
                    )}
                    <span className={`${styles.stockBadge} ${isOutOfStock ? styles.outOfStockBadge : styles.inStock}`}>
                        {isOutOfStock ? 'Agotado' : `${manga.stock} disp.`}
                    </span>
                </div>
            </div>

            {/* Card Body */}
            <div className={styles.body}>
                {manga.category && (
                    <span className={styles.category}>{manga.category}</span>
                )}
                <h3 className={styles.title}>{manga.title}</h3>

                {/* Quick meta */}
                <div className={styles.meta}>
                    {manga.pages > 0 && (
                        <span className={styles.metaChip}>📖 {manga.pages} págs</span>
                    )}
                    {manga.language && (
                        <span className={styles.metaChip}>{manga.language}</span>
                    )}
                    {manga.gender && (
                        <span className={styles.metaChip}>{manga.gender}</span>
                    )}
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <span className={styles.priceLabel}>Precio</span>
                    <span className={styles.price}>
                        {formatPrice(manga.price)}
                    </span>
                </div>
            </div>
        </div>
    );
}
