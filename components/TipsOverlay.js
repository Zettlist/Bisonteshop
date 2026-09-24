'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './TipsOverlay.module.css';

// Solo consejos que la tienda cumple hoy. Se quitaron cinco que prometían cosas
// que no existen: preventas, envío gratis arriba de $500, lista de deseos, 10%
// de descuento por registrarse y una sección de Novedades que da error. Las dos
// de dinero eran las graves -- una oferta publicada obliga a quien la publica, y
// el primer cliente que pidiera su envío gratis tendría razón. Cuando alguna
// exista de verdad, se vuelve a poner aquí.
const TIPS = [
    '🔔 Activa las notificaciones y sé el primero en saber de nuevos mangas.',
    '📚 Los box sets suelen tener mejor precio que comprar los tomos por separado.',
    '🔞 La sección Adultos requiere verificación de edad al momento de comprar.',
    '🖊️ Las ediciones especiales en tapa dura aumentan su valor con el tiempo.',
    '🛒 Puedes combinar varios artículos en un mismo pedido para ahorrar en envío.',
];

export default function TipsOverlay() {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setIndex((i) => (i + 1) % TIPS.length);
        }, 4500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className={styles.overlay}>
            {/* Logo centrado */}
            <div className={styles.logoArea}>
                <motion.div
                    className={styles.logoBadge}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                >
                    <Image
                        src="/logo.png"
                        alt="Bisonte Manga"
                        width={280}
                        height={140}
                        style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 24px rgba(230,57,70,0.5))' }}
                        priority
                    />
                </motion.div>
            </div>

            {/* Tips de carga */}
            <div className={styles.tipsArea}>
                <p className={styles.tipsLabel}>— CONSEJO —</p>
                <div className={styles.tipsBox}>
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={index}
                            className={styles.tipText}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.5, ease: 'easeInOut' }}
                        >
                            {TIPS[index]}
                        </motion.p>
                    </AnimatePresence>
                </div>

                {/* Indicadores */}
                <div className={styles.dots}>
                    {TIPS.map((_, i) => (
                        <button
                            key={i}
                            className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                            onClick={() => setIndex(i)}
                            aria-label={`Consejo ${i + 1}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
