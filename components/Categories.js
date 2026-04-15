'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import styles from './Categories.module.css';

const CATEGORIES = [
    {
        id: 'manga',
        title: 'MANGAS',
        desc: 'Shonen, Seinen, Shoujo y más',
        href: '/mangas',
        colorClass: 'manga',
        imageSrc: '/banners/cat-manga.webp',
    },
    {
        id: 'figuras',
        title: 'FIGURAS',
        desc: 'Coleccionables de alta calidad',
        href: '/figuras',
        colorClass: 'figuras',
        imageSrc: '/banners/cat-figuras.webp',
    },
    {
        id: 'revistas',
        title: 'REVISTAS',
        desc: 'Las últimas publicaciones',
        href: '/revistas',
        colorClass: 'revistas',
        imageSrc: '/banners/cat-revistas.webp',
    },
    {
        id: 'accesorios',
        title: 'ACCESORIOS',
        desc: 'Posters, pins, ropa y más',
        href: '/accesorios',
        colorClass: 'accesorios',
        imageSrc: '/banners/cat-accesorios.webp',
    },
];

const cardVariants = {
    hidden: { opacity: 0, y: 48 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.55, delay: i * 0.1, ease: 'easeOut' },
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
                            viewport={{ once: true, amount: 0.15 }}
                            variants={cardVariants}
                        >
                            {/* BANNER: /public/banners/cat-[nombre].webp — 600×800px */}
                            <div className={`${styles.cardBg} ${styles[cat.colorClass]}`}>
                                <Image
                                    src={cat.imageSrc}
                                    alt={cat.title}
                                    fill
                                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                                    sizes="(max-width: 768px) 50vw, 25vw"
                                />
                            </div>

                            <div className={styles.cardOverlay} />

                            <div className={styles.cardContent}>
                                <div className={styles.cardTop}>
                                    <span className={styles.cardNumber}>0{i + 1}</span>
                                </div>
                                <div className={styles.cardBottom}>
                                    <h3 className={styles.cardTitle}>{cat.title}</h3>
                                    <p className={styles.cardDesc}>{cat.desc}</p>
                                    <Link href={cat.href} className={styles.cardLink}>
                                        Ver todo →
                                    </Link>
                                </div>
                            </div>

                            {/* Borde rojo en hover */}
                            <div className={styles.cardBorder} />
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
