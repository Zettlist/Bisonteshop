'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

const esPerfil = (ruta) => !!ruta?.startsWith('/perfil');

// Solo en la primera carga real. En navegaciones cliente el modulo sigue vivo
// con la marca puesta, asi que no se repite al volver a la home.
let yaMostrada = false;

// `previa` es null en la primera carga de la pestana.
function abreSplash(ruta, previa) {
    if (RUTAS_CON_SPLASH.includes(ruta) && !yaMostrada) return true;

    // El perfil tiene su propia cortina cada vez que se entra al apartado,
    // aunque el landing ya la haya mostrado. Pero solo al entrar desde fuera:
    // entre sus subpaginas seria una cortina en cada clic del menu lateral.
    if (esPerfil(ruta) && !esPerfil(previa)) return true;

    return false;
}

const Ctx = createContext(null);

export function SplashProvider({ children }) {
    const pathname = usePathname();
    const rutaPrevia = useRef(null);

    const inicial = abreSplash(pathname, null);
    const [conSplash, setConSplash] = useState(inicial);
    // Las rutas sin splash arrancan listas: si no, su contenido se quedaria
    // esperando una señal que nunca llega.
    const [listo, setListo] = useState(!inicial);

    useEffect(() => {
        if (rutaPrevia.current === pathname) return;
        const anterior = rutaPrevia.current;
        rutaPrevia.current = pathname;

        // La primera carga ya quedo resuelta en el estado inicial.
        if (anterior === null) return;

        const abrir = abreSplash(pathname, anterior);
        setConSplash(abrir);
        setListo(!abrir);
    }, [pathname]);

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
