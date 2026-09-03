'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
    hayConsentimiento,
    vistaDePagina,
    EVENTO_CONSENTIMIENTO,
} from '@/lib/analytics';

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

/**
 * Carga GA4 y solo despues de que la persona acepte cookies.
 *
 * No se usa Consent Mode con el script cargado y las senales denegadas: eso
 * sigue contactando a Google desde el navegador de quien dijo que no. Aqui, si
 * rechaza, el script sencillamente no existe. Es mas estricto y mas facil de
 * defender frente a la LFPDPPP.
 *
 * Sin NEXT_PUBLIC_GA_ID no se monta nada, asi que en local no se ensucian los
 * datos de la propiedad real.
 */
export default function Analytics() {
    const [acepto, setAcepto] = useState(false);
    const [listo, setListo] = useState(false);
    const ruta = usePathname();

    useEffect(() => {
        setAcepto(hayConsentimiento());
        const alCambiar = (e) => setAcepto(!!e.detail?.acepto);
        window.addEventListener(EVENTO_CONSENTIMIENTO, alCambiar);
        return () => window.removeEventListener(EVENTO_CONSENTIMIENTO, alCambiar);
    }, []);

    // Cada navegacion es una vista: el script solo cuenta sola la primera carga
    // y aqui casi todo el recorrido ocurre sin recargar la pagina.
    useEffect(() => {
        if (!listo || !ruta) return;
        vistaDePagina(ruta);
    }, [ruta, listo]);

    if (!GA_ID || !acepto) return null;

    return (
        <>
            <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
                strategy="afterInteractive"
                onLoad={() => setListo(true)}
            />
            <Script id="ga-init" strategy="afterInteractive">
                {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    window.gtag = gtag;
                    gtag('js', new Date());
                    // send_page_view en false: las vistas se mandan a mano desde
                    // el efecto de arriba y si no se duplicaria la primera.
                    gtag('config', '${GA_ID}', { send_page_view: false });
                `}
            </Script>
        </>
    );
}
