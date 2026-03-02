'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import styles from './login.module.css';
import TipsOverlay from '@/components/TipsOverlay';

export default function LoginPage() {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Aquí irá la lógica de autenticación
        setTimeout(() => setLoading(false), 1500);
    };

    return (
        <div className={styles.wrapper}>
            {/* Mural de fondo */}
            <div className={styles.muralContainer}>
                <Image
                    src="/login-mural.png"
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
        </div>
    );
}
