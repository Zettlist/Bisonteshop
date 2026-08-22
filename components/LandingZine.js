'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import Categories from '@/components/Categories';
import ProductGrid from '@/components/ProductGrid';
import { useSplash } from '@/context/SplashContext';
import styles from './LandingZine.module.css';

const pop = {
    hidden: { opacity: 0, scale: 0.7, rotate: -6 },
    visible: (i = 0) => ({
        opacity: 1,
        scale: 1,
        rotate: 0,
        transition: { type: 'spring', stiffness: 260, damping: 18, delay: i * 0.08 }
    })
};

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: (i = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }
    })
};

const marqueeText = 'BISONTE MANGA ★ DIRECTO DE JAPÓN ★ CERO RELLENO ★ PURO MANGA ★ FIGURAS ★ COLECCIONABLES ★ ';

const stickers = [
    { emoji: '📦', title: 'Tu manga viaja en primera', desc: 'Burbuja, cartón rígido y cariño. Si llega con una esquina doblada, lloramos contigo 😭 (y te lo reponemos).', rotate: -2 },
    { emoji: '🆕', title: 'Cada semana cae algo nuevo', desc: 'Estamos pegados a los lanzamientos de Japón. Lo que sale allá, lo cazamos para acá.', rotate: 1.5 },
    { emoji: '🤓', title: 'Somos tan frikis como tú', desc: 'No te atiende un call center. Te atiende alguien que también se desveló leyendo el último capítulo.', rotate: -1 },
    { emoji: '✈️', title: 'Importación directa', desc: 'Ediciones japonesas que no vas a encontrar en el centro comercial. De Tokio a tu casa.', rotate: 2 },
];

// Secciones anunciadas pero todavía apagadas: salieron de la barra de arriba
// y se avisan aquí, bajo los botones de redes.
const PROXIMAMENTE = [
    { emoji: '✈️', titulo: 'Viajes a Japón', desc: 'Tours otaku con la banda de Bisonte.', badge: 'Pronto', color: '#ffd60a' },
    { emoji: '🔔', titulo: 'Preventas', desc: 'Aparta tu tomo antes de que aterrice.', badge: 'Muy pronto', color: '#ff5d8f' },
];

const VIDEOS_CONVENCION = [
    '/videos/convencion-1.mp4',
    '/videos/convencion-2.mp4',
    '/videos/convencion-3.mp4',
];

// Carrusel de videos dentro del polaroid: muted, se recorre solo cada 8s
const CARRUSEL_INTERVALO_MS = 8000;

function VideoCarousel() {
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        const t = setInterval(
            () => setIdx(i => (i + 1) % VIDEOS_CONVENCION.length),
            CARRUSEL_INTERVALO_MS
        );
        return () => clearInterval(t);
    }, []);

    return (
        <div className={styles.carouselBox}>
            <video
                key={VIDEOS_CONVENCION[idx]}
                src={VIDEOS_CONVENCION[idx]}
                className={styles.carouselVideo}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
            />
            <div className={styles.carouselDots}>
                {VIDEOS_CONVENCION.map((_, i) => (
                    <button
                        key={i}
                        className={`${styles.dot} ${i === idx ? styles.dotActive : ''}`}
                        onClick={() => setIdx(i)}
                        aria-label={`Video ${i + 1}`}
                    />
                ))}
            </div>
        </div>
    );
}

const stats = [
    { value: '500+', label: 'títulos en stock', note: 'y contando…' },
    { value: '3', label: 'años en esto', note: 'empezó como hobby' },
    { value: '1000+', label: 'clientes felices', note: 'la banda 🙌' },
];

export default function LandingZine() {
    // El hero no anima hasta que la pantalla de carga se retira: asi la entrada
    // se ve completa en vez de correr escondida detras del splash.
    const { listo } = useSplash();

    return (
        <div className={styles.pageWrapper}>

            {/* Fondo global del landing */}
            <div className={styles.bgLayer} aria-hidden="true">
                <img src="/landing-bg.webp" alt="" className={styles.bgImage} />
                <div className={styles.bgOverlay} />
            </div>

            {/* Marquee superior */}
            <div className={styles.marqueeStrip}>
                <div className={styles.marqueeTrack}>
                    {/* 6 copias: la animación recorre la mitad (3 copias ≈ 2850px), que siempre excede el ancho de pantalla → loop sin hueco */}
                    <span>{marqueeText.repeat(6)}</span>
                </div>
            </div>

            {/* HERO tipo póster */}
            <section className={styles.hero}>
                <div className={styles.halftone} aria-hidden="true" />

                <motion.div
                    className={styles.heroInner}
                    initial="hidden"
                    animate={listo ? 'visible' : 'hidden'}
                >
                    <motion.div className={styles.heroLogo} variants={pop} custom={0}>
                        <Image src="/logo.png" alt="Bisonte Manga" width={210} height={210} priority />
                    </motion.div>

                    <motion.span className={styles.handNote} variants={pop} custom={1}>
                        ojo: esto no lo escribió un robot ↓
                    </motion.span>

                    <motion.h1 className={styles.heroTitle} variants={fadeUp} custom={2}>
                        <span className={styles.titleLine}>SOMOS</span>
                        <span className={styles.titleBig}>BISONTE</span>
                        <span className={styles.titleOutline}>MANGA</span>
                    </motion.h1>

                    <motion.div className={styles.heroBadges} variants={fadeUp} custom={3}>
                        <span className={`${styles.sticker} ${styles.stickerRed}`}>100% FANS</span>
                        <span className={`${styles.sticker} ${styles.stickerYellow}`}>EST. 2023</span>
                        <span className={`${styles.sticker} ${styles.stickerWhite}`}>PRODUCTO ORIGINAL</span>
                    </motion.div>

                    <motion.p className={styles.heroText} variants={fadeUp} custom={4}>
                        Mangas, Revistas, Cosplay, Figuras…
                        <span className={styles.heroTextStrong}> Todos los caminos llegan aquí.</span>
                    </motion.p>

                    {/* Botones doodle de redes (adaptado de Uiverse.io by mamyapro123) */}
                    <motion.div className={styles.doodleWrap} variants={pop} custom={5}>
                        <svg style={{ visibility: 'hidden', position: 'absolute' }} width="0" height="0" xmlns="http://www.w3.org/2000/svg" version="1.1">
                            <defs>
                                <filter id="pencil-texture" x="-10%" y="-10%" width="120%" height="120%">
                                    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
                                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
                                </filter>
                            </defs>
                        </svg>
                        <ul className={styles.doodleContainer}>
                            <li className={styles.doodleIconContent}>
                                <a href="https://www.facebook.com/profile.php?id=61564525718779" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className={`${styles.doodleLink} ${styles.linkFb}`}>
                                    <svg className={styles.doodleSvg} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30">
                                        <path d="M29.059 15.085C29.058 7.322 22.764 1.028 15 1.028S0.941 7.323 0.941 15.087c0 6.989 5.1 12.787 11.781 13.875l0.081 0.011V19.15H9.232v-4.065h3.57v-3.096a4.962 4.962 0 0 1 5.329 -5.469l-0.017 -0.001c1.124 0.016 2.212 0.115 3.273 0.292l-0.126 -0.018v3.459h-1.774a2.033 2.033 0 0 0 -2.291 2.204l-0.001 -0.008v2.636h3.899l-0.623 4.065h-3.276v9.823c6.762 -1.101 11.862 -6.899 11.863 -13.888" />
                                    </svg>
                                </a>
                                <div className={`${styles.doodleTooltip} ${styles.tooltipFb}`}>Facebook</div>
                            </li>
                            <li className={styles.doodleIconContent}>
                                <a href="https://www.instagram.com/bisontemanga/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className={`${styles.doodleLink} ${styles.linkIg}`}>
                                    <svg className={styles.doodleSvg} viewBox="0 0 100 100">
                                        <path d="M60 45a15 15 0 1 0 -4.395 10.61A14.4 14.4 0 0 0 60 45.225l-0.004 -0.237zm8.1 0a23.006 23.006 0 1 1 -6.738 -16.347 22.2 22.2 0 0 1 6.742 15.96l-0.004 0.41v-0.02zm6.327 -24.022v0.008a5.4 5.4 0 1 1 -1.582 -3.818 5.177 5.177 0 0 1 1.556 3.705v0.11zm-29.4 -12.9 -4.482 -0.03q-4.072 -0.03 -6.184 0t-5.655 0.176a47.143 47.143 0 0 0 -6.312 0.638l0.273 -0.038a23.571 23.571 0 0 0 -4.362 1.136l0.16 -0.052a15.446 15.446 0 0 0 -8.52 8.452l-0.038 0.102a22.543 22.543 0 0 0 -1.065 4.062l-0.02 0.138a45 45 0 0 0 -0.597 5.96l-0.004 0.08q-0.147 3.548 -0.176 5.655t0 6.184 0.03 4.482 -0.03 4.482 0 6.184 0.176 5.655c0.075 2.193 0.292 4.275 0.638 6.312l-0.038 -0.273a23.571 23.571 0 0 0 1.136 4.362l-0.052 -0.16a15.446 15.446 0 0 0 8.452 8.52l0.102 0.038c1.192 0.446 2.606 0.82 4.062 1.065l0.138 0.02c1.758 0.308 3.84 0.525 5.955 0.597l0.08 0.004q3.548 0.147 5.655 0.176t6.184 0l4.455 -0.09 4.482 0.03q4.072 0.03 6.184 0t5.655 -0.176a47.143 47.143 0 0 0 6.312 -0.638l-0.273 0.038a23.571 23.571 0 0 0 4.362 -1.136l-0.16 0.052a15.446 15.446 0 0 0 8.52 -8.452l0.038 -0.102c0.446 -1.192 0.82 -2.606 1.065 -4.062l0.02 -0.138c0.308 -1.758 0.525 -3.84 0.597 -5.955l0.004 -0.08q0.147 -3.548 0.176 -5.655t0 -6.184 -0.03 -4.482 0.03 -4.482 0 -6.184 -0.176 -5.655a47.143 47.143 0 0 0 -0.638 -6.312l0.038 0.273a23.743 23.743 0 0 0 -1.136 -4.362l0.052 0.16a15.446 15.446 0 0 0 -8.452 -8.52l-0.102 -0.038a22.543 22.543 0 0 0 -4.062 -1.065l-0.138 -0.02a45 45 0 0 0 -5.955 -0.597l-0.08 -0.004q-3.548 -0.147 -5.655 -0.176t-6.184 0zM90 45q0 13.418 -0.3 18.574a24.9 24.9 0 0 1 -26.194 26.13l0.06 0.004q-5.157 0.3 -18.574 0.3t-18.574 -0.3A24.9 24.9 0 0 1 0.286 63.514l-0.004 0.06q-0.3 -5.157 -0.3 -18.574t0.3 -18.574A24.9 24.9 0 0 1 26.478 0.297l-0.058 -0.005q5.157 -0.3 18.574 -0.3t18.574 0.3a24.9 24.9 0 0 1 26.13 26.194l0.004 -0.06Q90 31.578 90 45" />
                                    </svg>
                                </a>
                                <div className={`${styles.doodleTooltip} ${styles.tooltipIg}`}>Instagram</div>
                            </li>
                            <li className={styles.doodleIconContent}>
                                <a href="https://x.com/bisontemanga" target="_blank" rel="noopener noreferrer" aria-label="X" className={`${styles.doodleLink} ${styles.linkTw}`}>
                                    <svg className={styles.doodleSvg} viewBox="0 0 100 100">
                                        <path d="M53.564 38.947 87.066 0h-7.941L50.033 33.816 26.801 0H0l35.136 51.137L0 91.977h7.941l30.722 -35.712 24.54 35.712H90L53.561 38.947zM42.686 51.588l-3.56 -5.093L10.8 5.977h12.194l22.86 32.699 3.56 5.093 29.714 42.503H66.935L42.686 51.591z" />
                                    </svg>
                                </a>
                                <div className={`${styles.doodleTooltip} ${styles.tooltipTw}`}>X</div>
                            </li>
                            <li className={styles.doodleIconContent}>
                                <Link href="/contacto" aria-label="Contacto" className={`${styles.doodleLink} ${styles.linkMail}`}>
                                    <svg className={styles.doodleSvg} viewBox="0 0 100 100">
                                        <path d="M20 80A12 12 0 0 1 8 68v-40A12 12 0 0 1 20 16h56A12 12 0 0 1 88 28v40A12 12 0 0 1 76 80zm10.5 -47.12a4 4 0 1 0 -5.001 6.24l15.001 12.004a12 12 0 0 0 15.001 0l15.001 -12a4 4 0 1 0 -5.001 -6.247l-15.001 12a4 4 0 0 1 -5.001 0z" />
                                    </svg>
                                </Link>
                                <div className={`${styles.doodleTooltip} ${styles.tooltipMail}`}>Mail</div>
                            </li>
                        </ul>
                    </motion.div>

                    {/* Avisos de secciones que aún no abren. Viven aquí (debajo
                        de las redes, separados) en vez de ocupar lugar en la
                        barra: no son navegables todavía. */}
                    <motion.div className={styles.avisos} variants={fadeUp} custom={6}>
                        {PROXIMAMENTE.map((a) => (
                            <div key={a.titulo} className={styles.avisoCard} style={{ '--aviso-color': a.color }}>
                                <span className={styles.avisoIcon} aria-hidden="true">{a.emoji}</span>
                                <span className={styles.avisoTexto}>
                                    <span className={styles.avisoTitulo}>{a.titulo}</span>
                                    <span className={styles.avisoDesc}>{a.desc}</span>
                                </span>
                                <span className={styles.avisoBadge}>{a.badge}</span>
                            </div>
                        ))}
                    </motion.div>
                </motion.div>

                <span className={`${styles.sfx} ${styles.sfxLeft}`} aria-hidden="true">¡ZAS!</span>
                <span className={`${styles.sfx} ${styles.sfxRight}`} aria-hidden="true">DOKI<br />DOKI</span>
            </section>

            {/* NUESTRAS CATEGORÍAS */}
            <div className={styles.seeThrough}>
                <Categories />
            </div>

            {/* LA NETA — historia */}
            <section className={styles.story}>
                <motion.div
                    className={styles.polaroid}
                    initial={{ opacity: 0, rotate: -8, y: 40 }}
                    whileInView={{ opacity: 1, rotate: -3, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 14 }}
                >
                    <span className={styles.tape} aria-hidden="true" />
                    <VideoCarousel />
                    <span className={styles.polaroidCaption}>Presentes en las convenciones🔥</span>
                </motion.div>

                <motion.div
                    className={styles.storyText}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.3 }}
                >
                    <motion.h2 variants={fadeUp} custom={0}>
                        La neta<span className={styles.dot}>.</span>
                    </motion.h2>
                    <motion.p variants={fadeUp} custom={1}>
                        Un día dijimos: <em>“¿por qué el manga que queremos nunca llega a México?”</em>{' '}
                        Y en vez de quejarnos en internet, lo empezamos a traer nosotros.
                    </motion.p>
                    <motion.p variants={fadeUp} custom={2}>
                        Sin inversionistas, sin oficina con futbolito. Solo una bodega que cada vez
                        huele más a tinta japonesa y una obsesión por conseguir las ediciones
                        que nadie más trae.
                    </motion.p>
                    <motion.p className={styles.storyHand} variants={fadeUp} custom={3}>
                        — el equipo Bisonte ✌️
                    </motion.p>
                </motion.div>
            </section>

            {/* STATS estilo graffiti */}
            <section className={styles.statsRow}>
                {stats.map((s, i) => (
                    <motion.div
                        key={i}
                        className={styles.statBlock}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.4 }}
                        variants={pop}
                        custom={i}
                    >
                        <span className={styles.statValue}>{s.value}</span>
                        <span className={styles.statLabel}>{s.label}</span>
                        <span className={styles.statNote}>{s.note}</span>
                    </motion.div>
                ))}
            </section>

            {/* NOVEDADES */}
            <div className={styles.seeThrough}>
                <ProductGrid />
            </div>

            {/* STICKERS — por qué con nosotros */}
            <section className={styles.stickerWall}>
                <motion.h2
                    className={styles.wallTitle}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                >
                    ¿POR QUÉ COMPRARNOS A NOSOTROS?
                </motion.h2>
                <motion.span
                    className={styles.wallSub}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                >
                    (te damos 4 razones, sin choro corporativo)
                </motion.span>

                <div className={styles.stickerGrid}>
                    {stickers.map((s, i) => (
                        <motion.article
                            key={i}
                            className={styles.stickerCard}
                            style={{ '--rot': `${s.rotate}deg` }}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, amount: 0.3 }}
                            variants={pop}
                            custom={i}
                            whileHover={{ rotate: 0, scale: 1.04, zIndex: 5 }}
                        >
                            <span className={styles.stickerEmoji}>{s.emoji}</span>
                            <h3>{s.title}</h3>
                            <p>{s.desc}</p>
                        </motion.article>
                    ))}
                </div>
            </section>

            {/* CTA bocadillo manga */}
            <section className={styles.ctaSection}>
                <motion.div
                    className={styles.speechBubble}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                    <p>¿Sigues leyendo esto en vez de estar viendo el catálogo?</p>
                    <Link href="/mangas" className={styles.ctaButton}>
                        LLÉVAME AL MANGA →
                    </Link>
                </motion.div>
            </section>

            {/* Marquee inferior invertido */}
            <div className={`${styles.marqueeStrip} ${styles.marqueeBottom}`}>
                <div className={`${styles.marqueeTrack} ${styles.marqueeReverse}`}>
                    <span>{marqueeText.repeat(6)}</span>
                </div>
            </div>
        </div>
    );
}
