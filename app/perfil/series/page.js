import styles from '../CommonProfile.module.css';

export const metadata = { title: 'Series que Sigo | Bisonte Manga' };

export default function Series() {
    return (
        <div className={styles.container}>
            <h1 className="sr-only">Series que sigo</h1>

            <div className={styles.card}>
                <div className={styles.emptyState}>
                    <p>Aún no sigues ninguna serie. ¡Explora la tienda y añade tus favoritas!</p>
                </div>
            </div>
        </div>
    );
}
