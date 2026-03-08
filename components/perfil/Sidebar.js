"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';
import {
    FiUser,
    FiPackage,
    FiDollarSign,
    FiCreditCard,
    FiHeart,
    FiBell,
    FiSettings
} from 'react-icons/fi';

const navItems = [
    { path: '/perfil/mi-cuenta', label: 'Mi Cuenta', icon: <FiUser className={styles.icon} /> },
    { path: '/perfil/mis-pedidos', label: 'Mis Pedidos', icon: <FiPackage className={styles.icon} /> },
    { path: '/perfil/anticipos', label: 'Anticipos', icon: <FiDollarSign className={styles.icon} /> },
    { path: '/perfil/credito', label: 'Crédito de Tienda', icon: <FiCreditCard className={styles.icon} /> },
    { path: '/perfil/series', label: 'Series que Sigo', icon: <FiHeart className={styles.icon} /> },
    { path: '/perfil/notificaciones', label: 'Notificaciones', icon: <FiBell className={styles.icon} /> },
    { path: '/perfil/ajustes', label: 'Ajustes', icon: <FiSettings className={styles.icon} /> },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className={styles.sidebar}>
            {navItems.map((item) => (
                <Link
                    key={item.path}
                    href={item.path}
                    className={`${styles.navItem} ${pathname === item.path ? styles.active : ''}`}
                >
                    {item.icon}
                    <span>{item.label}</span>
                </Link>
            ))}
        </aside>
    );
}
