'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import styles from './CompletarPerfil.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Aviso de cuenta incompleta.
//
// Las cuentas creadas con Google entran sin fecha de nacimiento (Google no la
// comparte). Se les crea igual para no frenar el alta, pero la tienda es 18+ y
// sin esa fecha NO se puede comprar — el corte de verdad esta en el servidor
// (/api/checkout), esto es el aviso para que la completen.
//
// Se puede posponer, pero vuelve a aparecer en la siguiente carga: no es un
// aviso que se pueda descartar para siempre.
// ─────────────────────────────────────────────────────────────────────────────
export default function CompletarPerfil() {
    const { user, isAuthenticated, setUser, _hydrated } = useAuthStore();
    const [abierto, setAbierto] = useState(false);
    const [pospuesto, setPospuesto] = useState(false);
    const [fecha, setFecha] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);
    const router = useRouter();

    const faltaFecha = _hydrated && isAuthenticated && user && !user.fecha_nac;
    if (!faltaFecha) return null;

    const guardar = async (e) => {
        e.preventDefault();
        setError(null);
        setGuardando(true);
        try {
            const res = await fetch('/api/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fecha_nac: fecha }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'No se pudo guardar.');
                setGuardando(false);
                return;
            }
            setUser(data.user);
            setAbierto(false);
            router.refresh();
        } catch {
            setError('Error de conexión. Intenta más tarde.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <>
            {/* Barra de aviso */}
            <AnimatePresence>
                {!pospuesto && !abierto && (
                    <motion.div
                        className={styles.barra}
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <span className={styles.icono}><CalendarClock size={18} /></span>
                        <p className={styles.texto}>
                            <strong>Falta un dato en tu cuenta.</strong>{' '}
                            Agrega tu fecha de nacimiento para poder comprar.
                        </p>
                        <button className={styles.completar} onClick={() => setAbierto(true)}>
                            Completar
                        </button>
                        <button
                            className={styles.posponer}
                            onClick={() => setPospuesto(true)}
                            aria-label="Ahora no"
                            title="Ahora no (volverá a aparecer)"
                        >
                            <X size={16} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Ventana para capturarla */}
            <AnimatePresence>
                {abierto && (
                    <>
                        <motion.div
                            className={styles.fondo}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setAbierto(false)}
                        />
                        <motion.div
                            className={styles.ventana}
                            initial={{ opacity: 0, y: 20, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.97 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <button
                                className={styles.cerrar}
                                onClick={() => setAbierto(false)}
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>

                            <h3 className={styles.titulo}>Termina de configurar tu cuenta</h3>
                            <p className={styles.detalle}>
                                Entraste con Google y no nos comparte tu fecha de nacimiento.
                                La necesitamos porque la tienda es solo para mayores de 18.
                            </p>

                            <form onSubmit={guardar} className={styles.forma}>
                                <label className={styles.etiqueta} htmlFor="fecha-nac">
                                    Fecha de nacimiento
                                </label>
                                <input
                                    id="fecha-nac"
                                    type="date"
                                    className={styles.campo}
                                    value={fecha}
                                    onChange={(e) => { setFecha(e.target.value); setError(null); }}
                                    required
                                />

                                {error && <p className={styles.error}>{error}</p>}

                                <button type="submit" className={styles.guardar} disabled={guardando || !fecha}>
                                    {guardando ? 'Guardando…' : 'Guardar y continuar'}
                                </button>
                            </form>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
