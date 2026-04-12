'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { ShoppingBag, Ticket, CreditCard, Copy, CheckCircle2, User } from 'lucide-react';
import commonStyles from '../CommonProfile.module.css';
import styles from './MiCuenta.module.css';

export default function MiCuenta() {
    const { user, isAuthenticated } = useAuthStore();
    const router = useRouter();
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) router.replace('/');
    }, [isAuthenticated, router]);

    if (!user) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(user.client_code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
    };

    return (
        <div className={commonStyles.container}>
            <div className={commonStyles.header}>
                <h1 className={commonStyles.title}>Mi Cuenta</h1>
                <p className={commonStyles.subtitle}>Gestiona tu identidad y datos básicos en la plataforma.</p>
            </div>

            {/* ── Perfil hero ── */}
            <div className={`${commonStyles.card} ${styles.profileCard}`}>
                <div className={styles.profileHero}>
                    <div className={styles.avatarWrapper}>
                        {user.avatar ? (
                            <img src={user.avatar} alt="Avatar" className={styles.avatar} />
                        ) : (
                            <div className={styles.avatarFallback}>
                                {user.nombre?.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <span className={styles.onlineDot} />
                    </div>
                    <div className={styles.profileInfo}>
                        <h2 className={styles.profileName}>{user.nombre}</h2>
                        <p className={styles.profileEmail}>{user.email}</p>
                        <Link href="/perfil/ajustes" className={styles.editBtn}>
                            Editar perfil
                        </Link>
                    </div>
                </div>
            </div>

            {/* ── Stats ── */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><ShoppingBag size={18} /></div>
                    <span className={styles.statValue}>0</span>
                    <span className={styles.statLabel}>Pedidos Activos</span>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><Ticket size={18} /></div>
                    <span className={styles.statValue}>0</span>
                    <span className={styles.statLabel}>Preventas</span>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><CreditCard size={18} /></div>
                    <span className={styles.statValue}>$0</span>
                    <span className={styles.statLabel}>Crédito</span>
                </div>
            </div>

            {/* ── Credencial ── */}
            <div className={`${commonStyles.card} ${styles.credentialCard}`}>
                <p className={styles.credentialTitle}>Credencial Bisonte</p>
                <p className={styles.credentialDesc}>
                    Tu identificador único en nuestra base de datos. Compártelo con soporte si necesitas ayuda por WhatsApp.
                </p>
                <div className={styles.credentialRow}>
                    <span className={styles.credentialCode}>{user.client_code}</span>
                    <button
                        onClick={handleCopy}
                        className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ''}`}
                    >
                        {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                        {copied ? '¡Copiado!' : 'Copiar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
