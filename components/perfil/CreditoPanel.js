'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import styles from '@/app/perfil/CommonProfile.module.css';
import cStyles from '@/app/perfil/credito/Credito.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Credito de tienda. Vivia en su propia pagina del menu; ahora es un bloque
// dentro de Mi Cuenta — el saldo es parte de la identidad del cliente, no un
// apartado aparte. `onBalance` deja que Mi Cuenta muestre el mismo numero en
// su fila de indicadores sin pedir el dato dos veces.
// ─────────────────────────────────────────────────────────────────────────────

function fmt(n) { return `$${Number(n || 0).toFixed(2)}`; }

export default function CreditoPanel({ onBalance }) {
    const [balance, setBalance] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let vivo = true;
        fetch('/api/credit')
            .then(r => r.json())
            .then(d => {
                if (!vivo) return;
                const saldo = d.balance ?? 0;
                setBalance(saldo);
                setHistory(d.history || []);
                onBalance?.(saldo);
            })
            .catch(() => { if (vivo) setBalance(0); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
        // onBalance se omite a proposito: si el padre lo redefine en cada render
        // esto volveria a pedir el saldo en bucle.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <div className={`${styles.card} ${cStyles.balanceCard}`}>
                <p className={cStyles.balanceLabel}>Saldo disponible</p>
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

                {/* Sin flujo propio de recarga todavia: el boton lleva a
                    contacto, que es por donde hoy se compra el saldo. */}
                <Link href="/contacto?asunto=saldo" className={cStyles.comprarBtn}>
                    <Plus size={16} />
                    Comprar saldo
                </Link>
            </div>

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>Historial de movimientos</h2>
                {loading ? (
                    <div className={styles.emptyState}><p>Cargando…</p></div>
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
        </>
    );
}
