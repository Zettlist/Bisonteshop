'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Target, Rocket, Package, CalendarCheck, Heart, Globe } from 'lucide-react';
import styles from './nosotros.module.css';

const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: (i = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }
    })
};

const staggerContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12 } }
};

const slideInLeft = {
    hidden: { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
};

const slideInRight = {
    hidden: { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
};

const scaleIn = {
    hidden: { opacity: 0, scale: 0.85 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] } }
};

const reasons = [
    {
        icon: Package,
        title: 'Envíos de Coleccionista',
        desc: 'Cada pedido es tratado con el cuidado que merece tu colección.'
    },
    {
        icon: CalendarCheck,
        title: 'Novedades Constantes',
        desc: 'Actualizamos nuestro catálogo con los últimos lanzamientos del mercado japonés.'
    },
    {
        icon: Heart,
        title: 'Pasión Real',
        desc: 'Somos fans como tú. Conocemos el hobby y lo vivimos todos los días.'
    },
    {
        icon: Globe,
        title: 'Importaciones Directas',
        desc: 'Ediciones exclusivas y difíciles de conseguir, directo a México.'
    },
];

export default function NosotrosPage() {
    return (
        <div className={styles.pageWrapper}>

            {/* Mural Background with slow zoom animation */}
            <div className={styles.muralBackground}>
                <motion.div
                    className={styles.muralImageWrapper}
                    initial={{ scale: 1.08 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 12, ease: 'linear', repeat: Infinity, repeatType: 'reverse' }}
                >
                    <img
                        src="/bisonte-mural.webp"
                        alt="Mural Bisonte Manga"
                        className={styles.muralImage}
                    />
                </motion.div>
                <div className={styles.muralOverlay} />
            </div>

            {/* HERO Section */}
            <section className={styles.heroSection}>
                <motion.div
                    className={styles.heroContent}
                    initial="hidden"
                    animate="visible"
                    variants={staggerContainer}
                >
                    <motion.div className={styles.eyebrow} variants={fadeUp} custom={0}>
                        <span>Conoce nuestra historia</span>
                    </motion.div>

                    <motion.h1 className={styles.heroTitle} variants={fadeUp} custom={1}>
                        Somos <br />
                        <span className={styles.accent}>Bisonte Manga</span>
                    </motion.h1>

                    <motion.p className={styles.heroParagraph} variants={fadeUp} custom={2}>
                        Un espacio donde los fans pueden conectarse con sus historias favoritas a través
                        de la mejor selección de importaciones japonesas, figuras y coleccionables.
                    </motion.p>
                </motion.div>
            </section>

            {/* Content sections */}
            <div className={styles.sectionsWrapper}>

                {/* Stats row */}
                <motion.div
                    className={styles.statsRow}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.3 }}
                    variants={staggerContainer}
                >
                    {[
                        { value: '500+', label: 'Títulos en stock' },
                        { value: '3 años', label: 'De historia' },
                        { value: '1000+', label: 'Clientes felices' },
                    ].map((stat, i) => (
                        <motion.div key={i} className={styles.statCard} variants={scaleIn} custom={i}>
                            <span className={styles.statValue}>{stat.value}</span>
                            <span className={styles.statLabel}>{stat.label}</span>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Mission / Vision */}
                <div className={styles.missionVision}>
                    <motion.div
                        className={styles.glassBlock}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.3 }}
                        variants={slideInLeft}
                    >
                        <div className={styles.blockIconWrapper}>
                            <Target size={28} strokeWidth={1.5} />
                        </div>
                        <h3>Misión</h3>
                        <p>Traer las historias más increíbles y ediciones de alta calidad directamente desde Japón hasta las manos de lectores apasionados.</p>
                    </motion.div>

                    <motion.div
                        className={styles.glassBlock}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.3 }}
                        variants={slideInRight}
                    >
                        <div className={styles.blockIconWrapper}>
                            <Rocket size={28} strokeWidth={1.5} />
                        </div>
                        <h3>Visión</h3>
                        <p>Convertirnos en la comunidad principal y más confiable para coleccionistas, expandiendo constantemente nuestro catálogo.</p>
                    </motion.div>
                </div>

                {/* Why us */}
                <motion.div
                    className={styles.whySection}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.2 }}
                    variants={staggerContainer}
                >
                    <motion.h2 className={styles.sectionTitle} variants={fadeUp}>
                        ¿Por qué nosotros?
                    </motion.h2>

                    <div className={styles.reasonsGrid}>
                        {reasons.map(({ icon: Icon, title, desc }, i) => (
                            <motion.div
                                key={i}
                                className={styles.reasonCard}
                                variants={fadeUp}
                                custom={i}
                                whileHover={{ y: -6, transition: { duration: 0.25 } }}
                            >
                                <div className={styles.reasonIconWrapper}>
                                    <Icon size={24} strokeWidth={1.5} />
                                </div>
                                <h4>{title}</h4>
                                <p>{desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

            </div>
        </div>
    );
}
