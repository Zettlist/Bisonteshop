"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './MisPedidos.module.css';
import OrderCard from '@/components/perfil/OrderCard';

export default function MisPedidos() {
    const [activeTab, setActiveTab]     = useState('curso');
    const [orders, setOrders]           = useState([]);
    const [loading, setLoading]         = useState(true);
    const [modalIndex, setModalIndex]   = useState(null); // índice del pedido abierto

    useEffect(() => {
        fetch('/api/orders')
            .then(r => r.json())
            .then(({ orders }) => setOrders(orders || []))
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
    }, []);

    const enCursoOrders  = orders.filter(o => ['verificando', 'preparando', 'transito'].includes(o.status));
    const pedidosOrders  = orders.filter(o =>
        ['entregado', 'cancelado'].includes(o.status) ||
        (o.status === 'reclamo' && o.claimStatus === 'resolucion')
    );
    const reclamosOrders = orders.filter(o => o.status === 'reclamo' && o.claimStatus !== 'resolucion');

    const currentList = activeTab === 'curso'
        ? enCursoOrders
        : activeTab === 'reclamos'
        ? reclamosOrders
        : pedidosOrders;

    const openModal  = (i) => setModalIndex(i);
    const closeModal = ()  => setModalIndex(null);
    const goNext     = ()  => setModalIndex(i => Math.min(i + 1, currentList.length - 1));
    const goPrev     = ()  => setModalIndex(i => Math.max(i - 1, 0));

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Mis Pedidos</h1>
                <p className={styles.subtitle}>Sigue el estado de tus coleccionables y revisa tu historial.</p>
            </div>

            <div className={styles.tabsContainer}>
                <button
                    className={`${styles.tab} ${activeTab === 'curso' ? styles.active : ''}`}
                    onClick={() => { setActiveTab('curso'); setModalIndex(null); }}
                >
                    En Curso {enCursoOrders.length > 0 && <span className={styles.tabBadge}>{enCursoOrders.length}</span>}
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'pedidos' ? styles.active : ''}`}
                    onClick={() => { setActiveTab('pedidos'); setModalIndex(null); }}
                >
                    Pedidos
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'reclamos' ? styles.active : ''}`}
                    onClick={() => { setActiveTab('reclamos'); setModalIndex(null); }}
                >
                    Reclamos {reclamosOrders.length > 0 && <span className={`${styles.tabBadge} ${styles.tabBadgeAlert}`}>{reclamosOrders.length}</span>}
                </button>
            </div>

            <div className={styles.orderList}>
                {loading ? (
                    <div className={styles.emptyState}>
                        <p style={{ color: 'var(--muted)' }}>Cargando pedidos...</p>
                    </div>
                ) : currentList.length > 0 ? (
                    currentList.map((order, i) => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            isHistory={activeTab === 'pedidos'}
                            onOpenDetail={() => openModal(i)}
                        />
                    ))
                ) : (
                    <div className={styles.emptyState}>
                        <p>No tienes pedidos en esta categoría.</p>
                        <Link href="/" className={styles.shopBtn}>Explorar Tienda</Link>
                    </div>
                )}
            </div>

            {/* Modal global con navegación */}
            {modalIndex !== null && currentList[modalIndex] && (
                <OrderModalWithNav
                    order={currentList[modalIndex]}
                    index={modalIndex}
                    total={currentList.length}
                    onClose={closeModal}
                    onNext={goNext}
                    onPrev={goPrev}
                    onOrderStatusChange={(id, newStatus, newClaimStatus) => {
                        setOrders(prev => prev.map(o => o.id === id
                            ? { ...o, status: newStatus, ...(newClaimStatus !== undefined ? { claimStatus: newClaimStatus } : {}) }
                            : o
                        ));
                        if (newStatus === 'reclamo' && newClaimStatus !== 'resolucion') {
                            setActiveTab('reclamos');
                            setModalIndex(null);
                        }
                    }}
                />
            )}
        </div>
    );
}

// Importar el modal aquí para tener acceso a los controles de navegación
import { createPortal } from 'react-dom';
import { X, Package, CreditCard, CheckCircle, ChevronLeft, ChevronRight, Truck, AlertTriangle } from 'lucide-react';
import modalStyles from '@/components/perfil/OrderCard.module.css';

const CARRIER_INFO = {
    paquetexpress: { name: 'Paquetexpress', url: (t) => `https://www.paquetexpress.com.mx/rastreo/?guia=${t}` },
    fedex:         { name: 'FedEx',         url: (t) => `https://www.fedex.com/apps/fedextrack/?tracknumbers=${t}` },
    dhl:           { name: 'DHL',           url: (t) => `https://www.dhl.com/mx-es/home/tracking.html?tracking-id=${t}` },
    estafeta:      { name: 'Estafeta',      url: (t) => `https://www.estafeta.com/herramientas/rastreo?wayBillType=1&wayBill=${t}` },
};

const STATUS_MAP = {
    verificando: { label: 'Verificando existencias', cls: modalStyles.status_verificando },
    preparando:  { label: 'Preparando',              cls: modalStyles.status_preparando  },
    transito:    { label: 'En Tránsito',             cls: modalStyles.status_transito    },
    entregado:   { label: 'Entregado',               cls: modalStyles.status_entregado   },
    reclamo:     { label: 'En Reclamo',              cls: modalStyles.status_cancelado   },
    cancelado:   { label: 'Cancelado',               cls: modalStyles.status_cancelado   },
};

const STEPS = [
    { key: 'verificando', label: 'Verificando existencias', icon: '🔍', desc: 'Confirmando stock en almacén' },
    { key: 'preparando',  label: 'Preparando',              icon: '📦', desc: 'Empacando tus artículos'     },
    { key: 'transito',    label: 'En camino',               icon: '🚚', desc: 'Con la paquetería'           },
    { key: 'entregado',   label: 'Entregado',               icon: '🏠', desc: 'En tu puerta'                },
];
const STATUS_ORDER = ['verificando', 'preparando', 'transito', 'entregado'];

const CLAIM_REASONS = [
    'Producto dañado',
    'Producto incorrecto',
    'Producto no llegó',
    'Producto incompleto',
    'Problema con la paquetería',
    'Otro',
];

function OrderModalWithNav({ order: initialOrder, index, total, onClose, onNext, onPrev, onOrderStatusChange }) {
    const [order, setOrder] = React.useState(initialOrder);
    const [showClaimForm, setShowClaimForm] = React.useState(false);
    const [claimReason, setClaimReason] = React.useState('');
    const [claimNotes, setClaimNotes] = React.useState('');
    const [claimLoading, setClaimLoading] = React.useState(false);
    const [claimError, setClaimError] = React.useState('');

    // Sync order when navigating between orders
    React.useEffect(() => {
        setOrder(initialOrder);
        setShowClaimForm(false);
        setClaimReason('');
        setClaimNotes('');
        setClaimError('');
    }, [initialOrder]);

    const canClaim = ['transito', 'entregado'].includes(order.status);

    const handleClaim = async () => {
        if (!claimReason) { setClaimError('Selecciona un motivo'); return; }
        setClaimLoading(true);
        setClaimError('');
        try {
            const res = await fetch(`/api/orders/${order.id}/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ claim_reason: claimReason, claim_notes: claimNotes }),
            });
            const data = await res.json();
            if (!res.ok) { setClaimError(data.error || 'Error al enviar'); return; }
            setOrder(prev => ({ ...prev, status: 'reclamo' }));
            onOrderStatusChange?.(order.id, 'reclamo');
            setShowClaimForm(false);
        } catch { setClaimError('Error de conexión'); }
        finally { setClaimLoading(false); }
    };

    const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
    const resolvedClaim = order.status === 'reclamo' && order.claimStatus === 'resolucion';
    const statusConfig = resolvedClaim
        ? { label: 'Reclamo Resuelto', cls: modalStyles.status_entregado }
        : STATUS_MAP[order.status] || STATUS_MAP['verificando'];
    const currentIdx = STATUS_ORDER.indexOf(order.status);
    const carrierInfo = order.carrier ? CARRIER_INFO[order.carrier.toLowerCase()] : null;
    const trackingUrl = carrierInfo && order.trackingNumber ? carrierInfo.url(order.trackingNumber) : null;
    const hasPrev = index > 0;
    const hasNext = index < total - 1;

    return createPortal(
        <div className={modalStyles.overlay} onClick={onClose}>
            <div className={modalStyles.modal} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className={modalStyles.modalHeader}>
                    <div>
                        <div className={modalStyles.modalTitle}>Pedido #{order.id}</div>
                        <div className={modalStyles.modalDate}>
                            {new Date(order.date).toLocaleDateString('es-MX', {
                                year: 'numeric', month: 'long', day: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                            })}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className={`${modalStyles.statusBadge} ${statusConfig.cls}`}>
                            {statusConfig.label}
                        </span>
                        <button className={modalStyles.closeBtn} onClick={onClose}><X size={18} /></button>
                    </div>
                </div>

                {/* Barra de navegación entre pedidos */}
                {total > 1 && (
                    <div className={modalStyles.navBar}>
                        <button
                            className={modalStyles.navBtn}
                            onClick={onPrev}
                            disabled={!hasPrev}
                        >
                            <ChevronLeft size={18} />
                            <span>Anterior</span>
                        </button>

                        <div className={modalStyles.navDots}>
                            {Array.from({ length: total }).map((_, i) => (
                                <div
                                    key={i}
                                    className={`${modalStyles.navDot} ${i === index ? modalStyles.navDotActive : ''}`}
                                />
                            ))}
                        </div>

                        <button
                            className={modalStyles.navBtn}
                            onClick={onNext}
                            disabled={!hasNext}
                        >
                            <span>Siguiente</span>
                            <ChevronRight size={18} />
                        </button>
                    </div>
                )}

                {/* Grid 2 columnas */}
                <div className={modalStyles.modalGrid}>
                    <div className={modalStyles.modalLeft}>

                        {/* Productos */}
                        <div className={modalStyles.modalSection}>
                            <div className={modalStyles.modalSectionTitle}><Package size={13} /> Productos</div>
                            <div className={modalStyles.itemList}>
                                {(order.items || []).map((item, i) => (
                                    <div key={i} className={modalStyles.modalItem}>
                                        <img
                                            src={item.image || '/bisonte-mural.webp'}
                                            alt={item.name}
                                            className={modalStyles.modalItemImg}
                                            onError={e => { e.target.src = '/bisonte-mural.webp'; }}
                                        />
                                        <div className={modalStyles.modalItemInfo}>
                                            <div className={modalStyles.modalItemName}>{item.name || 'Artículo'}</div>
                                            <div className={modalStyles.modalItemQty}>Cantidad: {item.quantity}</div>
                                            <div className={modalStyles.modalItemUnitPrice}>{fmt(item.price)} c/u</div>
                                        </div>
                                        <div className={modalStyles.modalItemPrice}>{fmt(item.price * item.quantity)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Progreso */}
                        <div className={modalStyles.modalSection}>
                            <div className={modalStyles.modalSectionTitle}><CheckCircle size={13} /> Estado del pedido</div>
                            <div className={modalStyles.progressSteps}>
                                {STEPS.map((s, i) => {
                                    const stepIdx  = STATUS_ORDER.indexOf(s.key);
                                    const isDone   = stepIdx < currentIdx;
                                    const isActive = stepIdx === currentIdx;
                                    return (
                                        <div key={s.key} className={modalStyles.progressRow}>
                                            <div className={modalStyles.progressLeft}>
                                                <div className={`${modalStyles.progressDot} ${isDone ? modalStyles.dotDone : isActive ? modalStyles.dotActive : modalStyles.dotPending}`}>
                                                    {s.icon}
                                                </div>
                                                {i < STEPS.length - 1 && (
                                                    <div className={`${modalStyles.progressLine} ${isDone ? modalStyles.lineDone : ''}`} />
                                                )}
                                            </div>
                                            <div className={modalStyles.progressContent} style={{ opacity: isDone || isActive ? 1 : 0.35 }}>
                                                <div className={modalStyles.progressLabel}>{s.label}</div>
                                                <div className={modalStyles.progressDesc}>{s.desc}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Resumen lateral */}
                    <div className={modalStyles.modalRight}>
                        <div className={modalStyles.summaryCard}>
                            <div className={modalStyles.modalSectionTitle}><CreditCard size={13} /> Resumen de pago</div>
                            <div className={modalStyles.summaryRows}>
                                <div className={modalStyles.summaryRow}><span>Subtotal</span><span>{fmt(order.subtotal)}</span></div>
                                {order.discount > 0 && (
                                    <div className={modalStyles.summaryRow}><span>Descuento</span><span className={modalStyles.discountVal}>−{fmt(order.discount)}</span></div>
                                )}
                                <div className={modalStyles.summaryRow}><span>Envío</span><span>{fmt(order.shipping)}</span></div>
                                <div className={`${modalStyles.summaryRow} ${modalStyles.summaryTotal}`}><span>Total pagado</span><span>{fmt(order.total)}</span></div>
                            </div>
                            <div className={modalStyles.paymentMethod}>
                                <span className={modalStyles.paymentIcon}>💳</span>
                                <div>
                                    <div className={modalStyles.paymentLabel}>Método de pago</div>
                                    <div className={modalStyles.paymentValue}>Tarjeta de crédito / débito</div>
                                </div>
                            </div>
                        </div>

                        {/* Tracking — solo si hay número de guía */}
                        {order.trackingNumber && (order.status === 'transito' || order.status === 'entregado') && (
                            <div className={modalStyles.trackingCard}>
                                <div className={modalStyles.modalSectionTitle}><Truck size={13} /> Rastreo de envío</div>
                                <div className={modalStyles.trackingBox}>
                                    <div className={modalStyles.trackingLabel}>
                                        {carrierInfo ? carrierInfo.name : 'Paquetería'} · Número de guía
                                    </div>
                                    <div className={modalStyles.trackingNumber}>{order.trackingNumber}</div>
                                    {trackingUrl ? (
                                        <a
                                            href={trackingUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={modalStyles.trackingBtn}
                                        >
                                            Rastrear paquete →
                                        </a>
                                    ) : (
                                        <span className={modalStyles.trackingHint}>
                                            Ingresa este número en el sitio de la paquetería
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Reclamo — solo si está en tránsito o entregado */}
                        {canClaim && order.status !== 'reclamo' && (
                            <div className={modalStyles.claimSection}>
                                {!showClaimForm ? (
                                    <button
                                        className={modalStyles.claimBtn}
                                        onClick={() => setShowClaimForm(true)}
                                    >
                                        <AlertTriangle size={14} />
                                        Levantar reclamo
                                    </button>
                                ) : (
                                    <div className={modalStyles.claimForm}>
                                        <div className={modalStyles.claimFormTitle}>
                                            <AlertTriangle size={13} />
                                            Levantar reclamo
                                        </div>
                                        <select
                                            className={modalStyles.claimSelect}
                                            value={claimReason}
                                            onChange={e => setClaimReason(e.target.value)}
                                        >
                                            <option value="">Selecciona el motivo…</option>
                                            {CLAIM_REASONS.map(r => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </select>
                                        <textarea
                                            className={modalStyles.claimTextarea}
                                            placeholder="Describe el problema (opcional)…"
                                            rows={3}
                                            value={claimNotes}
                                            onChange={e => setClaimNotes(e.target.value)}
                                        />
                                        {claimError && (
                                            <p className={modalStyles.claimError}>{claimError}</p>
                                        )}
                                        <div className={modalStyles.claimActions}>
                                            <button
                                                className={modalStyles.claimSubmitBtn}
                                                onClick={handleClaim}
                                                disabled={claimLoading}
                                            >
                                                {claimLoading ? 'Enviando…' : 'Enviar reclamo'}
                                            </button>
                                            <button
                                                className={modalStyles.claimCancelBtn}
                                                onClick={() => { setShowClaimForm(false); setClaimError(''); }}
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {order.status === 'reclamo' && order.claimStatus !== 'resolucion' && (
                            <div className={modalStyles.claimActive}>
                                <AlertTriangle size={14} />
                                Reclamo activo · En revisión
                            </div>
                        )}
                        {order.status === 'reclamo' && order.claimStatus === 'resolucion' && (
                            <div className={modalStyles.claimResolved}>
                                <CheckCircle size={14} />
                                Reclamo resuelto · Caso cerrado
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
