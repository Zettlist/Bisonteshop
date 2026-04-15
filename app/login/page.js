'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, LogIn, MailWarning, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import styles from './login.module.css';
import TipsOverlay from '@/components/TipsOverlay';

export default function LoginPage() {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const [unverifiedEmail, setUnverifiedEmail] = useState(null);
    const [resendStatus, setResendStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
    const router = useRouter();
    const setUser = useAuthStore(state => state.setUser);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);
        setUnverifiedEmail(null);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (data.success) {
                setUser(data.user);
                router.push('/');
                router.refresh();
            } else if (data.requiresVerification) {
                setUnverifiedEmail(data.email || email);
                setLoading(false);
            } else {
                setErrorMsg(data.error || 'Autenticación fallida');
                setLoading(false);
            }
        } catch (error) {
            console.error('Login error:', error);
            setErrorMsg('Error de conexión. Intente más tarde.');
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (!unverifiedEmail || resendStatus === 'sending') return;
        setResendStatus('sending');
        try {
            const res = await fetch('/api/reenviar-verificacion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: unverifiedEmail }),
            });
            const data = await res.json();
            setResendStatus(data.success ? 'sent' : 'error');
        } catch {
            setResendStatus('error');
        }
    };

    return (
        <div className={styles.wrapper}>
            {/* Mural de fondo */}
            <div className={styles.muralContainer}>
                <Image
                    src="/login-mural.webp"
                    alt="Mural Bisonte Manga"
                    fill
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                    priority
                />
                <div className={styles.muralOverlay} />
            </div>

            {/* Tips overlay izquierdo */}
            <TipsOverlay />

            {/* Panel de login */}
            <motion.div
                className={styles.panel}
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
            >
                <AnimatePresence mode="wait">
                {unverifiedEmail ? (
                    <motion.div
                        key="unverified"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        transition={{ duration: 0.3 }}
                        className={styles.verifyBox}
                    >
                        <div className={styles.verifyIcon}>
                            <MailWarning size={36} color="#f59e0b" />
                        </div>
                        <h2 className={styles.verifyTitle}>Verifica tu correo</h2>
                        <p className={styles.verifyText}>
                            Tu cuenta aún no está activada. Revisa tu bandeja de entrada en <strong>{unverifiedEmail}</strong> y haz clic en el enlace de verificación.
                        </p>

                        {resendStatus === 'sent' ? (
                            <div className={styles.resendSuccess}>✅ Correo reenviado. Revisa tu bandeja.</div>
                        ) : (
                            <button
                                className={styles.resendBtn}
                                onClick={handleResend}
                                disabled={resendStatus === 'sending'}
                            >
                                {resendStatus === 'sending' ? (
                                    <><span className={styles.spinner} /> Enviando...</>
                                ) : (
                                    <><RefreshCw size={15} /> Reenviar verificación</>
                                )}
                            </button>
                        )}

                        {resendStatus === 'error' && (
                            <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>Error al enviar. Intenta más tarde.</p>
                        )}

                        <button
                            className={styles.backToLogin}
                            onClick={() => { setUnverifiedEmail(null); setResendStatus(null); }}
                        >
                            ← Volver al inicio de sesión
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="loginform"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Logo / Header */}
                        <div className={styles.header}>
                            <Link href="/" className={styles.logoBack}>
                                <span className={styles.logoText}>Bisonte Manga</span>
                            </Link>
                            <h1 className={styles.title}>Bienvenido</h1>
                            <p className={styles.subtitle}>Inicia sesión en tu cuenta</p>
                        </div>

                        {/* Formulario */}
                        <form className={styles.form} onSubmit={handleSubmit}>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="email">
                                    Correo electrónico
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    className={styles.input}
                                    placeholder="tucorreo@ejemplo.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="password">
                                    Contraseña
                                </label>
                                <div className={styles.passwordWrapper}>
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        className={styles.input}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        className={styles.eyeBtn}
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label="Mostrar contraseña"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className={styles.forgotRow}>
                                <Link href="/recuperar" className={styles.forgot}>
                                    ¿Olvidaste tu contraseña?
                                </Link>
                            </div>

                            {errorMsg && (
                                <motion.div
                                    className={styles.errorMsg}
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    {errorMsg}
                                </motion.div>
                            )}

                            <motion.button
                                type="submit"
                                className={styles.submitBtn}
                                disabled={loading}
                                whileTap={{ scale: 0.97 }}
                                whileHover={{ scale: 1.02 }}
                            >
                                {loading ? (
                                    <span className={styles.spinner} />
                                ) : (
                                    <>
                                        <LogIn size={18} />
                                        Iniciar sesión
                                    </>
                                )}
                            </motion.button>
                        </form>

                        {/* Divider */}
                        <div className={styles.divider}>
                            <span />
                            <p>¿No tienes cuenta?</p>
                            <span />
                        </div>

                        <Link href="/registro" className={styles.registerBtn}>
                            Crear cuenta
                        </Link>

                        <p className={styles.back}>
                            <Link href="/">← Volver a la tienda</Link>
                        </p>
                    </motion.div>
                )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
