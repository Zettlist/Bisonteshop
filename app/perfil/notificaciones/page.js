'use client';

import { useState, useEffect } from 'react';
import { Bell, Package, CheckCheck, Truck, CheckCircle, XCircle, AlertTriangle, Search } from 'lucide-react';
import styles from '../CommonProfile.module.css';
import nStyles from './Notificaciones.module.css';

// Map notification type → { icon, iconClass }
const TYPE_CFG = {
    order_pendiente:  { Icon: Search,        iconClass: null },            // usa iconUnread o default
    order_confirmado: { Icon: Package,        iconClass: nStyles.iconConfirmado },
    order_envio:      { Icon: Truck,          iconClass: nStyles.iconEnvio },
    order_entregado:  { Icon: CheckCircle,    iconClass: nStyles.iconEntregado },
    order_reclamo:    { Icon: AlertTriangle,  iconClass: nStyles.iconReclamo },
    order_cancelado:  { Icon: XCircle,        iconClass: nStyles.iconCancelado },
    // legado
    order:            { Icon: Package,        iconClass: null },
    info:             { Icon: Bell,           iconClass: null },
};

function getTypeCfg(type) {
    return TYPE_CFG[type] || TYPE_CFG['info'];
}

export default function Notificaciones() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        fetch('/api/notifications')
            .then(r => r.json())
            .then(d => {
                setNotifications(d.notifications || []);
                setUnread(d.unread || 0);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const markAllRead = async () => {
        await fetch('/api/notifications', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ all: true }),
        });
        setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
        setUnread(0);
    };

    const markRead = async (id) => {
        await fetch('/api/notifications', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
        setUnread(prev => Math.max(0, prev - 1));
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={nStyles.headerRow}>
                    <div>
                        <h1 className={styles.title}>Notificaciones</h1>
                        <p className={styles.subtitle}>Actualizaciones de tus pedidos y cuenta.</p>
                    </div>
                    {unread > 0 && (
                        <button className={nStyles.markAllBtn} onClick={markAllRead}>
                            <CheckCheck size={15} />
                            Marcar todo como leído
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.card}>
                {loading ? (
                    <div className={styles.emptyState}>
                        <p style={{ color: 'var(--muted)' }}>Cargando...</p>
                    </div>
                ) : notifications.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Bell size={36} strokeWidth={1.2} style={{ color: 'var(--muted)', marginBottom: '0.5rem' }} />
                        <p>Sin notificaciones por ahora.</p>
                    </div>
                ) : (
                    <div className={nStyles.list}>
                        {notifications.map(n => {
                            const { Icon, iconClass } = getTypeCfg(n.type);
                            const isUnread = !n.read_at;
                            // Icon color: unread pendiente/info/legacy → primary red; else use status color
                            const resolvedIconClass = iconClass
                                ? iconClass
                                : isUnread ? nStyles.iconUnread : '';

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
        </div>
    );
}
