'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { ShoppingBag, Ticket, CreditCard, Copy, CheckCircle2, AlertTriangle, X, Trash2, Shield, Star } from 'lucide-react';
import commonStyles from '../CommonProfile.module.css';
import styles from './MiCuenta.module.css';

export default function MiCuenta() {
    const { user, isAuthenticated, clearUser } = useAuthStore();
    const router = useRouter();
    const [copied, setCopied] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    useEffect(() => {
        if (!isAuthenticated) router.replace('/');
    }, [isAuthenticated, router]);

    if (!user) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(user.client_code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirm !== user.email) {
            setDeleteError('El correo no coincide.');
            return;
        }
        setDeleting(true);
        setDeleteError('');
        try {
            const res = await fetch('/api/me', { method: 'DELETE' });
            if (!res.ok) throw new Error('Error al eliminar cuenta');
            clearUser();
            router.replace('/');
        } catch (e) {
            setDeleteError('No se pudo eliminar la cuenta. Intenta de nuevo.');
            setDeleting(false);
        }
    };

    const initials = `${user.nombre?.charAt(0) ?? ''}${user.apellido?.charAt(0) ?? ''}`.toUpperCase();

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
                                {initials || user.nombre?.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <span className={styles.onlineDot} />
                    </div>
                    <div className={styles.profileInfo}>
                        <div className={styles.profileNameRow}>
                            <h2 className={styles.profileName}>{user.nombre} {user.apellido}</h2>
                            <span className={styles.memberBadge}>
                                <Star size={10} />
                                Miembro
                            </span>
                        </div>
                        <p className={styles.profileEmail}>{user.email}</p>
                        <div className={styles.profileActions}>
                            <Link href="/perfil/ajustes" className={styles.editBtn}>
                                Editar perfil
                            </Link>
                        </div>
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
                <div className={styles.credentialHeader}>
                    <Shield size={16} className={styles.credentialIcon} />
                    <p className={styles.credentialTitle}>Credencial Bisonte</p>
                </div>
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

            {/* ── Zona de peligro ── */}
            <div className={`${commonStyles.card} ${styles.dangerCard}`}>
                <div className={styles.dangerHeader}>
                    <AlertTriangle size={16} className={styles.dangerIcon} />
                    <p className={styles.dangerTitle}>Zona de peligro</p>
                </div>
                <div className={styles.dangerRow}>
                    <div className={styles.dangerInfo}>
                        <p className={styles.dangerActionTitle}>Eliminar cuenta</p>
                        <p className={styles.dangerActionDesc}>
                            Elimina permanentemente tu cuenta y todos tus datos. Esta acción no se puede deshacer.
                        </p>
                    </div>
                    <button
                        className={styles.deleteBtn}
                        onClick={() => { setShowDeleteModal(true); setDeleteConfirm(''); setDeleteError(''); }}
                    >
                        <Trash2 size={14} />
                        Eliminar cuenta
                    </button>
                </div>
            </div>

            {/* ── Modal confirmación ── */}
            {showDeleteModal && (
                <div className={styles.modalOverlay} onClick={() => !deleting && setShowDeleteModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalIconWrapper}>
                                <AlertTriangle size={22} />
                            </div>
                            <button
                                className={styles.modalClose}
                                onClick={() => !deleting && setShowDeleteModal(false)}
                                disabled={deleting}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <h3 className={styles.modalTitle}>¿Eliminar tu cuenta?</h3>
                        <p className={styles.modalDesc}>
                            Esta acción es <strong>permanente e irreversible</strong>. Se eliminarán todos tus datos, pedidos e historial.
                        </p>

                        <div className={styles.modalField}>
                            <label className={styles.modalLabel}>
                                Escribe tu correo <span className={styles.modalEmailHint}>{user.email}</span> para confirmar
                            </label>
                            <input
                                type="email"
                                className={`${styles.modalInput} ${deleteError ? styles.modalInputError : ''}`}
                                placeholder={user.email}
                                value={deleteConfirm}
                                onChange={e => { setDeleteConfirm(e.target.value); setDeleteError(''); }}
                                disabled={deleting}
                                autoComplete="off"
                            />
                            {deleteError && <span className={styles.modalError}>{deleteError}</span>}
                        </div>

                        <div className={styles.modalActions}>
                            <button
                                className={styles.modalCancel}
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleting}
                            >
                                Cancelar
                            </button>
                            <button
                                className={styles.modalConfirm}
                                onClick={handleDeleteAccount}
                                disabled={deleting || deleteConfirm !== user.email}
                            >
                                {deleting ? 'Eliminando...' : 'Sí, eliminar mi cuenta'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
