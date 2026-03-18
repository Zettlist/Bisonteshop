import styles from '../CommonProfile.module.css';

export const metadata = { title: 'Series que Sigo | Bisonte Manga' };

export default function Series() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Series que Sigo</h1>
                <p className={styles.subtitle}>Gestiona las franquicias a las que estás suscrito.</p>
            </div>

            <div className={styles.card}>
                <div className={styles.emptyState}>
                    <p>Aún no sigues ninguna serie. ¡Explora la tienda y añade tus favoritas!</p>
                </div>
            </div>
        </div>
    );
}
