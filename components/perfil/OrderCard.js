'use client';

import styles from './OrderCard.module.css';

const STATUS_MAP = {
    verificando: { label: 'Verificando existencias', class: styles.status_verificando },
    preparando:  { label: 'Preparando',              class: styles.status_preparando  },
    transito:    { label: 'En Tránsito',             class: styles.status_transito    },
    entregado:   { label: 'Entregado',               class: styles.status_entregado   },
    cancelado:   { label: 'Cancelado',               class: styles.status_cancelado   },
    produccion:  { label: 'En Producción',           class: styles.status_produccion  },
};

export default function OrderCard({ order, isHistory, onOpenDetail }) {
    const statusConfig = STATUS_MAP[order.status] || STATUS_MAP['verificando'];
    const fmt  = (n) => `$${Number(n || 0).toFixed(2)}`;
    const paid = order.payments.reduce((acc, p) => acc + p.amount, 0);
    const debt = order.total - paid;

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <div>
                    <div className={styles.orderId}>Ped. #{order.id}</div>
                    <div className={styles.date}>{new Date(order.date).toLocaleDateString('es-MX')}</div>
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
                        onError={e => { e.target.src = '/bisonte-mural.webp'; }}
                    />
                </div>
                <div className={styles.details}>
                    <div className={styles.itemName}>{order.itemName}</div>
                    <div className={styles.itemDesc}>{order.itemsCount} artículo(s) • {order.type}</div>
                    <div className={styles.paymentBreakdown}>
                        <div className={styles.paymentRow}>
                            <span>Total del pedido:</span><span>{fmt(order.total)}</span>
                        </div>
                        <div className={styles.paymentRow}>
                            <span>Total pagado:</span><span>{fmt(paid)}</span>
                        </div>
                        {debt > 0 ? (
                            <div className={`${styles.paymentRow} ${styles.debt}`}>
                                <span>Saldo pendiente:</span><span>{fmt(debt)}</span>
                            </div>
                        ) : (
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
                <button className={styles.btnSecondary} onClick={onOpenDetail}>
                    Ver Detalles
                </button>
            </div>
        </div>
    );
}
