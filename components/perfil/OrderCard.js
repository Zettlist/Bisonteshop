import styles from './OrderCard.module.css';

const STATUS_MAP = {
    'produccion': { label: 'En Producción', class: styles.status_produccion },
    'transito': { label: 'En Tránsito', class: styles.status_transito },
    'listo': { label: 'Listo para Recoger', class: styles.status_listo },
    'entregado': { label: 'Entregado', class: styles.status_entregado },
};

export default function OrderCard({ order, isHistory }) {
    const statusConfig = STATUS_MAP[order.status] || STATUS_MAP['produccion'];

    // Format currency
    const formatMoney = (amount) => `$${amount.toFixed(2)}`;

    const paid = order.payments.reduce((acc, p) => acc + p.amount, 0);
    const debt = order.total - paid;

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <div>
                    <div className={styles.orderId}>Ped. #{order.id}</div>
                    <div className={styles.date}>{new Date(order.date).toLocaleDateString()}</div>
                </div>
                <div className={`${styles.statusBadge} ${statusConfig.class}`}>
                    {statusConfig.label}
                </div>
            </div>

            <div className={styles.body}>
                <div className={styles.imageContainer}>
                    <img
                        src={order.image || '/bisonte-mural.webp'}
                        alt={order.itemName}
                        className={styles.image}
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/80x110?text=No+Img' }}
                    />
                </div>

                <div className={styles.details}>
                    <div className={styles.itemName}>{order.itemName}</div>
                    <div className={styles.itemDesc}>{order.itemsCount} artículo(s) • {order.type}</div>

                    <div className={styles.paymentBreakdown}>
                        <div className={styles.paymentRow}>
                            <span>Total del pedido:</span>
                            <span>{formatMoney(order.total)}</span>
                        </div>
                        <div className={styles.paymentRow}>
                            <span>Total pagado (Anticipos):</span>
                            <span>{formatMoney(paid)}</span>
                        </div>
                        {debt > 0 && (
                            <div className={`${styles.paymentRow} ${styles.debt}`}>
                                <span>Saldo pendiente:</span>
                                <span>{formatMoney(debt)}</span>
                            </div>
                        )}
                        {debt === 0 && (
                            <div className={`${styles.paymentRow} ${styles.total}`}>
                                <span>¡Liquidado!</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className={styles.footer}>
                {!isHistory && debt > 0 && (
                    <button className={styles.btnPrimary}>Abonar Saldo</button>
                )}
                {isHistory && (
                    <button className={styles.btnPrimary}>Volver a pedir</button>
                )}
                <button className={styles.btnSecondary}>Ver Detalles</button>
            </div>
        </div>
    );
}
