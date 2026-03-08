"use client";

import { useState } from 'react';
import Link from 'next/link';
import styles from './MisPedidos.module.css';
import OrderCard from '@/components/perfil/OrderCard';

// Mock data based on requirements
const MOCK_ORDERS = [
    {
        id: '10934',
        date: '2026-03-01T10:00:00Z',
        status: 'produccion',
        itemName: 'Figura Nendoroid - Gojo Satoru',
        itemsCount: 1,
        type: 'Preventa',
        image: '/nosotros-mural.webp',
        total: 1200.00,
        payments: [
            { id: 'pay_1', amount: 400.00, date: '2026-03-01' }
        ]
    },
    {
        id: '10855',
        date: '2026-02-15T14:30:00Z',
        status: 'transito',
        itemName: 'Manga Box Set - Demon Slayer',
        itemsCount: 1,
        type: 'Pedido Normal',
        image: '/bisonte-mural.webp',
        total: 2500.00,
        payments: [
            { id: 'pay_2', amount: 1000.00, date: '2026-02-15' },
            { id: 'pay_3', amount: 1500.00, date: '2026-02-28' } // Liquidado
        ]
    },
    {
        id: '10112',
        date: '2025-11-20T09:15:00Z',
        status: 'entregado',
        itemName: 'Estatua Resina - Goku Ultra Instinto 1/4',
        itemsCount: 1,
        type: 'Preventa',
        image: '/hero-graffiti.webp',
        total: 8500.00,
        payments: [
            { id: 'pay_4', amount: 8500.00, date: '2025-11-20' }
        ]
    }
];

export default function MisPedidos() {
    const [activeTab, setActiveTab] = useState('curso'); // 'curso' | 'historial'

    // Filter orders
    const activeOrders = MOCK_ORDERS.filter(o => o.status !== 'entregado');
    const historyOrders = MOCK_ORDERS.filter(o => o.status === 'entregado');

    const currentList = activeTab === 'curso' ? activeOrders : historyOrders;

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
                {currentList.length > 0 ? (
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
