'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import styles from './Categories.module.css';

const CATEGORIES = [
    { id: 'manga',      href: '/mangas',    imageSrc: '/banners/cat-manga.png' },
    { id: 'figuras',    href: '/figuras',   imageSrc: '/banners/cat-figuras.png' },
    { id: 'revistas',   href: '/mangas?categoria=Revista',  imageSrc: '/banners/cat-revistas.png' },
    { id: 'accesorios', href: '/accesorios',imageSrc: '/banners/cat-accesorios.png' },
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
                            custom={i}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, amount: 0.15 }}
                            variants={cardVariants}
                        >
                            <Link href={cat.href} className={styles.card}>
                                <Image
                                    src={cat.imageSrc}
                                    alt={cat.id}
                                    fill
                                    style={{ objectFit: 'cover', objectPosition: 'center top' }}
                                    sizes="(max-width: 768px) 100vw, 50vw"
                                />
                                <div className={styles.cardBorder} />
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
