'use client';

import { motion } from 'framer-motion';
import styles from './Hero.module.css';
import Link from 'next/link';
import Image from 'next/image';

export default function Hero() {
    return (
        <section className={styles.hero}>
            {/* Graffiti background layer */}
            <motion.div
                className={styles.graffitiLayer}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
            >
                <Image
                    src="/graffiti-bg.webp"
                    alt="Graffiti"
                    fill
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                    priority
                />
            </motion.div>

            <div className={styles.speedLines}></div>
            <div className={styles.overlayGradient}></div>

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
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
                >
                    <Image
                        src="/logo.png"
                        alt="Bisonte Manga Logo"
                        width={320}
                        height={160}
                        style={{ objectFit: 'contain' }}
                        priority
                    />
                </motion.div>

                <motion.h1
                    className={styles.title}
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.15, ease: 'easeOut' }}
                >
                    BISONTE<br /><span>MANGA</span>
                </motion.h1>

                <motion.div
                    className={styles.buttons}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.5 }}
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
