'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import LoginModal from '@/components/LoginModal';
import { EVENTOS, eventoActivo } from '@/lib/eventos';
import { MX as FlagMX, KR as FlagKR } from 'country-flag-icons/react/3x2';
import styles from './MundialWidget.module.css';

const CFG = EVENTOS.mundial2026;
const DISMISS_KEY = 'mundial2026-cerrado';
const FLAGS = { MX: FlagMX, KR: FlagKR };

function formatRestante(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function Bandera({ opcion, className }) {
    const F = FLAGS[CFG.opciones[opcion]?.iso];
    return F ? <F className={className || styles.flag} /> : null;
}

export default function MundialWidget() {
    const [activo, setActivo] = useState(false);
    const [abierto, setAbierto] = useState(false); // arranca cerrado: entra como teaser
    const [listo, setListo] = useState(false);     // gate: mostrar nada hasta los 2s
    const [teaser, setTeaser] = useState(false);   // bocadillo cómic
    const [data, setData] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');
    const [showLogin, setShowLogin] = useState(false);
    const [restante, setRestante] = useState(null);

    // Mascota: en /adultos usa la Bisonta +18, fuera usa la mascota normal.
    // Los votos van a la misma base de datos sin importar la sección.
    const pathname = usePathname();
    const esAdultos = pathname?.startsWith('/adultos');
    const mascotaSrc = esAdultos ? '/bisonta-adultos.png' : '/mundial-mascota.webp';

    const cargar = useCallback(() => {
        fetch('/api/eventos/mundial')
            .then(r => r.json())
            .then(d => { if (d.success) setData(d); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        // eventoActivo se evalúa en el cliente para que el widget muera solo al pasar la fecha
        if (!eventoActivo('mundial2026')) return;
        setActivo(true);
        cargar();
        // A los 2s entra la Bisonta deslizándose desde la derecha + bocadillo cómic
        const teaserT = setTimeout(() => { setListo(true); setTeaser(true); }, 2000);
        // Casi tiempo real: poll cada 5s, pausado si la pestaña no está visible
        const t = setInterval(() => {
            if (document.visibilityState === 'visible') cargar();
        }, 5000);
        const onVisible = () => { if (document.visibilityState === 'visible') cargar(); };
        document.addEventListener('visibilitychange', onVisible);
        // Cuenta regresiva al cierre de votación (cada segundo)
        const cierre = new Date(CFG.cierreVotacion).getTime();
        const tickCuenta = () => setRestante(Math.max(0, cierre - Date.now()));
        tickCuenta();
        const tc = setInterval(tickCuenta, 1000);
        return () => {
            clearInterval(t);
            clearInterval(tc);
            clearTimeout(teaserT);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [cargar]);

    if (!activo) return null;

    const cerrar = () => {
        localStorage.setItem(DISMISS_KEY, '1');
        setAbierto(false);
    };

    const reabrir = () => {
        localStorage.removeItem(DISMISS_KEY);
        setTeaser(false);
        setAbierto(true);
    };

    const votar = async (opcion) => {
        // La verdad de la sesión la tiene el servidor (data.logueado),
        // el store local puede quedar desfasado si la cookie expiró.
        if (data && !data.logueado) {
            setShowLogin(true);
            return;
        }
        setEnviando(true);
        setError('');
        try {
            const r = await fetch('/api/eventos/mundial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ opcion }),
            });
            if (r.status === 401) {
                setShowLogin(true);
                return;
            }
            const d = await r.json();
            if (!d.success) setError(d.error || 'No se pudo votar.');
            cargar();
        } catch {
            setError('Error de conexión.');
        } finally {
            setEnviando(false);
        }
    };

    const conteos = data?.conteos || { mexico: 0, corea: 0 };
    const total = conteos.mexico + conteos.corea;
    // Sin votos: 50/50. Con votos: proporción real (mínimo 8% para que siempre se vea la franja)
    const pctMx = total === 0 ? 50 : Math.max(8, Math.min(92, Math.round((conteos.mexico / total) * 100)));
    const pctRsa = 100 - pctMx;

    const miVoto = data?.miVoto;
    const ganador = data?.ganador;
    const votacion = data?.votacionAbierta;

    return (
        <>
        <AnimatePresence mode="wait">
        {!listo ? null : !abierto ? (
            <motion.div
                key="mini"
                className={styles.miniWrap}
                initial={{ x: 180, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 180, opacity: 0, transition: { duration: 0.22 } }}
                transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            >
                <AnimatePresence>
                    {teaser && (
                        <motion.div
                            key="teaser"
                            className={styles.miniTeaser}
                            initial={{ opacity: 0, scale: 0.4, x: 25 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.4, x: 25, transition: { duration: 0.18 } }}
                            transition={{ type: 'spring', stiffness: 320, damping: 17, delay: 0.45 }}
                        >
                            ¡Hay evento! click en mí para saber :3
                        </motion.div>
                    )}
                </AnimatePresence>
                <button
                    className={styles.miniBtn}
                    onClick={reabrir}
                    aria-label="Abrir votación del Mundial"
                >
                    <img src="/bisonta-noti.png" alt="" className={styles.miniImg} />
                </button>
            </motion.div>
        ) : (
        <motion.div
            key="widget"
            className={styles.widget}
            style={{ transformOrigin: 'bottom right' }}
            initial={{ opacity: 0, y: 24, scale: 0.9, rotate: 2 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, y: 26, scale: 0.45, rotate: 3, transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
            <img src={mascotaSrc} alt="" className={styles.mascota} />
            <button className={styles.closeBtn} onClick={cerrar} aria-label="Cerrar">✕</button>

            <div className={styles.titleRow}>
                <span className={styles.title}>¿QUIÉN GANA?</span>
            </div>
            <span className={styles.subtitle}>Mundial 2026 · fase de grupos</span>

            {/* Cuenta regresiva — cierra 7:00 pm CDMX, 18 jun 2026 */}
            {!ganador && votacion && restante !== null && restante > 0 && (
                <div className={styles.countdown}>
                    <span className={styles.countLabel}>⏱ la votación cierra en</span>
                    <span className={styles.countDigits}>{formatRestante(restante)}</span>
                </div>
            )}

            {/* Barra versus — una sola línea, crece el que va ganando */}
            <div className={styles.vsLabels}>
                <span className={styles.teamMx}><Bandera opcion="mexico" /> México</span>
                <span className={styles.teamRsa}>Corea del Sur <Bandera opcion="corea" /></span>
            </div>
            {/* Sin números: solo la proporción visual de la barra */}
            <div className={styles.vsBar}>
                <div className={styles.vsMx} style={{ width: `${pctMx}%` }} />
                <div className={styles.vsRsa} style={{ width: `${pctRsa}%` }} />
            </div>
            <span className={styles.totalVotos}>la barra muestra quién va ganando 👀</span>

            {/* Resultado publicado */}
            {ganador ? (
                <div className={styles.resultado}>
                    <strong>Ganó <Bandera opcion={ganador} /> {CFG.opciones[ganador].nombre}</strong>
                    {data?.codigo ? (
                        <div className={styles.codigoBox}>
                            🎉 ¡Le atinaste! Tu código:
                            <code>{data.codigo}</code>
                        </div>
                    ) : miVoto ? (
                        <span className={styles.perdiste}>esta vez no atinaste 😅</span>
                    ) : null}
                </div>
            ) : miVoto ? (
                <div className={styles.yaVotaste}>
                    Tu voto: <Bandera opcion={miVoto} /> {CFG.opciones[miVoto].nombre} ✔
                    <span>si gana, te llevas un código de descuento</span>
                </div>
            ) : votacion ? (
                <>
                    <div className={styles.botones}>
                        <button
                            className={`${styles.btnVoto} ${styles.btnMx}`}
                            onClick={() => votar('mexico')}
                            disabled={enviando}
                            aria-label="Votar por México"
                        >
                            <Bandera opcion="mexico" className={styles.flagBtn} />
                        </button>
                        <span className={styles.vs}>VS</span>
                        <button
                            className={`${styles.btnVoto} ${styles.btnRsa}`}
                            onClick={() => votar('corea')}
                            disabled={enviando}
                            aria-label="Votar por Corea del Sur"
                        >
                            <Bandera opcion="corea" className={styles.flagBtn} />
                        </button>
                    </div>
                    {data && !data.logueado && (
                        <span className={styles.loginHint}>necesitas cuenta para votar</span>
                    )}
                    <span className={styles.premio}>🎁 si tu equipo gana: código de descuento</span>
                </>
            ) : (
                <span className={styles.cerrada}>votación cerrada — esperando resultado…</span>
            )}

            {error && <span className={styles.error}>{error}</span>}
        </motion.div>
        )}
        </AnimatePresence>

        <LoginModal
            isOpen={showLogin}
            onClose={() => { setShowLogin(false); cargar(); }}
        />
        </>
    );
}
