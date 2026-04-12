'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, LogIn, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import styles from '@/app/login/login.module.css';
import modalStyles from './LoginModal.module.css';

export default function LoginModal({ isOpen, onClose }) {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const router = useRouter();
    const setUser = useAuthStore(state => state.setUser);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (data.success) {
                setUser(data.user);
                onClose();
                router.refresh();
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

    const handleClose = () => {
        setEmail('');
        setPassword('');
        setErrorMsg(null);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className={modalStyles.backdrop}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        onClick={handleClose}
                    />

                    {/* Panel */}
                    <motion.div
                        className={modalStyles.panel}
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <button className={modalStyles.closeBtn} onClick={handleClose} aria-label="Cerrar">
                            <X size={20} />
                        </button>

                        <div className={styles.header}>
                            <span className={styles.logoText}>Bisonte Manga</span>
                            <h1 className={styles.title}>Bienvenido</h1>
                            <p className={styles.subtitle}>Inicia sesión en tu cuenta</p>
                        </div>

                        <form className={styles.form} onSubmit={handleSubmit}>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="modal-email">
                                    Correo electrónico
                                </label>
                                <input
                                    id="modal-email"
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
                                <label className={styles.label} htmlFor="modal-password">
                                    Contraseña
                                </label>
                                <div className={styles.passwordWrapper}>
                                    <input
                                        id="modal-password"
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
                                <Link href="/recuperar" className={styles.forgot} onClick={handleClose}>
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

                        <div className={styles.divider}>
                            <span />
                            <p>¿No tienes cuenta?</p>
                            <span />
                        </div>

                        <Link href="/registro" className={styles.registerBtn} onClick={handleClose}>
                            Crear cuenta
                        </Link>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
