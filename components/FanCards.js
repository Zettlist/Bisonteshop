'use client';

/**
 * Abanico de portadas para "Novedades".
 *
 * Port del SocialCards original (TypeScript + Tailwind + GSAP) a lo que ya
 * usa este proyecto: JS, CSS Modules y framer-motion. La matematica del
 * abanico —posiciones, escalas, multiplicadores responsivos y el empuje al
 * pasar el mouse— es la misma; lo que cambia es que en vez de animar los
 * nodos a mano con gsap.to() se declara el destino y framer-motion resuelve
 * el resorte. Eso evita meter una dependencia nueva y quita el trabajo de
 * limpiar listeners.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import styles from './FanCards.module.css';

const MAX_VISIBLE = 7;
const HALF = 3;

// rot en grados, x/y en rem, sobre la carta central (indice 3).
const FAN_POSITIONS = [
    { rot: -21, scale: 0.7756, x: -30, y: 7.3, zIndex: 1 },
    { rot: -14, scale: 0.8498, x: -22, y: 4.0, zIndex: 2 },
    { rot: -7, scale: 0.9346, x: -11, y: 1.3, zIndex: 3 },
    { rot: 0, scale: 1.0, x: 0, y: 0.0, zIndex: 10 },
    { rot: 7, scale: 0.9346, x: 11, y: 1.3, zIndex: 3 },
    { rot: 14, scale: 0.8498, x: 22, y: 4.0, zIndex: 2 },
    { rot: 21, scale: 0.7756, x: 30, y: 7.3, zIndex: 1 },
];

// Cuanto se cierra el abanico en horizontal segun el ancho de pantalla.
function multAncho(w) {
    if (w < 480) return 0.28;
    if (w < 640) return 0.38;
    if (w < 768) return 0.5;
    if (w < 1024) return 0.75;
    return 1.0;
}

// Y cuanto se aplasta en vertical cuando la ventana es mas baja que el
// alto ideal del bloque: sin esto el abanico se sale de la pantalla en
// laptops chicas u horizontal de celular.
function multAlto(w, h) {
    let ideal;
    if (w < 480) ideal = 22 * 16;
    else if (w < 640) ideal = 26 * 16;
    else if (w < 768) ideal = 28 * 16;
    else if (w < 1024) ideal = 34 * 16;
    else ideal = 38 * 16;

    const disponible = h * 0.7;
    return disponible >= ideal ? 1 : disponible / ideal;
}

// Con menos de 7 cartas el abanico se calcula en vez de leerse de la tabla,
// para que siempre quede simetrico alrededor del centro.
function slotConfig(total, slot) {
    if (total >= MAX_VISIBLE) return FAN_POSITIONS[slot];
    const centro = total >> 1;
    const dist = total > 1 ? (slot - centro) / centro : 0;
    const abs = Math.abs(dist);
    return {
        rot: dist * 21,
        scale: 1.0 - 0.2244 * abs * abs,
        x: dist * 30,
        y: abs * abs * 7.3,
        zIndex: 10 - Math.abs(slot - centro),
    };
}

const RESORTE = { type: 'spring', stiffness: 210, damping: 22, mass: 0.9 };

export default function FanCards({ items = [], onSelect }) {
    const { formatPrice } = useCurrency();

    const total = items.length;
    const hayPaginacion = total > MAX_VISIBLE;

    const [centro, setCentro] = useState(hayPaginacion ? HALF : total >> 1);
    const [dir, setDir] = useState('right');
    const [hover, setHover] = useState(null);
    const [medidas, setMedidas] = useState({ w: 1280, h: 800, rem: 16 });

    // El abanico depende del viewport, y en SSR no hay window: se mide al
    // montar y en cada resize. El rem se lee del documento porque las
    // posiciones de la tabla estan en rem pero se animan en px: framer-motion
    // no sabe interpolar entre unidades distintas, asi que se convierten aqui.
    useEffect(() => {
        const medir = () => setMedidas({
            w: window.innerWidth,
            h: window.innerHeight,
            rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
        });
        medir();
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, []);

    // Si la lista cambia de tamano, el centro viejo puede quedar fuera de rango.
    useEffect(() => {
        setCentro((c) => (total ? Math.min(c, total - 1) : 0));
    }, [total]);

    const rem = medidas.rem;
    const mAncho = multAncho(medidas.w);
    const mAlto = multAlto(medidas.w, medidas.h);
    const nSlots = hayPaginacion ? MAX_VISIBLE : total;
    const slotCentral = nSlots >> 1;

    // indice de producto -> slot del abanico
    const mapaVisible = useMemo(() => {
        const m = new Map();
        if (!hayPaginacion) {
            items.forEach((_, i) => m.set(i, i));
            return m;
        }
        for (let slot = 0; slot < MAX_VISIBLE; slot++) {
            m.set((((centro + slot - HALF) % total) + total) % total, slot);
        }
        return m;
    }, [items, centro, total, hayPaginacion]);

    const girar = useCallback((hacia) => {
        if (!hayPaginacion) return;
        setDir(hacia);
        setHover(null);
        setCentro((prev) => (hacia === 'right' ? (prev + 1) % total : (prev - 1 + total) % total));
    }, [hayPaginacion, total]);

    if (!total) return null;

    // Destino de una carta visible, ya con el empuje del hover aplicado.
    const destino = (slot) => {
        const base = slotConfig(nSlots, slot);
        let x = base.x * mAncho;
        let y = base.y * mAlto;
        let rot = base.rot;
        let scale = base.scale;

        if (hover !== null) {
            const dist = Math.abs(slot - hover);
            if (slot === hover) {
                y -= 2.5 * mAlto;
                scale *= 1.08;
            } else {
                const norm = slotCentral > 0 ? (slot - slotCentral) / slotCentral : 0;
                const empuje = 8 * (1 - Math.abs(norm)) * (1 + 0.2 * Math.max(0, 3 - dist));
                if (slot < hover) {
                    x -= empuje * mAncho;
                    rot -= 3 / (dist + 1);
                } else {
                    x += empuje * mAncho;
                    rot += 3 / (dist + 1);
                }
                // Las puntas suben un poco para no quedar aplastadas contra
                // el borde cuando el hover esta del lado contrario.
                if (slot === nSlots - 1 && hover < slotCentral) y -= 1 * mAlto;
                if (slot === 0 && hover > slotCentral) y -= 1 * mAlto;
            }
        }

        return { x: x * rem, y: y * rem, rotate: rot, scale, opacity: 1, zIndex: base.zIndex };
    };

    const salida = () => ({
        x: (dir === 'right' ? -40 : 40) * rem,
        y: 0,
        rotate: dir === 'right' ? -30 : 30,
        scale: 0.5,
        opacity: 0,
        zIndex: 0,
    });

    const destacado = hover !== null
        ? [...mapaVisible.entries()].find(([, s]) => s === hover)?.[0]
        : centro;

    return (
        <div className={styles.envoltura}>
            <div
                className={styles.abanico}
                onMouseLeave={() => setHover(null)}
            >
                {items.map((p, i) => {
                    const slot = mapaVisible.get(i);
                    const visible = slot !== undefined;
                    const esFoco = i === destacado;

                    return (
                        <motion.button
                            key={p.id ?? i}
                            type="button"
                            className={styles.carta}
                            initial={{ x: 0, y: 12 * mAlto * rem, rotate: 0, scale: 0.5, opacity: 0 }}
                            animate={visible ? destino(slot) : salida()}
                            transition={RESORTE}
                            style={{ pointerEvents: visible ? 'auto' : 'none' }}
                            onMouseEnter={() => visible && setHover(slot)}
                            onClick={() => visible && onSelect?.(p)}
                            aria-hidden={!visible}
                            tabIndex={visible ? 0 : -1}
                            aria-label={p.title}
                        >
                            {p.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.image_url} alt={p.title || 'Portada'} loading="lazy" decoding="async" />
                            ) : (
                                <span className={styles.sinPortada}>📚</span>
                            )}

                            {p.stock <= 0 && <span className={styles.agotado}>Agotado</span>}

                            {/* La ficha solo se pinta en la carta al frente: en
                                las giradas el texto queda ilegible. */}
                            <span className={`${styles.ficha} ${esFoco ? styles.fichaVisible : ''}`}>
                                <span className={styles.fichaTitulo}>{p.title}</span>
                                <span className={styles.fichaPrecio}>{formatPrice(p.price)}</span>
                            </span>
                        </motion.button>
                    );
                })}
            </div>

            {hayPaginacion && (
                <div className={styles.controles}>
                    <button className={styles.flecha} onClick={() => girar('left')} aria-label="Anterior">
                        <ChevronLeft size={20} />
                    </button>
                    <div className={styles.puntos}>
                        {items.map((p, i) => (
                            <button
                                key={p.id ?? i}
                                className={`${styles.punto} ${i === centro ? styles.puntoActivo : ''}`}
                                onClick={() => { setDir(i > centro ? 'right' : 'left'); setHover(null); setCentro(i); }}
                                aria-label={`Ir a ${p.title || `portada ${i + 1}`}`}
                            />
                        ))}
                    </div>
                    <button className={styles.flecha} onClick={() => girar('right')} aria-label="Siguiente">
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}
