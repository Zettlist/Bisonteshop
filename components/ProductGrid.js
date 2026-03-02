'use client';

import styles from './ProductGrid.module.css';
import { motion } from 'framer-motion';
import Link from 'next/link';

const MOCK_PRODUCTS = [
    { id: 1, title: 'Berserk Vol. 1', category: 'Manga', price: '$15.00', icon: '📖' },
    { id: 2, title: 'One Piece Vol. 100', category: 'Manga', price: '$12.00', icon: '📖' },
    { id: 3, title: 'Vegeta Super Saiyan', category: 'Figura', price: '$45.00', icon: '🗿' },
    { id: 4, title: 'Vagabond Vizbig 1', category: 'Manga', price: '$20.00', icon: '📖' },
];

const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, delay: i * 0.1, ease: 'easeOut' },
    }),
};

export default function ProductGrid() {
    return (
        <section className={styles.gridSection}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div>
                        <p className={styles.sectionLabel}>Lo más nuevo</p>
                        <h2 className={styles.sectionTitle}>NOVEDADES</h2>
                    </div>
                    <Link href="/catalogo" className={styles.seeAll}>Ver todo →</Link>
                </div>

                <div className={styles.grid}>
                    {MOCK_PRODUCTS.map((product, i) => (
                        <motion.div
                            key={product.id}
                            className={styles.card}
                            custom={i}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, amount: 0.2 }}
                            variants={cardVariants}
                        >
                            <div className={styles.imagePlaceholder}>
                                {product.icon}
                            </div>
                            <div className={styles.cardContent}>
                                <p className={styles.cardCategory}>{product.category}</p>
                                <h3 className={styles.cardTitle}>{product.title}</h3>
                                <div className={styles.cardFooter}>
                                    <span className={styles.cardPrice}>{product.price}</span>
                                    <button className={styles.addToCart}>+ Carrito</button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
