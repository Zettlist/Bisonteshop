import styles from '../CommonProfile.module.css';

export const metadata = { title: 'Anticipos | Bisonte Manga' };

export default function Anticipos() {
    return (
        <div className={styles.container}>
            <h1 className="sr-only">Anticipos y comprobantes</h1>

            <div className={styles.card}>
                <div className={styles.emptyState}>
                    <p>No tienes comprobantes de anticipos recientes.</p>
                </div>
            </div>
        </div>
    );
}
