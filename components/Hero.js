'use client';

import { motion } from 'framer-motion';
import styles from './Hero.module.css';
import Link from 'next/link';
import Image from 'next/image';

export default function Hero() {
    return (
        <section className={styles.hero}>
            {/* BANNER: reemplaza /public/banners/hero-main.webp — tamaño recomendado: 1920×1080px */}
            <div className={styles.bannerLayer}>
                <Image
                    src="/banners/hero-main.webp"
                    alt="Hero Banner"
                    fill
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                    priority
                />
            </div>

            {/* Graffiti overlay (sutil, por encima del banner) */}
            <motion.div
                className={styles.graffitiLayer}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
            >
                <Image
                    src="/graffiti-bg.webp"
                    alt=""
                    fill
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                    priority
                />
            </motion.div>

            {/* Speed lines manga effect */}
            <div className={styles.speedLines} />

            {/* Overlay oscuro degradado sobre la imagen */}
            <div className={styles.overlayGradient} />

            <div className={styles.content}>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <span className={styles.badge}>Manga · Figuras · Coleccionables</span>
                </motion.div>

                <motion.div
                    className={styles.logoWrapper}
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.7, delay: 0.12, ease: 'easeOut' }}
                >
                    <Image
                        src="/logo.png"
                        alt="Bisonte Manga Logo"
                        width={340}
                        height={170}
                        style={{ objectFit: 'contain' }}
                        priority
                    />
                </motion.div>

                <motion.h1
                    className={styles.title}
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.18, ease: 'easeOut' }}
                >
                    BISONTE<br /><span>MANGA</span>
                </motion.h1>

                <motion.p
                    className={styles.subtitle}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.38 }}
                >
                    Tu tienda de manga, figuras y coleccionables de anime
                </motion.p>

                <motion.div
                    className={styles.buttons}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.52 }}
                >
                    <Link href="/mangas" className={styles.ctaButton}>
                        Explorar
                    </Link>
                    <Link href="/novedades" className={styles.secondaryButton}>
                        Novedades
                    </Link>
                </motion.div>
            </div>

            <div className={styles.scrollIndicator}>
                <span>↓</span>
                <span>Scroll</span>
            </div>
        </section>
    );
}
