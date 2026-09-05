'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { ShoppingBag, Ticket, CreditCard, Bell, Copy, CheckCircle2, AlertTriangle, X, Trash2 } from 'lucide-react';
import CreditoPanel from '@/components/perfil/CreditoPanel';
import NotificacionesPanel from '@/components/perfil/NotificacionesPanel';
import styles from './MiCuenta.module.css';

export default function MiCuenta() {
    const { user, isAuthenticated, clearUser, _hydrated } = useAuthStore();
    const router = useRouter();
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    // Cupones de la cuenta
    const [cupones, setCupones] = useState([]);
    const [showCupones, setShowCupones] = useState(false);
    const [codeInput, setCodeInput] = useState('');
    const [codeResult, setCodeResult] = useState(null); // { ok, msg }
    const [checking, setChecking] = useState(false);
    const [copiedCupon, setCopiedCupon] = useState(null);

    // Los paneles de credito y notificaciones ya consultan sus APIs; publican
    // aqui el resumen para que la fila de indicadores no repita las llamadas.
    const [creditBalance, setCreditBalance] = useState(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [activeOrders, setActiveOrders] = useState(null);

    // El indicador de "sin leer" solo daba un numero. Las notificaciones ya
    // estan en esta misma pagina, mas abajo, asi que llevar hasta ellas es
    // mejor que abrir un modal con la misma lista repetida y otra consulta.
    const notificaciones = useRef(null);
    const [notificacionesDestacadas, setNotificacionesDestacadas] = useState(false);

    const verNotificaciones = () => {
        notificaciones.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // El bloque queda lejos del indicador: sin un destello que lo senale,
        // el salto parece que no llevo a ningun sitio.
        setNotificacionesDestacadas(true);
        setTimeout(() => setNotificacionesDestacadas(false), 1600);
    };

    // Hay que esperar a que zustand rehidrate desde localStorage: en el primer
    // render isAuthenticated todavia es false y esta pagina expulsaba a la home
    // a cualquiera que recargara /perfil/mi-cuenta con sesion valida.
    useEffect(() => {
        if (_hydrated && !isAuthenticated) router.replace('/');
    }, [_hydrated, isAuthenticated, router]);

    // Pedidos en curso: los que aun no llegaron a su ultimo estado. El
    // indicador mostraba un 0 fijo, que no decia nada del pedido real.
    useEffect(() => {
        if (!isAuthenticated) return;
        fetch('/api/orders')
            .then(r => r.json())
            .then(d => {
                const abiertos = (d.orders || []).filter(
                    o => !['entregado', 'cancelado'].includes(o.status)
                );
                setActiveOrders(abiertos.length);
            })
            .catch(() => setActiveOrders(0));
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        fetch('/api/cupones')
            .then(r => r.json())
            .then(d => { if (d.success) setCupones(d.cupones || []); })
            .catch(() => {});
    }, [isAuthenticated]);

    const checkCode = async () => {
        const code = codeInput.trim().toUpperCase();
        if (!code) return;
        setChecking(true);
        setCodeResult(null);
        try {
            const res = await fetch('/api/discount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, subtotal: 0 }),
            });
            const d = await res.json();
            if (d.success) {
                const valor = d.discount_type === 'percentage'
                    ? `${d.discount_value}% de descuento`
                    : `$${d.discount_value} MXN de descuento`;
                setCodeResult({ ok: true, msg: `Cupón válido: ${valor}. Aplícalo en el checkout al pagar.` });
            } else {
                setCodeResult({ ok: false, msg: d.error || 'Código inválido' });
            }
        } catch {
            setCodeResult({ ok: false, msg: 'Error de conexión. Intenta de nuevo.' });
        } finally {
            setChecking(false);
        }
    };

    const copyCupon = (code) => {
        navigator.clipboard.writeText(code);
        setCopiedCupon(code);
        setTimeout(() => setCopiedCupon(null), 2200);
    };

    if (!user) return null;

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
        <div className={styles.container}>
            <h1 className="sr-only">Mi cuenta</h1>

            {/* ── Perfil hero ── */}
            <div className={`${styles.card} ${styles.profileCard}`}>
                <div className={styles.profileHero}>
                    <div className={styles.avatarWrapper}>
                        {user.avatar ? (
                            <img src={`${user.avatar}?v=2`} alt="Avatar" className={styles.avatar} />
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
                    <span className={styles.statValue}>{activeOrders === null ? '—' : activeOrders}</span>
                    <span className={styles.statLabel}>Pedidos Activos</span>
                </div>
                <div
                    className={`${styles.statCard} ${styles.statCardClicable}`}
                    onClick={() => { setShowCupones(true); setCodeResult(null); setCodeInput(''); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setShowCupones(true)}
                >
                    <div className={styles.statIcon}><Ticket size={18} /></div>
                    <span className={styles.statValue}>{cupones.length}</span>
                    <span className={styles.statLabel}>Cupones</span>
                </div>
                <div
                    className={`${styles.statCard} ${styles.statCardClicable}`}
                    onClick={verNotificaciones}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && verNotificaciones()}
                >
                    <div className={styles.statIcon}><Bell size={18} /></div>
                    <span className={styles.statValue}>{unreadCount}</span>
                    <span className={styles.statLabel}>Sin Leer</span>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><CreditCard size={18} /></div>
                    <span className={styles.statValue}>
                        {creditBalance === null ? '—' : `$${Number(creditBalance).toFixed(2)}`}
                    </span>
                    <span className={styles.statLabel}>Crédito</span>
                </div>
            </div>

            {/* ── Credito de tienda (antes: /perfil/credito) ── */}
            <CreditoPanel onBalance={setCreditBalance} />

            {/* ── Notificaciones (antes: /perfil/notificaciones) ── */}
            <div
                ref={notificaciones}
                className={notificacionesDestacadas ? styles.bloqueDestacado : undefined}
                style={{ scrollMarginTop: '90px' }}
            >
                <NotificacionesPanel onUnread={setUnreadCount} />
            </div>

            {/* ── Zona de peligro ── */}
            <div className={`${styles.card} ${styles.dangerCard}`}>
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

            {/* ── Modal cupones ── */}
            {showCupones && (
                <div className={styles.modalOverlay} onClick={() => setShowCupones(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalIconWrapper} style={{ background: 'rgba(230, 57, 70, 0.12)', color: '#e63946', borderColor: 'rgba(230, 57, 70, 0.32)' }}>
                                <Ticket size={22} />
                            </div>
                            <button className={styles.modalClose} onClick={() => setShowCupones(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <h3 className={styles.modalTitle}>Tus cupones</h3>

                        {cupones.length === 0 ? (
                            <p className={styles.modalDesc}>
                                No tienes cupones disponibles por ahora. Participa en los eventos de la tienda para ganar descuentos 👀
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', margin: '0.5rem 0 1rem' }}>
                                {cupones.map(c => (
                                    <div key={c.code} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
                                        background: 'rgba(230, 57, 70, 0.07)', border: '1px dashed rgba(230, 57, 70, 0.4)',
                                        borderRadius: '12px', padding: '0.7rem 0.9rem',
                                    }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, letterSpacing: '2px', color: '#f6f2f4', fontFamily: 'monospace', fontSize: '1.05rem' }}>{c.code}</div>
                                            <div style={{ fontSize: '0.78rem', color: '#a1919b', marginTop: '2px' }}>{c.origen} · {c.detalle}</div>
                                        </div>
                                        <button
                                            onClick={() => copyCupon(c.code)}
                                            className={`${styles.copyBtn} ${copiedCupon === c.code ? styles.copyBtnSuccess : ''}`}
                                        >
                                            {copiedCupon === c.code ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                                            {copiedCupon === c.code ? '¡Copiado!' : 'Copiar'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className={styles.modalField}>
                            <label className={styles.modalLabel}>¿Tienes un código? Valídalo aquí</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="text"
                                    className={styles.modalInput}
                                    placeholder="Ej. MUNDIAL10"
                                    value={codeInput}
                                    onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeResult(null); }}
                                    onKeyDown={e => e.key === 'Enter' && checkCode()}
                                    autoComplete="off"
                                    style={{ flex: 1 }}
                                />
                                <button
                                    className={styles.modalCancel}
                                    onClick={checkCode}
                                    disabled={checking || !codeInput.trim()}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    {checking ? 'Validando…' : 'Validar'}
                                </button>
                            </div>
                            {codeResult && (
                                <span style={{
                                    display: 'block', marginTop: '0.5rem', fontSize: '0.85rem',
                                    color: codeResult.ok ? '#10b981' : '#ef4444',
                                }}>
                                    {codeResult.ok ? '✓ ' : '✗ '}{codeResult.msg}
                                </span>
                            )}
                        </div>

                        <p className={styles.modalDesc} style={{ marginTop: '0.75rem', fontSize: '0.78rem' }}>
                            Los cupones se aplican en el checkout, en la sección "Códigos de descuento".
                        </p>
                    </div>
                </div>
            )}

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
