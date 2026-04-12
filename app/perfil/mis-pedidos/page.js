"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './MisPedidos.module.css';
import OrderCard from '@/components/perfil/OrderCard';

export default function MisPedidos() {
    const [activeTab, setActiveTab] = useState('curso');
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/orders')
            .then(r => r.json())
            .then(({ orders }) => setOrders(orders || []))
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
    }, []);

    const activeOrders  = orders.filter(o => o.status !== 'entregado');
    const historyOrders = orders.filter(o => o.status === 'entregado');
    const currentList   = activeTab === 'curso' ? activeOrders : historyOrders;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Mis Pedidos</h1>
                <p className={styles.subtitle}>Sigue el estado de tus coleccionables y revisa tu historial.</p>
            </div>

            <div className={styles.tabsContainer}>
                <button
                    className={`${styles.tab} ${activeTab === 'curso' ? styles.active : ''}`}
                    onClick={() => setActiveTab('curso')}
                >
                    En Curso <span className={styles.tabBadge}>{activeOrders.length}</span>
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'historial' ? styles.active : ''}`}
                    onClick={() => setActiveTab('historial')}
                >
                    Historial
                </button>
            </div>

            <div className={styles.orderList}>
                {loading ? (
                    <div className={styles.emptyState}>
                        <p style={{ color: 'var(--muted)' }}>Cargando pedidos...</p>
                    </div>
                ) : currentList.length > 0 ? (
                    currentList.map(order => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            isHistory={activeTab === 'historial'}
                        />
                    ))
                ) : (
                    <div className={styles.emptyState}>
                        <p>No tienes pedidos en esta categoría.</p>
                        <Link href="/" className={styles.shopBtn}>
                            Explorar Tienda
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
