'use client';

import { useState, useEffect } from 'react';
import styles from '../CommonProfile.module.css';
import cStyles from './Credito.module.css';

function fmt(n) { return `$${Number(n || 0).toFixed(2)}`; }

export default function Credito() {
    const [balance, setBalance] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/credit')
            .then(r => r.json())
            .then(d => { setBalance(d.balance ?? 0); setHistory(d.history || []); })
            .catch(() => setBalance(0))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Crédito de Tienda</h1>
                <p className={styles.subtitle}>Saldo a favor para usar en tus próximas compras.</p>
            </div>

            {/* Balance card */}
            <div className={`${styles.card} ${cStyles.balanceCard}`}>
                <p className={cStyles.balanceLabel}>Saldo Disponible</p>
                {loading ? (
                    <p className={cStyles.balanceAmount}>—</p>
                ) : (
                    <p className={`${cStyles.balanceAmount} ${balance > 0 ? cStyles.positive : ''}`}>
                        {fmt(balance)}
                    </p>
                )}
                <p className={cStyles.balanceNote}>
                    El crédito se aplica automáticamente al siguiente checkout.
                </p>
            </div>

            {/* History */}
            <div className={styles.card}>
                <h2 className={styles.cardTitle}>Historial de Movimientos</h2>
                {loading ? (
                    <div className={styles.emptyState}><p style={{ color: 'var(--muted)' }}>Cargando...</p></div>
                ) : history.length === 0 ? (
                    <div className={styles.emptyState}><p>Sin movimientos registrados.</p></div>
                ) : (
                    <div className={cStyles.historyList}>
                        {history.map(h => (
                            <div key={h.id} className={cStyles.historyRow}>
                                <div className={cStyles.historyInfo}>
                                    <span className={cStyles.historyDesc}>{h.description || 'Ajuste de crédito'}</span>
                                    <span className={cStyles.historyDate}>
                                        {new Date(h.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </span>
                                </div>
                                <span className={`${cStyles.historyAmount} ${Number(h.amount) >= 0 ? cStyles.positive : cStyles.negative}`}>
                                    {Number(h.amount) >= 0 ? '+' : ''}{fmt(h.amount)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
