'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './TipsOverlay.module.css';

const TIPS = [
    '💡 Revisa las Preventas para conseguir ediciones exclusivas antes de que se agoten.',
    '📦 Los pedidos de más de $500 MXN tienen envío gratis a toda la república.',
    '🔔 Activa las notificaciones y sé el primero en saber de nuevos mangas.',
    '⭐ Guarda tus favoritos en tu lista de deseos y nunca pierdas nada.',
    '🎁 Regístrate hoy y obtén un 10% de descuento en tu primera compra.',
    '📚 Los box sets suelen tener mejor precio que comprar los tomos por separado.',
    '🔞 La sección Adultos requiere verificación de edad al momento de comprar.',
    '🖊️ Las ediciones especiales en tapa dura aumentan su valor con el tiempo.',
    '🛒 Puedes combinar varios artículos en un mismo pedido para ahorrar en envío.',
    '🔄 Revisa la sección Novedades cada semana — se actualiza cada lunes.',
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
