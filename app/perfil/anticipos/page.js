import styles from '../CommonProfile.module.css';

export const metadata = { title: 'Anticipos | Bisonte Manga' };

export default function Anticipos() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Anticipos y Comprobantes</h1>
                <p className={styles.subtitle}>Registro de pagos parciales realizados por pedido.</p>
            </div>

            <div className={styles.card}>
                <div className={styles.emptyState}>
                    <p>No tienes comprobantes de anticipos recientes.</p>
                </div>
            </div>
        </div>
    );
}
