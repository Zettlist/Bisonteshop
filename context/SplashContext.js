'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// Estado de la pantalla de carga.
//
// Vive en el layout raiz — FUERA de app/template.js. El template envuelve cada
// pagina en un motion.div que arranca en opacity 0, asi que cualquier cosa
// dentro de children aparece despues de la barra; el splash tiene que estar por
// encima de eso desde el primer pintado.
//
// El landing consume `listo` para saber cuando correr su animacion de entrada.
// ─────────────────────────────────────────────────────────────────────────────

const RUTAS_CON_SPLASH = ['/', '/adultos'];

// Solo en la primera carga real. En navegaciones cliente el modulo sigue vivo
// con la marca puesta, asi que no se repite al volver a la home.
let yaMostrada = false;

const Ctx = createContext(null);

export function SplashProvider({ children }) {
    const pathname = usePathname();
    const conSplash = RUTAS_CON_SPLASH.includes(pathname) && !yaMostrada;

    // Las rutas sin splash arrancan listas: si no, su contenido se quedaria
    // esperando una señal que nunca llega.
    const [listo, setListo] = useState(!conSplash);

    const valor = useMemo(() => ({
        listo,
        visible: conSplash && !listo,
        esAdultos: !!pathname?.startsWith('/adultos'),
        marcarListo: () => { yaMostrada = true; setListo(true); },
    }), [listo, conSplash, pathname]);

    return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

// Fuera del provider (o en un test) el contenido se comporta como ya cargado.
export function useSplash() {
    return useContext(Ctx) || { listo: true, visible: false, esAdultos: false, marcarListo: () => {} };
}
