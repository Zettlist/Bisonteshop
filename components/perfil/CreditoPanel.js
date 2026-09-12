'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import styles from '@/app/perfil/CommonProfile.module.css';
import cStyles from '@/app/perfil/credito/Credito.module.css';
import ComprarSaldoDialogo from './ComprarSaldoDialogo';
import { reintentarRecargaPendiente } from '@/lib/recargaPendiente';

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
    const [comprando, setComprando] = useState(false);
    const [rescatada, setRescatada] = useState(null);   // monto de una recarga abonada al vuelo

    // `onBalance` se guarda en una ref porque el padre lo redefine en cada
    // render: usarlo como dependencia de `cargar` volveria a pedir el saldo en
    // bucle.
    const avisar = useRef(onBalance);
    avisar.current = onBalance;

    const cargar = useCallback(() => {
        let vivo = true;
        fetch('/api/credit')
            .then(r => r.json())
            .then(d => {
                if (!vivo) return;
                const saldo = d.balance ?? 0;
                setBalance(saldo);
                setHistory(d.history || []);
                avisar.current?.(saldo);
            })
            .catch(() => { if (vivo) setBalance(0); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, []);

    useEffect(() => cargar(), [cargar]);

    // Rescate de la recarga que se quedo a medias: cobrada por Stripe y sin
    // abonar porque la pestaña murio antes de pedirlo. El apunte lo dejo el
    // dialogo en este navegador; el reintento es idempotente en el servidor.
    useEffect(() => {
        let vivo = true;
        reintentarRecargaPendiente()
            .then(r => {
                if (!vivo || !r.abonada) return;
                setRescatada(r.amount);
                if (typeof r.balance === 'number') {
                    setBalance(r.balance);
                    avisar.current?.(r.balance);
                }
                cargar();
            })
            .catch(() => { });
        return () => { vivo = false; };
    }, [cargar]);

    // El dialogo ya devuelve el saldo nuevo, asi que se pinta al instante; la
    // recarga completa es por el historial, donde tiene que aparecer el
    // movimiento recien hecho.
    const alRecargar = (nuevoSaldo) => {
        setBalance(nuevoSaldo);
        avisar.current?.(nuevoSaldo);
        cargar();
    };

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

                {/* Una recarga que se habia quedado cobrada sin abonar y acaba
                    de entrar. Se dice porque el cliente ya la habia dado por
                    perdida: ver el saldo subir solo, sin explicacion, asusta
                    tanto como no verlo subir. */}
                {rescatada != null && (
                    <p className={cStyles.balanceRescate}>
                        Abonamos {fmt(rescatada)} de una recarga que había quedado pendiente.
                    </p>
                )}

                {/* Antes era un enlace a /contacto: no habia flujo de recarga y
                    el saldo lo abonaba la tienda a mano. Ahora se compra aqui
                    mismo, sin salir del perfil. */}
                <button
                    type="button"
                    className={cStyles.comprarBtn}
                    onClick={() => setComprando(true)}
                >
                    <Plus size={16} />
                    Comprar saldo
                </button>
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

            {comprando && (
                <ComprarSaldoDialogo
                    onCerrar={() => setComprando(false)}
                    onRecarga={alRecargar}
                />
            )}
        </>
    );
}
