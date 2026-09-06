'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import ProductoPopup from './ProductoPopup';
import { idDeSlug } from '@/lib/slug';

/**
 * Cualquier enlace a /producto/... abre la ficha encima de donde estabas.
 *
 * Va montado una sola vez en el layout y escucha el clic en todo el documento,
 * en vez de que cada rejilla (mangas, figuras, adultos, accesorios, carrusel,
 * similares) enganche lo suyo: son media docena de superficies y la que se
 * olvide te saca del catalogo, que es justo lo que se queria evitar.
 *
 * La tarjeta sigue siendo un enlace de verdad — se comparte, se abre en otra
 * pestana y el buscador la indexa. Lo unico que cambia es el clic normal.
 *
 * ── Por que la ficha abierta vive en el fragmento y no en la ruta ───────────
 *
 * Antes, al abrir se empujaba la ruta del producto a la barra de direcciones
 * (`/producto/52-...`). Se veia bien hasta que algo recargaba la pagina: el
 * navegador pedia esa URL y aterrizabas en la ficha a pantalla completa, que es
 * exactamente de lo que el popup te salva. Y recargar no es raro — en
 * desarrollo lo hace Fast Refresh solo ("Fast Refresh had to perform a full
 * reload", cada pocos minutos), y en produccion basta con F5, restaurar la
 * pestana o volver de una suspension.
 *
 * Ahora se marca con `#producto=<id>` sobre la ruta en la que ya estabas. La
 * recarga vuelve al catalogo y esta misma pieza reabre el popup al montarse,
 * asi que la pagina entera no aparece nunca por accidente. De paso, el
 * fragmento no lo ve `useSearchParams`, y eso importa: /adultos reaplica sus
 * filtros y sube el scroll cada vez que cambian los parametros de busqueda.
 */

/** Nombre del marcador en el fragmento: `#producto=52`. */
const CLAVE = 'producto';

const PATRON = new RegExp(`^#${CLAVE}=(\\d+)$`);

/** Id de la ficha que pide la URL, o null si no pide ninguna. */
function idDelFragmento(hash = window.location.hash) {
    const m = PATRON.exec(hash);
    return m ? Number(m[1]) : null;
}

/** La URL de ahora con la ficha marcada. Conserva ruta y parametros: el popup
 *  flota sobre el catalogo tal y como lo dejaste, filtros incluidos. */
function conFicha(id) {
    const { pathname, search } = window.location;
    return `${pathname}${search}#${CLAVE}=${id}`;
}

/** La misma URL sin el marcador. */
function sinFicha() {
    const { pathname, search } = window.location;
    return `${pathname}${search}`;
}

export default function FichasEnPopup() {
    const [ficha, setFicha] = useState(null);
    const pathname = usePathname();

    // La ruta sobre la que flota el popup. Sirve para distinguir "sigo en el
    // catalogo" de "el usuario se fue a otra pagina".
    const rutaFondo = useRef(null);
    // Si la entrada del historial la metimos nosotros. Al reabrir tras una
    // recarga no la metimos, y entonces cerrar no puede hacer `back()`.
    const empujado = useRef(false);
    // El handler del clic vive fuera de React y no debe reengancharse en cada
    // apertura, asi que lee el estado por referencia.
    const abierto = useRef(false);
    abierto.current = ficha != null;

    const cerrar = useCallback(() => {
        setFicha(null);
        rutaFondo.current = null;

        if (empujado.current) {
            empujado.current = false;
            // Deshace la entrada que metimos al abrir: la barra vuelve a
            // mostrar el catalogo y no queda un "atras" que no lleva a nada.
            window.history.back();
        } else if (idDelFragmento() != null) {
            // Reabierto tras una recarga: no hay entrada nuestra que deshacer,
            // solo el marcador que sobra en la URL.
            window.history.replaceState(window.history.state, '', sinFicha());
        }
    }, []);

    // Al montar: si la URL pide una ficha, abrela. Es lo que convierte una
    // recarga con el popup abierto en el mismo catalogo con el mismo popup, y
    // lo que hace que `#producto=` se pueda compartir.
    useEffect(() => {
        if (window.location.pathname.startsWith('/producto/')) return;
        const id = idDelFragmento();
        if (id == null) return;
        rutaFondo.current = window.location.pathname;
        empujado.current = false;
        setFicha(id);
    }, []);

    useEffect(() => {
        const alClic = (e) => {
            // Ctrl/cmd/shift/alt significan "abrelo aparte": eso no se toca.
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

            // Los "Agregar" rapidos viven dentro del enlace y se defienden
            // parando la propagacion, pero esto escucha en captura y correria
            // antes que ellos.
            if (e.target.closest?.('button')) return;

            const enlace = e.target.closest?.('a[href]');
            if (!enlace || enlace.target === '_blank' || enlace.hasAttribute('download')) return;

            const href = enlace.getAttribute('href');

            // Un enlace de dentro de la ficha que no lleva a otro producto
            // (migas, categoria, etiqueta): que navegue, pero sin dejarse el
            // popup abierto encima de la pagina nueva.
            if (!href.startsWith('/producto/')) {
                if (abierto.current) {
                    rutaFondo.current = null;
                    empujado.current = false;
                    setFicha(null);
                }
                return;
            }

            const id = idDeSlug(href.slice('/producto/'.length));
            if (!id) return;

            // En la ficha a pantalla completa no hay catalogo detras que
            // conservar: los similares navegan como siempre. La comprobacion es
            // fiable porque la ruta ya no la tocamos nosotros — si dice
            // /producto/ es que se esta en esa pagina de verdad.
            if (!abierto.current && window.location.pathname.startsWith('/producto/')) return;

            e.preventDefault();

            // Saltar de una ficha a otra dentro del popup reemplaza la entrada
            // en vez de apilarla: asi "atras" siempre cierra y te devuelve al
            // catalogo, en lugar de recorrer hacia atras las fichas visitadas.
            if (abierto.current) {
                window.history.replaceState(window.history.state, '', conFicha(id));
            } else {
                rutaFondo.current = window.location.pathname;
                window.history.pushState({ fichaPopup: id }, '', conFicha(id));
                empujado.current = true;
            }
            setFicha(id);
        };

        document.addEventListener('click', alClic, true);
        return () => document.removeEventListener('click', alClic, true);
    }, []);

    // Atras/adelante del navegador: la URL manda. Si la entrada a la que se
    // llega pide una ficha se abre, y si no, se cierra la que hubiera.
    useEffect(() => {
        const alMoverse = () => {
            const id = window.location.pathname.startsWith('/producto/') ? null : idDelFragmento();
            if (id == null) {
                rutaFondo.current = null;
                empujado.current = false;
                setFicha(null);
                return;
            }
            rutaFondo.current = window.location.pathname;
            empujado.current = false;
            setFicha(id);
        };
        window.addEventListener('popstate', alMoverse);
        return () => window.removeEventListener('popstate', alMoverse);
    }, []);

    // Los enlaces de dentro de la ficha (migas, categorias, etiquetas) navegan
    // de verdad, y el popup vive en el layout: sin esto se quedaria abierto
    // encima de la pagina nueva.
    useEffect(() => {
        if (ficha == null || !rutaFondo.current) return;
        // Se compara contra la URL real y no contra `pathname`: usePathname no
        // siempre acompana a un cambio de historial hecho a mano. Si la ruta ya
        // no es la de debajo del popup, la navegacion es de verdad.
        if (window.location.pathname !== rutaFondo.current) {
            rutaFondo.current = null;
            empujado.current = false;
            setFicha(null);
        }
    }, [pathname, ficha]);

    return <ProductoPopup id={ficha} onCerrar={cerrar} />;
}
