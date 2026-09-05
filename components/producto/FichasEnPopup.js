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
 */
export default function FichasEnPopup() {
    const [ficha, setFicha] = useState(null);
    const pathname = usePathname();

    // La ruta que empujamos al abrir. Sirve para distinguir "la URL cambio
    // porque abri la ficha" de "el usuario se fue a otra pagina".
    const rutaPopup = useRef(null);
    // El handler del clic vive fuera de React y no debe reengancharse en cada
    // apertura, asi que lee el estado por referencia.
    const abierto = useRef(false);
    abierto.current = ficha != null;

    const cerrar = useCallback(() => {
        setFicha(null);
        rutaPopup.current = null;
        // Deshace la entrada que metimos al abrir: la barra vuelve a mostrar el
        // catalogo, y no queda un "atras" que no lleva a ninguna parte.
        if (window.history.state?.fichaPopup) window.history.back();
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
                if (abierto.current) { rutaPopup.current = null; setFicha(null); }
                return;
            }

            const id = idDeSlug(href.slice('/producto/'.length));
            if (!id) return;

            // En la ficha a pantalla completa no hay catalogo detras que
            // conservar: los similares navegan como siempre.
            if (!abierto.current && window.location.pathname.startsWith('/producto/')) return;

            e.preventDefault();

            // Saltar de una ficha a otra dentro del popup reemplaza la entrada
            // en vez de apilarla: asi "atras" siempre cierra y te devuelve al
            // catalogo, en lugar de recorrer hacia atras las fichas visitadas.
            const metodo = abierto.current ? 'replaceState' : 'pushState';
            window.history[metodo]({ fichaPopup: id }, '', href);
            rutaPopup.current = href;
            setFicha(id);
        };

        document.addEventListener('click', alClic, true);
        return () => document.removeEventListener('click', alClic, true);
    }, []);

    useEffect(() => {
        const atras = () => { rutaPopup.current = null; setFicha(null); };
        window.addEventListener('popstate', atras);
        return () => window.removeEventListener('popstate', atras);
    }, []);

    // Los enlaces de dentro de la ficha (migas, categorias, etiquetas) navegan
    // de verdad, y el popup vive en el layout: sin esto se quedaria abierto
    // encima de la pagina nueva.
    useEffect(() => {
        if (ficha == null || !rutaPopup.current) return;
        // Se compara contra la URL real y no contra `pathname`: la barra la
        // movemos nosotros al abrir, y usePathname no siempre acompana a un
        // pushState hecho a mano. Si la URL ya no es la de la ficha, la
        // navegacion es de verdad y el popup sobra.
        if (window.location.pathname !== rutaPopup.current) {
            rutaPopup.current = null;
            setFicha(null);
        }
    }, [pathname, ficha]);

    return <ProductoPopup id={ficha} onCerrar={cerrar} />;
}
