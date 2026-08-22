'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSplash } from '@/context/SplashContext';
import styles from './SplashScreen.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Pantalla de carga del landing.
//
// El hero trae fondo pesado, logo, videos y productos: si se muestra mientras
// baja, se ve armarse por partes. Esta pantalla tapa ese armado y no se quita
// hasta que la ventana termino de cargar; recien ahi el contenido corre su
// animacion de entrada (el landing espera `listo` del SplashContext).
//
// Se monta en el layout raiz, fuera de app/template.js: ese template envuelve
// cada pagina en un fade desde opacity 0, y adentro el splash aparecia DESPUES
// de la barra de navegacion en vez de taparla desde el primer frame.
//
// Reglas de tiempo:
//   MIN_MS  — aunque cargue instantaneo, se queda un momento: un parpadeo de
//             splash se ve peor que no tenerlo.
//   MAX_MS  — tope duro. Si un asset se cuelga, igual se abre.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_MS = 900;
const MAX_MS = 6000;

export default function SplashScreen() {
    const { visible, esAdultos, marcarListo } = useSplash();
    const [pct, setPct] = useState(0);
    const cerrado = useRef(false);

    const marca = esAdultos ? 'BISONTE HENTAI' : 'BISONTE MANGA';
    const logo = esAdultos ? '/logo-hentai-sm.webp' : '/logo.png';

    useEffect(() => {
        if (!visible || cerrado.current) return;

        const t0 = Date.now();
        let pedido = false;

        // Progreso: sube solo acercandose al 90% y el resto lo completa la
        // carga real. Da sensacion de avance sin mentir con el 100%.
        const tick = setInterval(() => {
            setPct((p) => (p >= 90 ? p : p + Math.max(0.6, (90 - p) * 0.08)));
        }, 90);

        const terminar = () => {
            if (cerrado.current) return;
            cerrado.current = true;
            setPct(100);
            marcarListo();
        };

        const cerrar = () => {
            if (pedido) return;
            pedido = true;
            setTimeout(terminar, Math.max(0, MIN_MS - (Date.now() - t0)));
        };

        if (document.readyState === 'complete') cerrar();
        else window.addEventListener('load', cerrar, { once: true });

        const tope = setTimeout(cerrar, MAX_MS);

        return () => {
            clearInterval(tick);
            clearTimeout(tope);
            window.removeEventListener('load', cerrar);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    // Sin scroll mientras tapa: si no, se puede "scrollear a ciegas".
    useEffect(() => {
        if (!visible) return;
        const previo = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previo; };
    }, [visible]);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    className={`${styles.splash} ${esAdultos ? styles.splashAdultos : ''}`}
                    initial={{ opacity: 1 }}
                    // pointerEvents en la salida: si la pestaña esta en segundo
                    // plano el rAF se pausa y el fade puede quedar a medias; asi
                    // el splash nunca bloquea clics aunque siga en el DOM.
                    exit={{ opacity: 0, scale: 1.04, pointerEvents: 'none', transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } }}
                >
                    <div className={styles.centro}>
                        <motion.img
                            src={logo}
                            alt=""
                            className={styles.logo}
                            initial={{ opacity: 0, scale: 0.75 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                        />

                        <div className={styles.marca} aria-label={marca}>
                            {marca.split('').map((c, i) => (
                                <motion.span
                                    key={i}
                                    initial={{ opacity: 0, y: 14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.15 + i * 0.035, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    {c === ' ' ? ' ' : c}
                                </motion.span>
                            ))}
                        </div>

                        <div className={styles.barra}>
                            <motion.div
                                className={styles.barraFill}
                                animate={{ width: `${pct}%` }}
                                transition={{ ease: 'easeOut', duration: 0.35 }}
                            />
                        </div>

                        <span className={styles.nota}>desempacando el pedido…</span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
