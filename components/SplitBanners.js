'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import styles from './SplitBanners.module.css';

const DEFAULT_BANNERS = [
    {
        id: 'promo',
        imageSrc: '/banners/promo-left.webp',
        badge: 'OFERTA',
        title: 'ENVÍO GRATIS',
        subtitle: 'En compras mayores a $999',
        cta: 'Comprar ahora',
        href: '/catalogo',
        colorClass: 'left',
    },
    {
        id: 'preventa',
        imageSrc: '/banners/promo-right.webp',
        badge: 'PRÓXIMAMENTE',
        title: 'PREVENTA ABIERTA',
        subtitle: 'Asegura tu ejemplar antes del lanzamiento',
        cta: 'Ver preventas',
        href: '/preventas',
        colorClass: 'right',
    },
];

const bannerVariants = {
    hidden: { opacity: 0, y: 32 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.55, delay: i * 0.15, ease: 'easeOut' },
    }),
};

export default function SplitBanners({ banners = DEFAULT_BANNERS }) {
    return (
        <section className={styles.section}>
            <div className={styles.grid}>
                {banners.map((banner, i) => (
                    <motion.div
                        key={banner.id}
                        className={styles.bannerWrapper}
                        custom={i}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.2 }}
                        variants={bannerVariants}
                    >
                        <Link href={banner.href} className={`${styles.banner} ${styles[banner.colorClass]}`}>
                            {/* BANNER: /public/banners/promo-left.webp o promo-right.webp — 960×320px cada uno */}
                            <div className={styles.imageSlot}>
                                <Image
                                    src={banner.imageSrc}
                                    alt={banner.title}
                                    fill
                                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                                    sizes="(max-width: 768px) 100vw, 50vw"
                                />
                            </div>

                            <div className={styles.overlay} />

                            <div className={styles.content}>
                                {banner.badge && (
                                    <span className={styles.badge}>{banner.badge}</span>
                                )}
                                <h3 className={styles.title}>{banner.title}</h3>
                                <p className={styles.subtitle}>{banner.subtitle}</p>
                                <span className={styles.cta}>{banner.cta} →</span>
                            </div>

                            {/* Borde rojo en hover */}
                            <div className={styles.borderAccent} />
                        </Link>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
