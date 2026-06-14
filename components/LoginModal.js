'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, LogIn, X, MailWarning, MailCheck, RefreshCw, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import m from './LoginModal.module.css';

const REGISTRO_INICIAL = {
    nombre: '', apellido: '', fechaNacimiento: '', nacionalidad: '',
    email: '', password: '', confirmar: '', terminos: false,
};

export default function LoginModal({ isOpen, onClose }) {
    const [vista, setVista] = useState('login'); // 'login' | 'registro'
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const [unverifiedEmail, setUnverifiedEmail] = useState(null); // email that needs verification
    const [resendStatus, setResendStatus] = useState(null); // null | 'sending' | 'sent' | 'error'

    // Registro
    const [reg, setReg] = useState(REGISTRO_INICIAL);
    const [showRegPassword, setShowRegPassword] = useState(false);
    const [regLoading, setRegLoading] = useState(false);
    const [regError, setRegError] = useState(null);
    const [regSuccess, setRegSuccess] = useState(null); // email registrado

    const router = useRouter();
    const setUser = useAuthStore(state => state.setUser);

    const handleRegChange = (e) => {
        const { name, value, type, checked } = e.target;
        setReg(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
        setRegError(null);
    };

    const handleRegistro = async (e) => {
        e.preventDefault();
        if (reg.fechaNacimiento) {
            const hoy = new Date();
            const nac = new Date(reg.fechaNacimiento);
            const edad = hoy.getFullYear() - nac.getFullYear()
                - (hoy < new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate()) ? 1 : 0);
            if (edad < 18) {
                setRegError('Debes ser mayor de 18 años para registrarte.');
                return;
            }
        }
        if (reg.password !== reg.confirmar) {
            setRegError('Las contraseñas no coinciden.');
            return;
        }
        if (!reg.terminos) {
            setRegError('Debes aceptar los términos y condiciones.');
            return;
        }
        setRegLoading(true);
        try {
            const res = await fetch('/api/registro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: reg.nombre,
                    apellido: reg.apellido,
                    fechaNacimiento: reg.fechaNacimiento,
                    nacionalidad: reg.nacionalidad || null,
                    email: reg.email,
                    password: reg.password,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setRegError(data.error || 'Ocurrió un error inesperado. Intenta de nuevo.');
                setRegLoading(false);
                return;
            }
            setRegSuccess(reg.email);
            setRegLoading(false);
        } catch {
            setRegError('No se pudo conectar con el servidor.');
            setRegLoading(false);
        }
    };

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
                onClose();
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

    const handleClose = () => {
        setEmail('');
        setPassword('');
        setErrorMsg(null);
        setUnverifiedEmail(null);
        setResendStatus(null);
        setVista('login');
        setReg(REGISTRO_INICIAL);
        setRegError(null);
        setRegSuccess(null);
        onClose();
    };

    const handleBackToLogin = () => {
        setUnverifiedEmail(null);
        setResendStatus(null);
        setErrorMsg(null);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className={m.backdrop}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        onClick={handleClose}
                    />

                    {/* Popup zine */}
                    <motion.div
                        className={m.panel}
                        initial={{ scale: 0.85, opacity: 0, y: 24, rotate: -2 }}
                        animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 16 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    >
                        <button className={m.closeBtn} onClick={handleClose} aria-label="Cerrar">
                            <X size={20} />
                        </button>

                        <AnimatePresence mode="wait">
                            {regSuccess ? (
                                <motion.div
                                    key="regsuccess"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -16 }}
                                    transition={{ duration: 0.3 }}
                                    className={m.verifyBox}
                                >
                                    <div className={m.verifyIcon}>
                                        <MailCheck size={36} color="#ffd60a" />
                                    </div>
                                    <h2 className={m.verifyTitle}>¡Cuenta creada!</h2>
                                    <p className={m.verifyText}>
                                        Enviamos un enlace de verificación a <strong>{regSuccess}</strong>. Revisa tu bandeja y activa tu cuenta para iniciar sesión.
                                    </p>
                                    <button
                                        className={m.backBtn}
                                        onClick={() => { setRegSuccess(null); setVista('login'); }}
                                    >
                                        ← Ir al inicio de sesión
                                    </button>
                                </motion.div>
                            ) : vista === 'registro' ? (
                                <motion.div
                                    key="registroform"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -16 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <div className={m.header}>
                                        <span className={m.logoTag}>Bisonte Manga ✦</span>
                                        <h1 className={m.title}>CREAR CUENTA</h1>
                                        <span className={m.subtitle}>únete a la banda manga ✌️</span>
                                    </div>

                                    <form className={m.form} onSubmit={handleRegistro}>
                                        <div className={m.row}>
                                            <div className={m.field}>
                                                <label className={m.label} htmlFor="reg-nombre">Nombre</label>
                                                <input id="reg-nombre" name="nombre" type="text" className={m.input}
                                                    placeholder="Tu nombre" value={reg.nombre} onChange={handleRegChange}
                                                    required autoComplete="given-name" />
                                            </div>
                                            <div className={m.field}>
                                                <label className={m.label} htmlFor="reg-apellido">Apellido</label>
                                                <input id="reg-apellido" name="apellido" type="text" className={m.input}
                                                    placeholder="Tu apellido" value={reg.apellido} onChange={handleRegChange}
                                                    required autoComplete="family-name" />
                                            </div>
                                        </div>

                                        <div className={m.field}>
                                            <label className={m.label} htmlFor="reg-fecha">Fecha de nacimiento</label>
                                            <input id="reg-fecha" name="fechaNacimiento" type="date" className={m.input}
                                                value={reg.fechaNacimiento} onChange={handleRegChange} required
                                                max={new Date().toISOString().split('T')[0]} />
                                        </div>

                                        <div className={m.field}>
                                            <label className={m.label} htmlFor="reg-nacionalidad">Nacionalidad</label>
                                            <select id="reg-nacionalidad" name="nacionalidad" className={m.input}
                                                value={reg.nacionalidad} onChange={handleRegChange}>
                                                <option value="">Selecciona tu país</option>
                                                <option value="México">🇲🇽 México</option>
                                                <option value="Argentina">🇦🇷 Argentina</option>
                                                <option value="Chile">🇨🇱 Chile</option>
                                                <option value="Colombia">🇨🇴 Colombia</option>
                                                <option value="Perú">🇵🇪 Perú</option>
                                                <option value="Venezuela">🇻🇪 Venezuela</option>
                                                <option value="Ecuador">🇪🇨 Ecuador</option>
                                                <option value="Bolivia">🇧🇴 Bolivia</option>
                                                <option value="Uruguay">🇺🇾 Uruguay</option>
                                                <option value="Paraguay">🇵🇾 Paraguay</option>
                                                <option value="España">🇪🇸 España</option>
                                                <option value="Estados Unidos">🇺🇸 Estados Unidos</option>
                                                <option value="Otro">🌍 Otro</option>
                                            </select>
                                        </div>

                                        <div className={m.field}>
                                            <label className={m.label} htmlFor="reg-email">Correo electrónico</label>
                                            <input id="reg-email" name="email" type="email" className={m.input}
                                                placeholder="tucorreo@ejemplo.com" value={reg.email} onChange={handleRegChange}
                                                required autoComplete="email" />
                                        </div>

                                        <div className={m.field}>
                                            <label className={m.label} htmlFor="reg-password">Contraseña</label>
                                            <div className={m.passwordWrapper}>
                                                <input id="reg-password" name="password"
                                                    type={showRegPassword ? 'text' : 'password'} className={m.input}
                                                    placeholder="Mínimo 8 caracteres" value={reg.password} onChange={handleRegChange}
                                                    required minLength={8} autoComplete="new-password" />
                                                <button type="button" className={m.eyeBtn}
                                                    onClick={() => setShowRegPassword(!showRegPassword)} aria-label="Mostrar contraseña">
                                                    {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className={m.field}>
                                            <label className={m.label} htmlFor="reg-confirmar">Confirmar contraseña</label>
                                            <input id="reg-confirmar" name="confirmar" type="password" className={m.input}
                                                placeholder="Repite tu contraseña" value={reg.confirmar} onChange={handleRegChange}
                                                required autoComplete="new-password" />
                                        </div>

                                        <label className={m.checkboxLabel}>
                                            <input type="checkbox" name="terminos" checked={reg.terminos}
                                                onChange={handleRegChange} className={m.checkbox} />
                                            <span>
                                                Acepto los{' '}
                                                <Link href="/privacidad" target="_blank" className={m.termsLink}>
                                                    términos y condiciones
                                                </Link>
                                            </span>
                                        </label>

                                        {regError && (
                                            <motion.div className={m.errorMsg}
                                                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                                                {regError}
                                            </motion.div>
                                        )}

                                        <motion.button type="submit" className={m.submitBtn} disabled={regLoading}
                                            whileTap={{ scale: 0.97 }}>
                                            {regLoading ? (
                                                <span className={m.spinner} />
                                            ) : (
                                                <><UserPlus size={18} /> CREAR CUENTA</>
                                            )}
                                        </motion.button>
                                    </form>

                                    <div className={m.divider}>
                                        <span />
                                        <p>¿ya tienes cuenta?</p>
                                        <span />
                                    </div>

                                    <button className={m.registerBtn} onClick={() => setVista('login')}>
                                        INICIAR SESIÓN
                                    </button>
                                </motion.div>
                            ) : unverifiedEmail ? (
                                <motion.div
                                    key="unverified"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -16 }}
                                    transition={{ duration: 0.3 }}
                                    className={m.verifyBox}
                                >
                                    <div className={m.verifyIcon}>
                                        <MailWarning size={36} color="#ffd60a" />
                                    </div>
                                    <h2 className={m.verifyTitle}>Verifica tu correo</h2>
                                    <p className={m.verifyText}>
                                        Tu cuenta aún no está activada. Revisa tu bandeja de entrada en <strong>{unverifiedEmail}</strong> y haz clic en el enlace de verificación.
                                    </p>

                                    {resendStatus === 'sent' ? (
                                        <div className={m.resendSuccess}>
                                            ✅ Correo reenviado. Revisa tu bandeja.
                                        </div>
                                    ) : (
                                        <button
                                            className={m.resendBtn}
                                            onClick={handleResend}
                                            disabled={resendStatus === 'sending'}
                                        >
                                            {resendStatus === 'sending' ? (
                                                <><span className={m.spinner} /> Enviando...</>
                                            ) : (
                                                <><RefreshCw size={15} /> Reenviar correo</>
                                            )}
                                        </button>
                                    )}

                                    {resendStatus === 'error' && (
                                        <p className={m.resendError}>Error al enviar. Intenta más tarde.</p>
                                    )}

                                    <button className={m.backBtn} onClick={handleBackToLogin}>
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
                                    <div className={m.header}>
                                        <span className={m.logoTag}>Bisonte Manga ✦</span>
                                        <h1 className={m.title}>BIENVENIDO</h1>
                                        <span className={m.subtitle}>inicia sesión en tu cuenta</span>
                                    </div>

                                    <form className={m.form} onSubmit={handleSubmit}>
                                        <div className={m.field}>
                                            <label className={m.label} htmlFor="modal-email">
                                                Correo electrónico
                                            </label>
                                            <input
                                                id="modal-email"
                                                type="email"
                                                className={m.input}
                                                placeholder="tucorreo@ejemplo.com"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                required
                                                autoComplete="email"
                                            />
                                        </div>

                                        <div className={m.field}>
                                            <label className={m.label} htmlFor="modal-password">
                                                Contraseña
                                            </label>
                                            <div className={m.passwordWrapper}>
                                                <input
                                                    id="modal-password"
                                                    type={showPassword ? 'text' : 'password'}
                                                    className={m.input}
                                                    placeholder="••••••••"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    required
                                                    autoComplete="current-password"
                                                />
                                                <button
                                                    type="button"
                                                    className={m.eyeBtn}
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    aria-label="Mostrar contraseña"
                                                >
                                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className={m.forgotRow}>
                                            <Link href="/recuperar" className={m.forgot} onClick={handleClose}>
                                                ¿olvidaste tu contraseña?
                                            </Link>
                                        </div>

                                        {errorMsg && (
                                            <motion.div
                                                className={m.errorMsg}
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                            >
                                                {errorMsg}
                                            </motion.div>
                                        )}

                                        <motion.button
                                            type="submit"
                                            className={m.submitBtn}
                                            disabled={loading}
                                            whileTap={{ scale: 0.97 }}
                                        >
                                            {loading ? (
                                                <span className={m.spinner} />
                                            ) : (
                                                <>
                                                    <LogIn size={18} />
                                                    INICIAR SESIÓN
                                                </>
                                            )}
                                        </motion.button>
                                    </form>

                                    <div className={m.divider}>
                                        <span />
                                        <p>¿no tienes cuenta?</p>
                                        <span />
                                    </div>

                                    <button className={m.registerBtn} onClick={() => setVista('registro')}>
                                        CREAR CUENTA
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
