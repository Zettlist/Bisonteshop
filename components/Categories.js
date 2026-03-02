'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import styles from './Categories.module.css';

const CATEGORIES = [
    {
        id: 'manga',
        icon: '📚',
        title: 'MANGAS',
        desc: 'Shonen, Seinen, Shoujo y más',
        href: '/mangas',
        colorClass: 'manga',
    },
    {
        id: 'figuras',
        icon: '🗿',
        title: 'FIGURAS',
        desc: 'Coleccionables de alta calidad',
        href: '/figuras',
        colorClass: 'figuras',
    },
    {
        id: 'revistas',
        icon: '📰',
        title: 'REVISTAS',
        desc: 'Las últimas publicaciones',
        href: '/revistas',
        colorClass: 'revistas',
    },
    {
        id: 'accesorios',
        icon: '🎭',
        title: 'ACCESORIOS',
        desc: 'Posters, pins, ropa y más',
        href: '/accesorios',
        colorClass: 'accesorios',
    },
];

const cardVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, delay: i * 0.1, ease: 'easeOut' },
    }),
};

export default function Categories() {
    return (
        <section className={styles.section}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <span className={styles.label}>Explora</span>
                    <h2 className={styles.title}>NUESTRAS CATEGORÍAS</h2>
                </div>

                <div className={styles.grid}>
                    {CATEGORIES.map((cat, i) => (
                        <motion.div
                            key={cat.id}
                            className={styles.card}
                            custom={i}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, amount: 0.2 }}
                            variants={cardVariants}
                        >
                            <div className={`${styles.cardBg} ${styles[cat.colorClass]}`} />
                            <div className={styles.cardOverlay} />
                            <div className={styles.cardContent}>
                                <span className={styles.cardIcon}>{cat.icon}</span>
                                <h3 className={styles.cardTitle}>{cat.title}</h3>
                                <p className={styles.cardDesc}>{cat.desc}</p>
                                <Link href={cat.href} className={styles.cardLink}>
                                    Ver todo →
                                </Link>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
