'use client';

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import styles from './OrderCard.module.css';
import BarraProgreso from './BarraProgreso';
import {
    progresoDe,
    etiquetaActual,
    claseDe,
    esFinalizado,
    esCancelado,
    esReclamoActivo,
    reclamoResuelto,
    puedeReclamar,
} from '@/lib/pedidoProgreso';

// Solo el color del badge vive acá — la etiqueta sale de etiquetaActual(),
// la misma fuente que usa el recorrido de abajo.
const STATUS_CLASS = {
    verificando: styles.status_verificando,
    preparando:  styles.status_preparando,
    transito:    styles.status_transito,
    entregado:   styles.status_entregado,
    cancelado:   styles.status_cancelado,
    reclamo:     styles.status_reclamo,
};

export default function OrderCard({ order, onOpenDetail }) {
    const resuelto  = reclamoResuelto(order);
    const cerrado   = esFinalizado(order);
    const cancelado = esCancelado(order);
    const enReclamo = esReclamoActivo(order);

    const statusConfig = {
        label: etiquetaActual(order),
        class: resuelto ? styles.status_entregado : (STATUS_CLASS[claseDe(order)] || styles.status_verificando),
    };

    const { flujo, indice, tono } = progresoDe(order);

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

            {/* Un pedido cerrado ya no tiene recorrido que mostrar: en su lugar
                va el remate, y desde ahi se abre el reclamo si aun cabe. */}
            {cerrado ? (
                <div className={`${styles.remate} ${cancelado ? styles.remateCancelado : ''}`}>
                    <div className={styles.remateTexto}>
                        {cancelado ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                        <span>
                            {cancelado
                                ? 'Pedido cancelado'
                                : resuelto
                                ? 'Reclamo resuelto · Pedido completado'
                                : 'Pedido completado'}
                        </span>
                    </div>

                    {puedeReclamar(order) && (
                        <button
                            className={styles.reclamoBtn}
                            onClick={() => onOpenDetail?.({ reclamo: true })}
                        >
                            <AlertTriangle size={14} />
                            Levantar reclamo
                        </button>
                    )}
                </div>
            ) : (
                <div className={styles.progresoBloque}>
                    <BarraProgreso pasos={flujo} indice={indice} tono={tono} />
                    {enReclamo && (
                        <p className={styles.notaReclamo}>
                            <AlertTriangle size={13} />
                            Reclamo en curso. Te avisamos en cuanto tengamos resolución.
                        </p>
                    )}
                </div>
            )}

            <div className={styles.footer}>
                {!cerrado && debt > 0 && (
                    <button className={styles.btnPrimary}>Abonar Saldo</button>
                )}
                <button className={styles.btnSecondary} onClick={() => onOpenDetail?.()}>
                    Ver Detalles
                </button>
            </div>
        </div>
    );
}
