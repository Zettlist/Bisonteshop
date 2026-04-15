'use client';

import styles from './AnnouncementBar.module.css';

const MESSAGES = [
    'ENVÍO GRATIS EN COMPRAS MAYORES A $999',
    'NUEVOS TÍTULOS CADA SEMANA',
    'PREVENTAS DISPONIBLES',
    'MANGA IMPORTADO',
    'FIGURAS DE COLECCIÓN OFICIALES',
    'ENVÍO GRATIS EN COMPRAS MAYORES A $999',
    'NUEVOS TÍTULOS CADA SEMANA',
    'PREVENTAS DISPONIBLES',
    'MANGA IMPORTADO',
    'FIGURAS DE COLECCIÓN OFICIALES',
];

export default function AnnouncementBar() {
    return (
        <div className={styles.bar}>
            <div className={styles.tickerWrapper}>
                <div className={styles.ticker}>
                    {MESSAGES.map((msg, i) => (
                        <span key={i} className={styles.item}>
                            <span className={styles.dot} />
                            {msg}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
