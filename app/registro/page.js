'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Eye, EyeOff, UserPlus, CheckCircle, MailCheck } from 'lucide-react';
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
                        <Link href="/login" className={styles.submitBtn} style={{ textDecoration: 'none', textAlign: 'center', marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                            Ir al inicio de sesión
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

                        <Link href="/login" className={styles.loginBtn}>
                            Iniciar sesión
                        </Link>

                        <p className={styles.back}>
                            <Link href="/">← Volver a la tienda</Link>
                        </p>
                        
                        {/* ── Modal de Términos y Condiciones ── */}
                        {showTerms && (
                            <div className={styles.termsOverlay} onClick={() => setShowTerms(false)}>
                                <motion.div 
                                    className={styles.termsModal}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className={styles.termsHeader}>
                                        <h2>Términos y Condiciones</h2>
                                        <button className={styles.closeTermsBtn} onClick={() => setShowTerms(false)}>×</button>
                                    </div>
                                    <div className={styles.termsContent}>
                                        <div className={styles.termsContentBody}>
                                            <h3 className={styles.termsMainTitle}>TÉRMINOS Y CONDICIONES BISONTE MANGA</h3>
                                            <p className={styles.termsDate}>Última actualización: Marzo 2026</p>
                                            
                                            <h4 className={styles.termsHeading}>1. ACEPTACIÓN DE LOS TÉRMINOS</h4>
                                            <p>Al acceder y utilizar el sitio web de BISONTE MANGA, el usuario acepta quedar vinculado por los presentes Términos y Condiciones, así como por la Política de Privacidad y demás disposiciones aplicables. Si el usuario no está de acuerdo con alguno de estos términos, deberá abstenerse de utilizar el sitio.</p>
                                            
                                            <h4 className={styles.termsHeading}>2. IDENTIFICACIÓN DE LA EMPRESA</h4>
                                            <p>BISONTE MANGA es una tienda en línea dedicada a la comercialización de manga, artículos de colección y productos relacionados, incluyendo mercancía de importación adquirida de distribuidores nacionales e internacionales. Los productos ofrecidos son artículos originales obtenidos mediante canales de compra legítimos.</p>
                                            
                                            <h4 className={styles.termsHeading}>3. PRODUCTOS Y DISPONIBILIDAD</h4>
                                            <p>3.1 Los productos publicados en el sitio están sujetos a disponibilidad de inventario. BISONTE MANGA se reserva el derecho de modificar el catálogo sin previo aviso.</p>
                                            <p>3.2 Algunos productos son ediciones de importación, lo que implica que el contenido puede estar en idioma original (japonés u otro) o en ediciones publicadas para otros mercados. Esto se indica en la descripción de cada producto.</p>
                                            <p>3.3 Las imágenes de portada utilizadas en las fichas de producto tienen únicamente fines descriptivos e identificativos del artículo que se comercializa.</p>
                                            
                                            <h4 className={styles.termsHeading}>4. PRECIOS Y PAGOS</h4>
                                            <p>4.1 Todos los precios publicados incluyen IVA conforme a la legislación fiscal mexicana vigente.</p>
                                            <p>4.2 BISONTE MANGA se reserva el derecho de modificar los precios en cualquier momento. El precio aplicable será el vigente al momento de confirmar la orden de compra.</p>
                                            <p>4.3 Los métodos de pago aceptados se especifican en el proceso de compra. BISONTE MANGA no almacena datos bancarios del usuario.</p>
                                            
                                            <h4 className={styles.termsHeading}>5. ENVÍOS Y ENTREGAS</h4>
                                            <p>5.1 Los envíos se realizan a la dirección proporcionada por el usuario al momento de la compra. BISONTE MANGA no se hace responsable por errores en la dirección indicada.</p>
                                            <p>5.2 Los tiempos de entrega son estimados y pueden variar por causas ajenas a BISONTE MANGA, incluyendo demoras de la paquetería o situaciones de fuerza mayor.</p>
                                            <p>5.3 El costo de envío se calcula y muestra antes de confirmar la compra.</p>
                                            
                                            <h4 className={styles.termsHeading}>6. DEVOLUCIONES Y GARANTÍAS</h4>
                                            <p>6.1 Se aceptan devoluciones dentro de los 30 días naturales siguientes a la recepción del producto, siempre que:</p>
                                            <ul>
                                                <li>El producto presente defecto de fábrica o daño en el envío.</li>
                                                <li>El producto recibido no corresponda al artículo pedido.</li>
                                                <li>El producto se encuentre sin abrir y en su empaque original (para casos de arrepentimiento de compra).</li>
                                            </ul>
                                            <p>6.2 Para iniciar una devolución, el usuario debe contactar a BISONTE MANGA a través de los canales de atención indicados en el sitio, adjuntando evidencia fotográfica en caso de daño.</p>
                                            <p>6.3 Los gastos de envío por devolución corren a cargo del comprador, salvo en caso de error o defecto imputable a BISONTE MANGA.</p>
                                            
                                            <h4 className={styles.termsHeading}>7. PROPIEDAD INTELECTUAL</h4>
                                            <p>Todo el contenido publicado en el sitio web (logotipos, código fuente, diseño gráfico, textos, catálogo de productos y precios) es propiedad exclusiva de BISONTE MANGA o de sus licenciantes, y está protegido por la Ley Federal del Derecho de Autor y demás legislación aplicable. Queda estrictamente prohibido:</p>
                                            <ul>
                                                <li>La extracción automatizada o manual de datos, imágenes o contenido con fines comerciales.</li>
                                                <li>La reproducción, copia o distribución no autorizada del diseño o contenido del sitio.</li>
                                                <li>El uso de técnicas de scraping, crawling o cualquier método de extracción masiva de datos.</li>
                                            </ul>
                                            <p>Cualquier uso autorizado requerirá autorización expresa y por escrito del titular de los derechos.</p>

                                            <h4 className={styles.termsHeading}>8. PROTECCIÓN DE DATOS PERSONALES</h4>
                                            <p>El tratamiento de los datos personales del usuario se realiza conforme a lo establecido en la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento. El Aviso de Privacidad completo está disponible en el sitio web. Los datos recabados se utilizan exclusivamente para la gestión de pedidos, atención al cliente y mejora del servicio.</p>

                                            <h4 className={styles.termsHeading}>9. LIMITACIÓN DE RESPONSABILIDAD</h4>
                                            <p>BISONTE MANGA no será responsable por:</p>
                                            <ul>
                                                <li>Daños derivados del mal uso de los productos adquiridos.</li>
                                                <li>Interrupciones del servicio por mantenimiento, causas técnicas o fuerza mayor.</li>
                                                <li>Diferencias de percepción de color entre la imagen del sitio y el producto físico, inherentes a la reproducción digital.</li>
                                            </ul>
                                            <p>En ningún caso la responsabilidad de BISONTE MANGA excederá el monto pagado por el usuario en la transacción que originó el reclamo.</p>

                                            <h4 className={styles.termsHeading}>10. MODIFICACIONES A LOS TÉRMINOS</h4>
                                            <p>BISONTE MANGA se reserva el derecho de actualizar los presentes Términos y Condiciones en cualquier momento. Los cambios entrarán en vigor a partir de su publicación en el sitio. El uso continuado del sitio tras la publicación de modificaciones implica la aceptación de los nuevos términos.</p>

                                            <h4 className={styles.termsHeading}>11. LEGISLACIÓN APLICABLE Y JURISDICCIÓN</h4>
                                            <p>Los presentes Términos y Condiciones se rigen por las leyes vigentes en los Estados Unidos Mexicanos. Para la resolución de cualquier controversia derivada del uso del sitio o de las transacciones realizadas, las partes se someten a la jurisdicción de los tribunales competentes, renunciando a cualquier otro fuero que pudiera corresponderles.</p>

                                            <h4 className={styles.termsHeading}>12. CONTACTO</h4>
                                            <p>Para cualquier duda, aclaración o ejercicio de derechos relacionados con estos Términos y Condiciones, el usuario puede comunicarse a través de los canales de atención disponibles en el sitio web de BISONTE MANGA.</p>

                                            <div className={styles.termsCopyright}>© 2026 BISONTE MANGA – Todos los derechos reservados</div>
                                        </div>
                                    </div>
                                    <div className={styles.termsFooter}>
                                        <button className={styles.btnAcceptTerms} onClick={() => {
                                            setForm(f => ({ ...f, terminos: true }));
                                            setShowTerms(false);
                                        }}>
                                            Aceptar Términos
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </>
                )}
            </motion.div>
        </div>
    );
}
