'use client';

import { Star } from 'lucide-react';
import styles from './RatingStars.module.css';

/**
 * Calificacion en estrellas con relleno parcial.
 *
 * Se pinta dos veces la misma fila y la de arriba se recorta al porcentaje
 * exacto: asi un 4.5 muestra media estrella de verdad, no una redondeada. El
 * recorte es un ancho en %, no un icono "media estrella", para que sirva
 * igual con 4.2 o 3.8 cuando las opiniones sean reales.
 *
 * Sin `valor` no devuelve nada: un producto sin calificar no debe mostrar
 * cinco estrellas vacias, que se leen como "malo" en vez de "sin opiniones".
 */
export default function RatingStars({ valor, total = 0, size = 16, className = '' }) {
    const nota = Number(valor);
    if (!Number.isFinite(nota) || nota <= 0) return null;

    const acotado = Math.min(5, Math.max(0, nota));
    const porcentaje = (acotado / 5) * 100;

    const fila = (relleno) => (
        <span className={styles.fila} aria-hidden="true">
            {[0, 1, 2, 3, 4].map(i => (
                <Star
                    key={i}
                    size={size}
                    strokeWidth={1.5}
                    fill={relleno ? 'currentColor' : 'none'}
                />
            ))}
        </span>
    );

    return (
        <span
            className={`${styles.wrap} ${className}`}
            role="img"
            aria-label={`${acotado.toFixed(1)} de 5${total > 0 ? `, ${total} opiniones` : ''}`}
        >
            <span className={styles.estrellas} style={{ '--size': `${size}px` }}>
                <span className={styles.base}>{fila(false)}</span>
                <span className={styles.relleno} style={{ width: `${porcentaje}%` }}>
                    {fila(true)}
                </span>
            </span>
            <span className={styles.nota}>{acotado.toFixed(1)}</span>
            {total > 0 && <span className={styles.total}>({total})</span>}
        </span>
    );
}
