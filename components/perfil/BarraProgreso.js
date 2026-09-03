'use client';

import { Check } from 'lucide-react';
import styles from './BarraProgreso.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Barra de progreso horizontal del pedido: circulos numerados unidos por una
// linea, con la etiqueta del paso debajo.
//
// Cada paso ocupa una celda igual y lleva medio tramo de linea a cada lado; los
// tramos de las puntas van invisibles para que el circulo quede centrado en su
// celda y la etiqueta debajo de el.
//
// La linea se pinta en dos capas — riel apagado y relleno encima con
// `transform: scaleX` — para que el avance se anime en vez de saltar.
//
// `tono="reclamo"` cambia el acento a ambar: es el mismo recorrido, pero el
// pedido dejo de ir hacia adelante y esta en revision.
// ─────────────────────────────────────────────────────────────────────────────

function Tramo({ lleno, oculto }) {
    return (
        <span className={`${styles.riel} ${oculto ? styles.rielVacio : ''}`} aria-hidden="true">
            <span className={styles.relleno} style={{ transform: `scaleX(${lleno ? 1 : 0})` }} />
        </span>
    );
}

export default function BarraProgreso({ pasos, indice, tono = 'normal', className = '' }) {
    const ultimo = pasos.length - 1;

    return (
        <div
            className={`${styles.barra} ${tono === 'reclamo' ? styles.reclamo : ''} ${className}`}
            role="list"
            aria-label="Progreso del pedido"
        >
            {pasos.map((paso, i) => {
                const hecho  = i < indice;
                const actual = i === indice;
                const estado = hecho ? styles.hecho : actual ? styles.actual : styles.pendiente;

                return (
                    <div
                        key={paso.key}
                        className={styles.paso}
                        role="listitem"
                        aria-current={actual ? 'step' : undefined}
                    >
                        <div className={styles.fila}>
                            <Tramo oculto={i === 0} lleno={i <= indice} />
                            <span className={`${styles.circulo} ${estado}`}>
                                {hecho ? <Check size={13} strokeWidth={3} /> : i + 1}
                            </span>
                            <Tramo oculto={i === ultimo} lleno={i < indice} />
                        </div>

                        <span className={`${styles.etiqueta} ${actual ? styles.etiquetaActual : ''}`}>
                            {paso.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
