'use client';

import { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';
import s from './CookieBanner.module.css';
import { avisarConsentimiento } from '@/lib/analytics';

export default function CookieBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!localStorage.getItem('cookies_accepted')) {
            setVisible(true);
        }
    }, []);

    // Hasta ahora la respuesta solo se guardaba y nadie la leia: el banner
    // pedia permiso para algo que no ocurria. Ahora es lo que decide si GA4
    // se carga, y el aviso permite encenderlo sin recargar la pagina.
    const accept = () => {
        localStorage.setItem('cookies_accepted', '1');
        avisarConsentimiento(true);
        setVisible(false);
    };

    const decline = () => {
        localStorage.setItem('cookies_accepted', '0');
        avisarConsentimiento(false);
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className={s.overlay}>
            <div className={s.banner}>
                <div className={s.iconWrapper}>
                    <Cookie size={22} />
                </div>
                <div className={s.content}>
                    <p className={s.title}>Usamos cookies</p>
                    <p className={s.desc}>
                        {/* Decia "al continuar, aceptas su uso", y no es lo que pasa: las
                            estadisticas solo se cargan si se pulsa Aceptar (ver
                            components/Analytics.js). El texto tiene que decir eso. */}
                        Usamos cookies para recordar tu sesión y tu carrito. Las de estadísticas
                        solo se activan si las aceptas.{' '}
                        <a href="/privacidad" className={s.link}>Más información</a>
                    </p>
                </div>
                <div className={s.actions}>
                    <button className={s.declineBtn} onClick={decline}>Rechazar</button>
                    <button className={s.acceptBtn} onClick={accept}>Aceptar</button>
                </div>
                <button className={s.closeBtn} onClick={decline} aria-label="Cerrar">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
