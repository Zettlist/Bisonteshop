'use client';

import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { useRef } from 'react';
import styles from './Categories.module.css';

const CATEGORIES = [
    {
        id: 'manga',
        href: '/mangas',
        imageSrc: '/banners/cat-manga-v2.png',
        title: 'Mangas y Novelas',
        desc: 'Shonen, Seinen, Shoujo y más géneros',
        cta: 'Explorar',
        num: '01',
    },
    {
        id: 'figuras',
        href: '/figuras',
        imageSrc: '/banners/cat-figuras-v2.jpeg',
        title: 'Figuras de Colección',
        desc: 'Escala, articuladas, chibis y más',
        cta: 'Coleccionar',
        num: '02',
    },
    {
        id: 'revistas',
        href: '/mangas?categoria=Revista',
        imageSrc: '/banners/cat-revistas-v2.jpeg',
        title: 'Revistas Exclusivas',
        desc: 'Manga, Anime, Cosplay y Cultura Pop',
        cta: 'Descubrir',
        num: '03',
    },
    {
        id: 'accesorios',
        href: '/accesorios',
        imageSrc: '/banners/cat-accesorios-v2.png',
        title: 'Accesorios',
        desc: 'Joyas, relojes, llaveros, pines y más',
        cta: 'Ver todo',
        num: '04',
    },
];

function CategoryCard({ cat, index }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, amount: 0.35 });

    return (
        <motion.div
            ref={ref}
            className={styles.card}
            initial={{ opacity: 0, y: 32 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: index * 0.08, ease: 'easeOut' }}
        >
            <Link href={cat.href} className={styles.cardInner}>

                {/* Imagen izquierda — sale hacia la izquierda desde el logo */}
                <motion.div
                    className={styles.cardImage}
                    initial={{ x: 60, opacity: 0 }}
                    animate={inView ? { x: 0, opacity: 1 } : {}}
                    transition={{ duration: 0.6, delay: index * 0.08 + 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                    <Image
                        src={cat.imageSrc}
                        alt={cat.title}
                        fill
                        style={{ objectFit: 'cover', objectPosition: 'center top' }}
                        sizes="(max-width: 768px) 100vw, 45vw"
                    />
                    <div className={styles.imageOverlay} />

                    {/* Logo badge — aparece primero, escala desde grande a normal */}
                    <motion.div
                        className={styles.logoBadge}
                        initial={{ scale: 2.2, opacity: 0 }}
                        animate={inView
                            ? { scale: 1, opacity: 1 }
                            : { scale: 2.2, opacity: 0 }
                        }
                        transition={{ duration: 0.5, delay: index * 0.08 + 0.1, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <Image src="/logo.png" alt="Bisonte Manga" width={56} height={56} />
                    </motion.div>
                </motion.div>

                {/* Contenido derecho — sale hacia la derecha desde el logo */}
                <motion.div
                    className={styles.cardContent}
                    initial={{ x: -50, opacity: 0 }}
                    animate={inView ? { x: 0, opacity: 1 } : {}}
                    transition={{ duration: 0.6, delay: index * 0.08 + 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                    <span className={styles.cardNumber}>{cat.num}</span>
                    <h3 className={styles.cardTitle}>{cat.title}</h3>
                    <p className={styles.cardDesc}>{cat.desc}</p>
                    <span className={styles.cardCta}>
                        {cat.cta}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </span>
                </motion.div>

                {/* Borde rojo animado en hover */}
                <div className={styles.cardBorder} />
            </Link>
        </motion.div>
    );
}

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
                        <CategoryCard key={cat.id} cat={cat} index={i} />
                    ))}
                </div>
            </div>
        </section>
    );
}
