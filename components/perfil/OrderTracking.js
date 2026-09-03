'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import styles from './OrderTracking.module.css';

// Recorrido vertical del pedido: mismo par (pasos, indice) que BarraProgreso,
// pero en lista — se usa donde hay espacio para mostrar cuándo fue la última
// actualización de cada paso, no solo la etiqueta.
//
// No hay timestamp por paso en la base (solo la fecha de creación del
// pedido), así que `actualizado` se muestra nomás en el paso actual — es lo
// único que sabemos con certeza.
export default function OrderTracking({ pasos, indice, tono = 'normal', actualizado, className = '' }) {
    if (!pasos?.length) {
        return <p className={styles.vacio}>Este pedido no tiene información de rastreo.</p>;
    }

    return (
        <div className={`${styles.tracking} ${tono === 'reclamo' ? styles.reclamo : ''} ${className}`}>
            {pasos.map((paso, i) => {
                const hecho = i <= indice;
                return (
                    <div key={paso.key} className={styles.paso}>
                        <div className={styles.iconoCol}>
                            {hecho
                                ? <CheckCircle2 size={20} className={styles.iconoHecho} />
                                : <Circle size={20} className={styles.iconoPendiente} />}
                            {i < pasos.length - 1 && (
                                <div className={`${styles.linea} ${i < indice ? styles.lineaHecha : ''}`} />
                            )}
                        </div>
                        <div className={styles.contenido}>
                            <p className={`${styles.nombre} ${i === indice ? styles.nombreActual : ''}`}>
                                {paso.label}
                            </p>
                            {i === indice && actualizado && (
                                <p className={styles.fecha}>{actualizado}</p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
