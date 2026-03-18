import styles from '../CommonProfile.module.css';

export const metadata = { title: 'Crédito de Tienda | Bisonte Manga' };

export default function Credito() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Crédito de Tienda</h1>
                <p className={styles.subtitle}>Gestiona tu saldo a favor para futuras compras.</p>
            </div>

            <div className={styles.card} style={{ textAlign: 'center' }}>
                <div className={styles.amountLabel}>Saldo Disponible</div>
                <div className={`${styles.amount} ${styles.positive}`}>$0.00</div>
            </div>

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>Historial de Movimientos</h2>
                <div className={styles.emptyState}>
                    <p>No tienes movimientos de crédito registrados.</p>
                </div>
            </div>
        </div>
    );
}
