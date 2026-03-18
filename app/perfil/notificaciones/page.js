import styles from '../CommonProfile.module.css';

export const metadata = { title: 'Notificaciones | Bisonte Manga' };

export default function Notificaciones() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Notificaciones</h1>
                <p className={styles.subtitle}>Centro de alertas y control de preferencias.</p>
            </div>

            <div className={styles.card}>
                <div className={styles.emptyState}>
                    <p>No tienes notificaciones nuevas.</p>
                </div>
            </div>
        </div>
    );
}
