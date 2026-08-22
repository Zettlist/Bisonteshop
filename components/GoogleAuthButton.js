'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './GoogleAuthButton.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Boton "Continuar con Google".
//
// Usa Google Identity Services: Google devuelve un ID token firmado y nosotros
// lo mandamos a /api/auth/google, que lo verifica y emite la sesion normal.
// El navegador nunca decide quien eres; solo transporta el token.
//
// Si no hay NEXT_PUBLIC_GOOGLE_CLIENT_ID el boton no se pinta. Asi la tienda
// sigue funcionando igual mientras la credencial no este dada de alta.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = 'https://accounts.google.com/gsi/client';

function cargarScript() {
    if (typeof window === 'undefined') return Promise.reject();
    if (window.google?.accounts?.id) return Promise.resolve();
    const existente = document.querySelector(`script[src="${SRC}"]`);
    if (existente) {
        return new Promise((ok, err) => {
            existente.addEventListener('load', ok, { once: true });
            existente.addEventListener('error', err, { once: true });
        });
    }
    return new Promise((ok, err) => {
        const s = document.createElement('script');
        s.src = SRC;
        s.async = true;
        s.defer = true;
        s.onload = ok;
        s.onerror = err;
        document.head.appendChild(s);
    });
}

export default function GoogleAuthButton({ onCredential, texto = 'signin_with', deshabilitado = false }) {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const contenedor = useRef(null);
    const [listo, setListo] = useState(false);
    const [falló, setFalló] = useState(false);
    // Ref para que el callback de Google (que se registra una sola vez) siempre
    // llame a la version actual del handler.
    const cb = useRef(onCredential);
    useEffect(() => { cb.current = onCredential; }, [onCredential]);

    useEffect(() => {
        if (!clientId) return;
        let vivo = true;
        cargarScript()
            .then(() => {
                if (!vivo || !contenedor.current) return;
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: (resp) => cb.current?.(resp.credential),
                });
                window.google.accounts.id.renderButton(contenedor.current, {
                    theme: 'filled_black',
                    size: 'large',
                    shape: 'pill',
                    text: texto,
                    locale: 'es',
                    width: 280,
                });
                setListo(true);
            })
            .catch(() => { if (vivo) setFalló(true); });
        return () => { vivo = false; };
    }, [clientId, texto]);

    if (!clientId) return null;

    return (
        <div className={styles.zona}>
            <div className={styles.separador}>
                <span />
                <p>o</p>
                <span />
            </div>
            <div
                ref={contenedor}
                className={`${styles.boton} ${deshabilitado ? styles.inerte : ''}`}
            />
            {!listo && !falló && <p className={styles.aviso}>Cargando Google…</p>}
            {falló && <p className={styles.aviso}>No se pudo cargar Google. Usa tu correo y contraseña.</p>}
        </div>
    );
}
