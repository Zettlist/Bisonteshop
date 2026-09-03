'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Eye, EyeOff, UserPlus, CheckCircle, MailCheck } from 'lucide-react';
import TerminosModal from '@/components/TerminosModal';
import styles from './registro.module.css';
import TipsOverlay from '@/components/TipsOverlay';

export default function RegistroPage() {
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(null); // { clientNumber }
    const [form, setForm] = useState({
        nombre: '',
        apellido: '',
        fechaNacimiento: '',
        nacionalidad: '',
        email: '',
        password: '',
        confirmar: '',
        terminos: false,
    });
    const [edadError, setEdadError] = useState('');
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
        setError('');
        setEdadError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Validar mayoría de edad
        if (form.fechaNacimiento) {
            const hoy = new Date();
            const nacimiento = new Date(form.fechaNacimiento);
            const edad = hoy.getFullYear() - nacimiento.getFullYear()
                - (hoy < new Date(hoy.getFullYear(), nacimiento.getMonth(), nacimiento.getDate()) ? 1 : 0);
            if (edad < 18) {
                setEdadError('Debes ser mayor de 18 años para registrarte.');
                return;
            }
        }
        if (form.password !== form.confirmar) {
            setError('Las contraseñas no coinciden.');
            return;
        }
        if (!form.terminos) {
            setError('Debes aceptar los términos y condiciones.');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/registro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: form.nombre,
                    apellido: form.apellido,
                    fechaNacimiento: form.fechaNacimiento,
                    nacionalidad: form.nacionalidad || null,
                    email: form.email,
                    password: form.password,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error || 'Ocurrió un error inesperado. Intenta de nuevo.');
                setLoading(false);
                return;
            }
            // Success!
            setSuccess({ clientNumber: data.clientNumber, email: form.email });
        } catch {
            setError('No se pudo conectar con el servidor. Verifica tu conexión.');
            setLoading(false);
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

            {/* Panel */}
            <motion.div
                className={styles.panel}
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
            >
                {success ? (
                    /* ── Pantalla de éxito ── */
                    <motion.div
                        className={styles.successScreen}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className={styles.successIcon}>
                            <MailCheck size={56} color="#f59e0b" strokeWidth={1.5} />
                        </div>
                        <h1 className={styles.successTitle}>¡Cuenta creada!</h1>
                        <p className={styles.successText}>
                            Enviamos un enlace de verificación a <strong>{success.email}</strong>.<br />
                            Revisa tu bandeja de entrada y activa tu cuenta para iniciar sesión.
                        </p>
                        <Link href="/" className={styles.submitBtn} style={{ textDecoration: 'none', textAlign: 'center', marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                            Ir a la tienda
                        </Link>
                    </motion.div>
                ) : (
                    /* ── Formulario de registro ── */
                    <>
                        <div className={styles.header}>
                            <Link href="/" className={styles.logoBack}>
                                <span className={styles.logoText}>Bisonte Manga</span>
                            </Link>
                            <h1 className={styles.title}>Crear Cuenta</h1>
                            <p className={styles.subtitle}>Únete a la comunidad manga</p>
                        </div>

                        <form className={styles.form} onSubmit={handleSubmit}>
                            {/* Nombre y Apellido */}
                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="nombre">Nombre</label>
                                    <input
                                        id="nombre"
                                        name="nombre"
                                        type="text"
                                        className={styles.input}
                                        placeholder="Tu nombre"
                                        value={form.nombre}
                                        onChange={handleChange}
                                        required
                                        autoComplete="given-name"
                                    />
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="apellido">Apellido</label>
                                    <input
                                        id="apellido"
                                        name="apellido"
                                        type="text"
                                        className={styles.input}
                                        placeholder="Tu apellido"
                                        value={form.apellido}
                                        onChange={handleChange}
                                        required
                                        autoComplete="family-name"
                                    />
                                </div>
                            </div>

                            {/* Fecha de nacimiento */}
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="fechaNacimiento">Fecha de nacimiento</label>
                                <input
                                    id="fechaNacimiento"
                                    name="fechaNacimiento"
                                    type="date"
                                    className={`${styles.input} ${edadError ? styles.inputError : ''}`}
                                    value={form.fechaNacimiento}
                                    onChange={handleChange}
                                    required
                                    max={new Date().toISOString().split('T')[0]}
                                />
                                {edadError && <p className={styles.fieldError}>{edadError}</p>}
                            </div>

                            {/* Nacionalidad */}
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="nacionalidad">Nacionalidad</label>
                                <select
                                    id="nacionalidad"
                                    name="nacionalidad"
                                    className={styles.input}
                                    value={form.nacionalidad}
                                    onChange={handleChange}
                                >
                                    <option value="">Selecciona tu país</option>
                                    <option value="México">México</option>
                                    <option value="Argentina">Argentina</option>
                                    <option value="Chile">Chile</option>
                                    <option value="Colombia">Colombia</option>
                                    <option value="Perú">Perú</option>
                                    <option value="Venezuela">Venezuela</option>
                                    <option value="Ecuador">Ecuador</option>
                                    <option value="Bolivia">Bolivia</option>
                                    <option value="Uruguay">Uruguay</option>
                                    <option value="Paraguay">Paraguay</option>
                                    <option value="España">España</option>
                                    <option value="Estados Unidos">Estados Unidos</option>
                                    <option value="Otro">Otro</option>
                                </select>
                            </div>

                            {/* Email */}
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="email">Correo electrónico</label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    className={styles.input}
                                    placeholder="tucorreo@ejemplo.com"
                                    value={form.email}
                                    onChange={handleChange}
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            {/* Password */}
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="password">Contraseña</label>
                                <div className={styles.passwordWrapper}>
                                    <input
                                        id="password"
                                        name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        className={styles.input}
                                        placeholder="Mínimo 8 caracteres"
                                        value={form.password}
                                        onChange={handleChange}
                                        required
                                        minLength={8}
                                        autoComplete="new-password"
                                    />
                                    <button type="button" className={styles.eyeBtn} onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar contraseña">
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* Confirmar */}
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="confirmar">Confirmar contraseña</label>
                                <div className={styles.passwordWrapper}>
                                    <input
                                        id="confirmar"
                                        name="confirmar"
                                        type={showConfirm ? 'text' : 'password'}
                                        className={styles.input}
                                        placeholder="Repite tu contraseña"
                                        value={form.confirmar}
                                        onChange={handleChange}
                                        required
                                        autoComplete="new-password"
                                    />
                                    <button type="button" className={styles.eyeBtn} onClick={() => setShowConfirm(!showConfirm)} aria-label="Mostrar confirmación">
                                        {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* Términos */}
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    name="terminos"
                                    checked={form.terminos}
                                    onChange={handleChange}
                                    className={styles.checkbox}
                                />
                                <span>
                                    Acepto los{' '}
                                    <button type="button" onClick={() => setShowTerms(true)} className={styles.termsLink}>términos y condiciones</button>
                                </span>
                            </label>

                            {/* Error */}
                            {error && <p className={styles.errorMsg}>{error}</p>}

                            {/* Submit */}
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
                                        <UserPlus size={18} />
                                        Crear cuenta
                                    </>
                                )}
                            </motion.button>
                        </form>

                        <div className={styles.divider}>
                            <span />
                            <p>¿Ya tienes cuenta?</p>
                            <span />
                        </div>

                        <Link href="/?login=1" className={styles.loginBtn}>
                            Iniciar sesión
                        </Link>

                        {/* Alta con Google: manda al inicio con el modal abierto,
                            que es donde vive el flujo completo (incluido el paso
                            de la fecha de nacimiento). */}
                        <Link href="/?login=1" className={styles.loginBtn} style={{ marginTop: '0.6rem' }}>
                            Continuar con Google
                        </Link>

                        <p className={styles.back}>
                            <Link href="/">← Volver a la tienda</Link>
                        </p>
                        
                        {/* Terminos y Condiciones: modal compartido con el popup de login */}
                        <TerminosModal
                            abierto={showTerms}
                            onCerrar={() => setShowTerms(false)}
                            onAceptar={() => setForm(f => ({ ...f, terminos: true }))}
                        />
                    </>
                )}
            </motion.div>
        </div>
    );
}
