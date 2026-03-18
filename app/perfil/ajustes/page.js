import styles from '../CommonProfile.module.css';

export const metadata = { title: 'Ajustes | Bisonte Manga' };

export default function Ajustes() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Ajustes</h1>
                <p className={styles.subtitle}>Configuración de contacto y preferencias.</p>
            </div>

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>Datos de Contacto</h2>
                <div className={styles.emptyState}>
                    <p>Formulario de contacto en construcción (Fase 1).</p>
                </div>
            </div>
        </div>
    );
}
