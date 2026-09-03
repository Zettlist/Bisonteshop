'use client';

import { useEffect, useState } from 'react';
import { Bell, Package, CheckCheck, Truck, CheckCircle, XCircle, AlertTriangle, Search } from 'lucide-react';
import styles from '@/app/perfil/CommonProfile.module.css';
import nStyles from '@/app/perfil/notificaciones/Notificaciones.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Centro de notificaciones. Tambien dejo de ser una entrada del menu: se lee
// dentro de Mi Cuenta, junto al resto del estado de la cuenta.
// ─────────────────────────────────────────────────────────────────────────────

// Cada tipo trae su icono y su color de estado.
const TYPE_CFG = {
    order_pendiente:  { Icon: Search,        iconClass: null },
    order_confirmado: { Icon: Package,       iconClass: nStyles.iconConfirmado },
    order_envio:      { Icon: Truck,         iconClass: nStyles.iconEnvio },
    order_entregado:  { Icon: CheckCircle,   iconClass: nStyles.iconEntregado },
    order_reclamo:    { Icon: AlertTriangle, iconClass: nStyles.iconReclamo },
    order_cancelado:  { Icon: XCircle,       iconClass: nStyles.iconCancelado },
    // legado
    order:            { Icon: Package,       iconClass: null },
    info:             { Icon: Bell,          iconClass: null },
};

function getTypeCfg(type) {
    return TYPE_CFG[type] || TYPE_CFG['info'];
}

export default function NotificacionesPanel({ onUnread }) {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        let vivo = true;
        fetch('/api/notifications')
            .then(r => r.json())
            .then(d => {
                if (!vivo) return;
                setNotifications(d.notifications || []);
                setUnread(d.unread || 0);
                onUnread?.(d.unread || 0);
            })
            .catch(() => {})
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const markAllRead = async () => {
        await fetch('/api/notifications', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ all: true }),
        });
        setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
        setUnread(0);
        onUnread?.(0);
    };

    const markRead = async (id) => {
        await fetch('/api/notifications', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
        setUnread(prev => {
            const siguiente = Math.max(0, prev - 1);
            onUnread?.(siguiente);
            return siguiente;
        });
    };

    return (
        <div className={styles.card}>
            <div className={nStyles.headerRow}>
                <h2 className={styles.cardTitle} style={{ border: 'none', margin: 0, paddingBottom: 0 }}>
                    Notificaciones
                </h2>
                {unread > 0 && (
                    <button className={nStyles.markAllBtn} onClick={markAllRead}>
                        <CheckCheck size={15} />
                        Marcar todo como leído
                    </button>
                )}
            </div>

            {loading ? (
                <div className={styles.emptyState}><p>Cargando…</p></div>
            ) : notifications.length === 0 ? (
                <div className={styles.emptyState}>
                    <Bell size={34} strokeWidth={1.2} style={{ color: 'var(--pf-muted)', marginBottom: '0.5rem' }} />
                    <p>Sin notificaciones por ahora.</p>
                </div>
            ) : (
                <div className={nStyles.list}>
                    {notifications.map(n => {
                        const { Icon, iconClass } = getTypeCfg(n.type);
                        const isUnread = !n.read_at;
                        const resolvedIconClass = iconClass || (isUnread ? nStyles.iconUnread : '');

                        return (
                            <div
                                key={n.id}
                                className={`${nStyles.item} ${isUnread ? nStyles.itemUnread : ''}`}
                                onClick={() => isUnread && markRead(n.id)}
                            >
                                <div className={`${nStyles.iconWrap} ${resolvedIconClass}`}>
                                    <Icon size={15} />
                                </div>
                                <div className={nStyles.content}>
                                    <div className={nStyles.titleRow}>
                                        <span className={nStyles.title}>{n.title}</span>
                                        {isUnread && <span className={nStyles.dot} />}
                                    </div>
                                    {n.body && <p className={nStyles.body}>{n.body}</p>}
                                    <span className={nStyles.date}>
                                        {new Date(n.created_at).toLocaleDateString('es-MX', {
                                            year: 'numeric', month: 'short', day: 'numeric',
                                            hour: '2-digit', minute: '2-digit',
                                        })}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
