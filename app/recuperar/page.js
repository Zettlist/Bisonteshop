'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, KeyRound, MailCheck } from 'lucide-react';
import Link from 'next/link';
import styles from './recuperar.module.css';

/**
 * Las dos mitades del tramite viven en la misma direccion.
 *
 * Sin `?token` es el formulario para pedir el enlace; con `?token`, el de poner
 * la contrasena nueva, que es a donde lleva el correo. Una sola ruta porque para
 * quien la usa es un solo tramite, y porque el enlace del modal de acceso puede
 * apuntar siempre al mismo sitio.
 */
function RecuperarContent() {
    const token = useSearchParams().get('token');
    return token ? <PonerNueva token={token} /> : <PedirEnlace />;
}

// ── Paso 1: pedir el enlace ─────────────────────────────────────────────────
function PedirEnlace() {
    const [email, setEmail] = useState('');
    const [estado, setEstado] = useState('form'); // form | enviando | enviado
    const [error, setError] = useState(null);

    const enviar = async (e) => {
        e.preventDefault();
        setEstado('enviando');
        setError(null);
        try {
            const res = await fetch('/api/recuperar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'No pudimos enviar el enlace.');
                setEstado('form');
                return;
            }
            setEstado('enviado');
        } catch {
            setError('Error de conexión. Inténtalo de nuevo.');
            setEstado('form');
        }
    };

    if (estado === 'enviado') {
        return (
            <div className={styles.content}>
                <MailCheck size={44} className={styles.iconSuccess} />
                <h1 className={styles.title}>Revisa tu correo</h1>
                {/* «Si ese correo tiene cuenta» y no «te lo enviamos»: la ruta
                    responde igual exista o no la cuenta, para no ir revelando
                    quien es cliente. El texto tiene que decir la verdad. */}
                <p className={styles.subtitle}>
                    Si ese correo tiene una cuenta, le acabamos de mandar un enlace
                    para poner una contraseña nueva. Caduca en una hora.
                </p>
                <p className={styles.subtitle}>
                    ¿No llega? Mira en spam antes de volver a pedirlo.
                </p>
                <Link href="/" className={styles.volver}>Volver a la tienda</Link>
            </div>
        );
    }

    return (
        <div className={styles.content}>
            <KeyRound size={44} className={styles.iconWarn} />
            <h1 className={styles.title}>¿Olvidaste tu contraseña?</h1>
            <p className={styles.subtitle}>
                Escribe tu correo y te mandamos un enlace para poner una nueva.
            </p>

            <form className={styles.form} onSubmit={enviar}>
                <label className={styles.campo}>
                    <span>Correo electrónico</span>
                    <input
                        className={styles.input}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@correo.com"
                        autoComplete="email"
                        required
                    />
                </label>

                {error && <p className={styles.error}>{error}</p>}

                <button className={styles.btn} type="submit" disabled={estado === 'enviando'}>
                    {estado === 'enviando' ? 'Enviando…' : 'Enviarme el enlace'}
                </button>
            </form>

            <Link href="/" className={styles.volver}>Volver a la tienda</Link>
        </div>
    );
}

// ── Paso 2: poner la contrasena nueva ───────────────────────────────────────
function PonerNueva({ token }) {
    const router = useRouter();
    const [estado, setEstado] = useState('comprobando'); // comprobando | form | guardando | listo | malo
    const [password, setPassword] = useState('');
    const [repetida, setRepetida] = useState('');
    const [error, setError] = useState(null);

    // Se comprueba el enlace ANTES de pedir nada. Rellenar dos campos para que
    // al final te digan que el enlace habia caducado es la peor version de esto.
    useEffect(() => {
        let vivo = true;
        fetch(`/api/recuperar/confirmar?token=${encodeURIComponent(token)}`)
            .then((r) => r.json())
            .then((d) => { if (vivo) setEstado(d.success ? 'form' : 'malo'); })
            .catch(() => { if (vivo) setEstado('malo'); });
        return () => { vivo = false; };
    }, [token]);

    useEffect(() => {
        if (estado !== 'listo') return;
        const t = setTimeout(() => router.push('/?login=1'), 3000);
        return () => clearTimeout(t);
    }, [estado, router]);

    const guardar = async (e) => {
        e.preventDefault();
        if (password !== repetida) {
            setError('Las dos contraseñas no coinciden.');
            return;
        }
        setEstado('guardando');
        setError(null);
        try {
            const res = await fetch('/api/recuperar/confirmar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'No pudimos cambiar tu contraseña.');
                setEstado('form');
                return;
            }
            setEstado('listo');
        } catch {
            setError('Error de conexión. Inténtalo de nuevo.');
            setEstado('form');
        }
    };

    if (estado === 'comprobando') {
        return (
            <div className={styles.content}>
                <Loader2 size={44} className={styles.iconSpin} />
                <p className={styles.subtitle}>Comprobando el enlace…</p>
            </div>
        );
    }

    if (estado === 'malo') {
        return (
            <div className={styles.content}>
                <XCircle size={44} className={styles.iconError} />
                <h1 className={styles.title}>Este enlace ya no sirve</h1>
                <p className={styles.subtitle}>
                    Puede que haya caducado, que ya lo hayas usado o que se haya pedido
                    uno más nuevo. Pide otro y listo.
                </p>
                <Link href="/recuperar" className={styles.btn}>Pedir un enlace nuevo</Link>
            </div>
        );
    }

    if (estado === 'listo') {
        return (
            <div className={styles.content}>
                <CheckCircle size={44} className={styles.iconSuccess} />
                <h1 className={styles.title}>Contraseña cambiada</h1>
                <p className={styles.subtitle}>
                    Ya puedes entrar con la nueva. Cerramos las demás sesiones que
                    hubiera abiertas, por si acaso.
                </p>
                <Link href="/?login=1" className={styles.btn}>Iniciar sesión</Link>
            </div>
        );
    }

    return (
        <div className={styles.content}>
            <KeyRound size={44} className={styles.iconWarn} />
            <h1 className={styles.title}>Elige una contraseña nueva</h1>

            <form className={styles.form} onSubmit={guardar}>
                <label className={styles.campo}>
                    <span>Contraseña nueva</span>
                    <input
                        className={styles.input}
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                    />
                </label>
                <p className={styles.pista}>Entre 8 y 128 caracteres, con al menos una letra y un número.</p>

                <label className={styles.campo}>
                    <span>Repítela</span>
                    <input
                        className={styles.input}
                        type="password"
                        value={repetida}
                        onChange={(e) => setRepetida(e.target.value)}
                        autoComplete="new-password"
                        required
                    />
                </label>

                {error && <p className={styles.error}>{error}</p>}

                <button className={styles.btn} type="submit" disabled={estado === 'guardando'}>
                    {estado === 'guardando' ? 'Guardando…' : 'Guardar contraseña'}
                </button>
            </form>
        </div>
    );
}

export default function Recuperar() {
    return (
        <div className={styles.page}>
            <motion.div
                className={styles.card}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
                <div className={styles.logo}>BISONTE MANGA</div>
                <Suspense fallback={<div className={styles.content}><Loader2 size={44} className={styles.iconSpin} /></div>}>
                    <RecuperarContent />
                </Suspense>
            </motion.div>
        </div>
    );
}
