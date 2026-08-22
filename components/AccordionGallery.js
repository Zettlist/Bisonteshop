'use client';

/**
 * Galeria en acordeon horizontal.
 *
 * Un panel abierto ocupa `expandRatio` del ancho y el resto se reparte entre
 * los demas. `trigger` decide si eso pasa al pasar el mouse o al hacer clic;
 * en touch el hover no existe, asi que ahi siempre manda el clic (el primer
 * toque abre, el segundo activa).
 */

import { useState, useEffect, useRef } from 'react';
import styles from './AccordionGallery.module.css';

export default function AccordionGallery({
    items = [],
    defaultIndex = 0,
    expandRatio = 0.52,
    trigger = 'hover',
    onSelect,
    renderMeta,
}) {
    const n = items.length;
    const [abierto, setAbierto] = useState(Math.min(defaultIndex, Math.max(0, n - 1)));
    const [esTouch, setEsTouch] = useState(false);
    const refContenedor = useRef(null);

    useEffect(() => {
        setEsTouch(window.matchMedia('(hover: none)').matches);
    }, []);

    useEffect(() => {
        setAbierto((i) => (n ? Math.min(i, n - 1) : 0));
    }, [n]);

    if (!n) return null;

    const porHover = trigger === 'hover' && !esTouch;
    const anchoAbierto = n > 1 ? expandRatio * 100 : 100;
    const anchoCerrado = n > 1 ? ((1 - expandRatio) * 100) / (n - 1) : 0;

    const activar = (i, item) => {
        // En touch (o con trigger="click") el primer toque abre el panel y
        // solo el segundo dispara la accion: si no, abrir seria imposible.
        if (i !== abierto) { setAbierto(i); if (porHover) onSelect?.(item); return; }
        onSelect?.(item);
    };

    return (
        <div className={styles.galeria} ref={refContenedor}>
            {items.map((item, i) => {
                const activo = i === abierto;
                return (
                    <button
                        key={item.id ?? i}
                        type="button"
                        className={`${styles.panel} ${activo ? styles.panelAbierto : ''}`}
                        style={{ flexBasis: `${activo ? anchoAbierto : anchoCerrado}%` }}
                        onMouseEnter={porHover ? () => setAbierto(i) : undefined}
                        onFocus={() => setAbierto(i)}
                        onClick={() => activar(i, item)}
                        aria-expanded={activo}
                        aria-label={item.label || item.title}
                    >
                        {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={item.image}
                                alt={item.label || item.title || ''}
                                className={styles.imagen}
                                loading="lazy"
                                decoding="async"
                            />
                        ) : (
                            <span className={styles.sinImagen}>📚</span>
                        )}

                        <span className={styles.velo} aria-hidden="true" />

                        {/* Cerrado: etiqueta girada en el costado. Abierto: la
                            ficha completa abajo. */}
                        <span className={styles.etiquetaVertical} aria-hidden="true">
                            {item.label || item.title}
                        </span>

                        <span className={styles.ficha}>
                            <span className={styles.fichaTitulo}>{item.label || item.title}</span>
                            {renderMeta && <span className={styles.fichaMeta}>{renderMeta(item)}</span>}
                        </span>

                        {item.badge && <span className={styles.medalla}>{item.badge}</span>}
                    </button>
                );
            })}
        </div>
    );
}
