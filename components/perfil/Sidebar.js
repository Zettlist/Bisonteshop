"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import styles from './Sidebar.module.css';
import {
    FiUser,
    FiPackage,
    FiDollarSign,
    FiCreditCard,
    FiHeart,
    FiBell,
    FiSettings,
    FiLogOut,
} from 'react-icons/fi';

const navItems = [
    { path: '/perfil/mi-cuenta', label: 'Mi Cuenta', icon: FiUser },
    { path: '/perfil/mis-pedidos', label: 'Mis Pedidos', icon: FiPackage },
    { path: '/perfil/anticipos', label: 'Anticipos', icon: FiDollarSign },
    { path: '/perfil/credito', label: 'Crédito de Tienda', icon: FiCreditCard },
    { path: '/perfil/series', label: 'Series que Sigo', icon: FiHeart },
    { path: '/perfil/notificaciones', label: 'Notificaciones', icon: FiBell },
    { path: '/perfil/ajustes', label: 'Ajustes', icon: FiSettings },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const clearUser = useAuthStore(state => state.clearUser);

    const handleLogout = async () => {
        await fetch('/api/logout', { method: 'POST' });
        clearUser();
        router.push('/');
        router.refresh();
    };

    return (
        <aside className={styles.sidebar}>
            <div className={styles.navList}>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            className={`${styles.navItem} ${pathname === item.path ? styles.active : ''}`}
                        >
                            <Icon className={styles.icon} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </div>

            <button className={styles.logoutBtn} onClick={handleLogout}>
                <FiLogOut className={styles.icon} />
                <span>Cerrar sesión</span>
            </button>
        </aside>
    );
}
