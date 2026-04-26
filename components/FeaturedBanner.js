'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import styles from './FeaturedBanner.module.css';

export default function FeaturedBanner({
    title = 'Colección Destacada',
    subtitle = 'Los títulos más esperados ya están aquí',
    badge = 'NUEVO',
    ctaText = 'Ver colección',
    ctaHref = '/novedades',
    imageSrc = '/banners/featured-banner-primavera.jpg',
}) {
    return (
        <motion.section
            className={styles.banner}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
        >
            {/* BANNER: /public/banners/featured-banner.webp — 1920×480px */}
            <div className={styles.imageSlot}>
                <Image
                    src={imageSrc}
                    alt={title}
                    fill
                    style={{ objectFit: 'cover', objectPosition: 'right center' }}
                    sizes="100vw"
                />
            </div>

            {/* Overlay lateral: izquierda oscura con texto, derecha muestra imagen */}
            <div className={styles.overlay} />

            <div className={styles.inner}>
                <motion.div
                    className={styles.textSide}
                    initial={{ opacity: 0, x: -40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.65, delay: 0.15, ease: 'easeOut' }}
                >
                    {badge && (
                        <span className={styles.badge}>{badge}</span>
                    )}
                    <h2 className={styles.title}>{title}</h2>
                    <p className={styles.subtitle}>{subtitle}</p>
                    <Link href={ctaHref} className={styles.cta}>
                        {ctaText} →
                    </Link>
                </motion.div>
            </div>
        </motion.section>
    );
}
