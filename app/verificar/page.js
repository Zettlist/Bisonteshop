'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, MailWarning } from 'lucide-react';
import Link from 'next/link';
import styles from './verificar.module.css';

function VerificarContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    const [status, setStatus] = useState('loading'); // loading | success | error | expired | already
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMsg('No se proporcionó un token de verificación.');
            return;
        }

        fetch(`/api/verificar?token=${token}`)
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    setStatus(data.alreadyVerified ? 'already' : 'success');
                } else if (data.expired) {
                    setStatus('expired');
                } else {
                    setStatus('error');
                    setErrorMsg(data.error || 'Token inválido.');
                }
            })
            .catch(() => {
                setStatus('error');
                setErrorMsg('Error de conexión.');
            });
    }, [token]);

    // Auto-redirect on success
    useEffect(() => {
        if (status === 'success') {
            const timer = setTimeout(() => router.push('/login'), 3500);
            return () => clearTimeout(timer);
        }
    }, [status, router]);

    return (
        <div className={styles.page}>
            <motion.div
                className={styles.card}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
                <div className={styles.logo}>BISONTE MANGA</div>

                {status === 'loading' && (
                    <div className={styles.content}>
                        <Loader2 className={styles.iconSpin} size={48} />
                        <h1 className={styles.title}>Verificando tu cuenta...</h1>
                        <p className={styles.subtitle}>Un momento, por favor.</p>
                    </div>
                )}

                {status === 'success' && (
                    <div className={styles.content}>
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
                            <CheckCircle className={styles.iconSuccess} size={56} />
                        </motion.div>
                        <h1 className={styles.title}>¡Cuenta verificada!</h1>
                        <p className={styles.subtitle}>Tu correo fue confirmado correctamente.<br />Serás redirigido al inicio de sesión.</p>
                        <Link href="/login" className={styles.btn}>Iniciar sesión ahora</Link>
                    </div>
                )}

                {status === 'already' && (
                    <div className={styles.content}>
                        <CheckCircle className={styles.iconSuccess} size={56} />
                        <h1 className={styles.title}>Ya estás verificado</h1>
                        <p className={styles.subtitle}>Tu cuenta ya había sido confirmada anteriormente.</p>
                        <Link href="/login" className={styles.btn}>Iniciar sesión</Link>
                    </div>
                )}

                {status === 'expired' && (
                    <div className={styles.content}>
                        <MailWarning className={styles.iconWarn} size={56} />
                        <h1 className={styles.title}>Enlace expirado</h1>
                        <p className={styles.subtitle}>El enlace de verificación caducó (válido 24 h).<br />Solicita uno nuevo desde la pantalla de inicio de sesión.</p>
                        <Link href="/login" className={styles.btn}>Ir al login</Link>
                    </div>
                )}

                {status === 'error' && (
                    <div className={styles.content}>
                        <XCircle className={styles.iconError} size={56} />
                        <h1 className={styles.title}>Enlace inválido</h1>
                        <p className={styles.subtitle}>{errorMsg}</p>
                        <Link href="/login" className={styles.btn}>Ir al login</Link>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

export default function VerificarPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={40} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
        }>
            <VerificarContent />
        </Suspense>
    );
}
