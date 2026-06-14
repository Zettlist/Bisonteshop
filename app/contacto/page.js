'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send } from 'lucide-react';
import styles from './contacto.module.css';

const TEMAS = {
    devoluciones: { etiqueta: '🔄 DEVOLUCIONES', titulo: 'DEVOLUCIONES', sub: 'si algo llegó mal, lo arreglamos 🤝' },
    contacto: { etiqueta: '✉️ CONTACTO', titulo: 'CONTACTO', sub: 'escríbenos lo que sea, leemos todo ✌️' },
};

function FormularioContacto() {
    const searchParams = useSearchParams();
    const temaInicial = TEMAS[searchParams.get('tema')] ? searchParams.get('tema') : 'contacto';

    const [tema, setTema] = useState(temaInicial);
    const [form, setForm] = useState({ nombre: '', email: '', pedido: '', mensaje: '' });
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');
    const [enviado, setEnviado] = useState(false);

    const handleChange = (e) => {
        setForm(f => ({ ...f, [e.target.name]: e.target.value }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setEnviando(true);
        setError('');
        try {
            const res = await fetch('/api/contacto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tema, ...form }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'No se pudo enviar. Intenta de nuevo.');
                setEnviando(false);
                return;
            }
            setEnviado(true);
            setEnviando(false);
        } catch {
            setError('Error de conexión. Intenta más tarde.');
            setEnviando(false);
        }
    };

    const cfg = TEMAS[tema];

    return (
        <div className={styles.wrapper}>
            <div className={styles.card}>
                {/* Mascota a la izquierda */}
                <div className={styles.lado}>
                    <img src="/logo.png" alt="Bisonte Manga" className={styles.ladoLogo} />
                    <span className={styles.ladoTexto}>¡te leemos!<br />— el equipo Bisonte</span>
                    <img src="/mail-mascota.webp" alt="Mascota Bisonte" className={styles.mascota} />
                </div>

                {/* Formulario */}
                <div className={styles.formLado}>
                    {enviado ? (
                        <div className={styles.exito}>
                            <div className={styles.exitoIcono}>📬</div>
                            <h2 className={styles.exitoTitulo}>¡MENSAJE ENVIADO!</h2>
                            <p className={styles.exitoTexto}>
                                Tu mensaje llegó al equipo de <strong>{cfg.titulo.toLowerCase()}</strong>.
                                Te respondemos a <strong>{form.email}</strong> lo antes posible.
                            </p>
                            <button
                                className={styles.exitoBtn}
                                onClick={() => {
                                    setEnviado(false);
                                    setForm({ nombre: '', email: '', pedido: '', mensaje: '' });
                                }}
                            >
                                ENVIAR OTRO
                            </button>
                        </div>
                    ) : (
                        <>
                            <span className={styles.logoTag}>Bisonte Manga ✦</span>
                            <h1 className={styles.titulo}>{cfg.titulo}</h1>
                            <span className={styles.subtitulo}>{cfg.sub}</span>

                            <div className={styles.temas}>
                                {Object.entries(TEMAS).map(([key, t]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        className={`${styles.tema} ${tema === key ? styles.temaActivo : ''}`}
                                        onClick={() => setTema(key)}
                                    >
                                        {t.etiqueta}
                                    </button>
                                ))}
                            </div>

                            <form className={styles.form} onSubmit={handleSubmit}>
                                <div className={styles.row}>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="ct-nombre">Nombre</label>
                                        <input id="ct-nombre" name="nombre" type="text" className={styles.input}
                                            placeholder="Tu nombre" value={form.nombre} onChange={handleChange}
                                            required maxLength={80} />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="ct-email">Correo</label>
                                        <input id="ct-email" name="email" type="email" className={styles.input}
                                            placeholder="tucorreo@ejemplo.com" value={form.email} onChange={handleChange}
                                            required />
                                    </div>
                                </div>

                                {tema === 'devoluciones' && (
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="ct-pedido"># de pedido (opcional)</label>
                                        <input id="ct-pedido" name="pedido" type="text" className={styles.input}
                                            placeholder="ej. BM-1042" value={form.pedido} onChange={handleChange}
                                            maxLength={40} />
                                    </div>
                                )}

                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="ct-mensaje">Mensaje</label>
                                    <textarea id="ct-mensaje" name="mensaje" className={styles.textarea}
                                        placeholder="Cuéntanos con detalle…" value={form.mensaje} onChange={handleChange}
                                        required maxLength={4000} />
                                </div>

                                {error && <div className={styles.error}>{error}</div>}

                                <button type="submit" className={styles.submit} disabled={enviando}>
                                    <Send size={17} />
                                    {enviando ? 'ENVIANDO…' : 'ENVIAR MENSAJE'}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function ContactoPage() {
    return (
        <Suspense fallback={null}>
            <FormularioContacto />
        </Suspense>
    );
}
