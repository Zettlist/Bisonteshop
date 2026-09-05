'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import CarruselPortadas from '@/components/CarruselPortadas';
import styles from './Categories.module.css';

/* ── Categorías ─────────────────────────────────────────────────────────────
   Antes eran cuatro tarjetas apiladas: para saber que habia dentro de una
   tocaba salir del landing y volver. Ahora las cuatro viven en una regla que se
   arrastra y debajo se abren los productos de la que quede en el centro, asi
   que se pueden recorrer las cuatro sin cambiar de pagina ni una sola vez. */

// El POS no tiene una tabla de secciones: la categoria es texto libre escrito a
// mano al dar de alta ("Figura", "Figuras", "figura escala"). Por eso el reparto
// va por parecido y no por igualdad, o media tienda caeria en la seccion que no
// es. Calendario entra con Figuras porque es donde lo pone /api/figuras.
const esFigura = p => /figura|calendario/i.test(p.category || '');
const esAccesorio = p => /accesorio/i.test(p.category || '');
const esRevista = p => /revista/i.test(p.category || '');

const CATEGORIAS = [
    {
        id: 'manga',
        titulo: 'Mangas y Novelas',
        desc: 'Shonen, Seinen, Shoujo y más géneros',
        href: '/mangas',
        cta: 'Ver todos los mangas',
        suya: p => !esFigura(p) && !esAccesorio(p) && !esRevista(p),
    },
    {
        id: 'figuras',
        titulo: 'Figuras',
        desc: 'Escala, articuladas, chibis y más',
        href: '/figuras',
        cta: 'Ver todas las figuras',
        suya: esFigura,
    },
    {
        id: 'revistas',
        titulo: 'Revistas',
        desc: 'Manga, Anime, Cosplay y Cultura Pop',
        href: '/mangas?categoria=Revista',
        cta: 'Ver todas las revistas',
        suya: esRevista,
    },
    {
        id: 'accesorios',
        titulo: 'Accesorios',
        desc: 'Joyas, relojes, llaveros, pines y más',
        href: '/accesorios',
        cta: 'Ver todos los accesorios',
        suya: esAccesorio,
    },
];

const VECINOS = 2;          // titulos pintados a cada lado del centro
const ARRASTRE_MINIMO = 8;  // px arrastrados por debajo de los cuales fue un clic
const MAX_PRODUCTOS = 12;
const APAGADO = 0.68;       // cuanta opacidad pierde el titulo mas alejado

// Marcas de la regla. La separacion sale de la ranura y no es un numero fijo:
// es lo unico que garantiza que la aguja del centro caiga siempre sobre una
// marca larga, y con ella el titulo, cualquiera que sea el ancho de la ventana.
const DIVISIONES = 3;       // marcas largas por ranura
const SUBDIVISIONES = 5;    // marcas menudas dentro de cada marca larga
const GROSOR = 1.5;         // ancho de la marca en px; tiene que ser el del CSS

const enRango = i => ((i % CATEGORIAS.length) + CATEGORIAS.length) % CATEGORIAS.length;

export default function Categories() {
    const [productos, setProductos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [paso, setPaso] = useState(0);
    const [ancho, setAncho] = useState(0);
    const [indice, setIndice] = useState(0);
    const [arrastrando, setArrastrando] = useState(false);

    const marco = useRef(null);
    const pista = useRef(null);
    const reglas = useRef([]);
    const partida = useRef(null);   // clientX donde empezo el gesto
    const desvio = useRef(0);       // px que lleva movido el gesto en curso
    // Solo lo que movio el dedo. `desvio` tambien acumula lo de la rueda, y esa
    // cuenta no puede decidir si un clic fue un clic: bastaba un empujon lateral
    // del trackpad para que despues los titulos dejaran de responder al clic.
    const movido = useRef(0);
    const indiceVivo = useRef(0);

    indiceVivo.current = indice;

    useEffect(() => {
        // El mismo listado que usa Novedades: con all=1 vienen tambien figuras,
        // calendarios y accesorios, que es justo lo que aqui hay que repartir.
        fetch('/api/mangas?all=1')
            .then(r => r.json())
            .then(d => { if (d.success) setProductos(d.mangas); })
            .catch(() => {})
            .finally(() => setCargando(false));
    }, []);

    // La ranura ocupa algo mas de media pantalla: asi el titulo del centro manda
    // y los de los lados se asoman lo justo para que se vea que hay mas.
    useEffect(() => {
        const m = marco.current;
        if (!m) return;
        const medir = () => {
            // El ancho hace falta aparte del paso: la aguja esta en su mitad y
            // es desde ahi desde donde se coloca la escala.
            setAncho(m.clientWidth);
            setPaso(Math.max(180, Math.min(330, m.clientWidth * 0.32)));
        };
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(m);
        return () => ro.disconnect();
    }, []);

    /* La escala, medida desde la ranura. `centro` es donde arranca la marca
       larga que le toca a la aguja: la aguja se pinta centrada en el 50% de la
       regla y la marca se pinta desde su borde izquierdo, asi que media marca de
       correccion es lo que hace que los dos centros coincidan de verdad y no por
       aproximacion. */
    const largo = paso / DIVISIONES;
    const menudo = largo / SUBDIVISIONES;
    const centro = ancho / 2 - GROSOR / 2;
    // Hasta que hay medida no se escribe nada y manda el respaldo del CSS: con
    // paso 0 la baldosa mediria 0px y la regla se pintaba en blanco el primer
    // fotograma, justo el que se ve al cargar la pagina.
    const escala = paso ? {
        backgroundSize: `${largo}px 100%, ${menudo}px 55%`,
        backgroundPositionX: `${centro - indice * paso}px`,
    } : undefined;

    /* En reposo cada titulo va colocado desde el render y es una transicion de
       CSS la que lo lleva de una ranura a la siguiente. Solo mientras se
       arrastra se tocan los estilos a mano, porque ahi hay que seguir el dedo
       al instante y cualquier transicion iria por detras. */
    const seguirDedo = useCallback(() => {
        for (const nodo of pista.current?.children ?? []) {
            const x = (Number(nodo.dataset.ranura) - indiceVivo.current) * paso + desvio.current;
            nodo.style.transform = `translate3d(calc(-50% + ${x}px), 0, 0)`;
            nodo.style.opacity = String(1 - APAGADO * Math.min(Math.abs(x) / paso, 1));
        }
        for (const regla of reglas.current) {
            if (regla) regla.style.backgroundPositionX = `${centro - indiceVivo.current * paso + desvio.current}px`;
        }
    }, [paso, centro]);

    // El gesto se sigue desde la ventana y sin capturar el puntero: capturarlo
    // reapunta el clic al contenedor y los titulos dejarian de responder.
    useEffect(() => {
        if (!paso) return;

        const mover = (e) => {
            if (partida.current === null) return;
            desvio.current = e.clientX - partida.current;
            movido.current = Math.abs(desvio.current);
            seguirDedo();
        };

        const soltar = () => {
            if (partida.current === null) return;
            // Se encaja en la ranura mas cercana: media categoria a la vista no
            // significa nada, o estas en una o estas en otra.
            const saltos = Math.round(-desvio.current / paso);
            partida.current = null;
            desvio.current = 0;
            setArrastrando(false);
            setIndice(i => i + saltos);
        };

        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
        window.addEventListener('pointercancel', soltar);
        return () => {
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
            window.removeEventListener('pointercancel', soltar);
        };
    }, [paso, seguirDedo]);

    useEffect(() => {
        const m = marco.current;
        if (!m || !paso) return;
        // Solo el gesto horizontal. Quedarse con la rueda vertical dejaria la
        // pagina atrapada en esta seccion.
        const rueda = (e) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            e.preventDefault();
            desvio.current -= e.deltaX;
            const saltos = Math.round(-desvio.current / paso);
            if (saltos !== 0) {
                desvio.current = 0;
                setIndice(i => i + saltos);
            }
        };
        m.addEventListener('wheel', rueda, { passive: false });
        return () => m.removeEventListener('wheel', rueda);
    }, [paso]);

    /* La posicion de reposo se vuelve a escribir a mano cada vez que el gesto
       termina, y no se deja en manos del render.

       Durante el arrastre los estilos se escriben por fuera de React. Si al
       soltar el indice no cambio —un tiron corto que no alcanza la ranura
       siguiente— el valor que React tiene apuntado es el mismo de antes, no ve
       diferencia y no toca el DOM: la franja se quedaba corrida los pixeles que
       durase el tiron, con el titulo desalineado de la aguja hasta la siguiente
       recarga. Y ese corrimiento se sumaba al del tiron siguiente. */
    useEffect(() => {
        if (arrastrando || !paso) return;
        desvio.current = 0;
        seguirDedo();
    }, [indice, paso, arrastrando, seguirDedo]);

    const tomar = (e) => {
        if (e.button !== 0) return;
        partida.current = e.clientX;
        desvio.current = 0;
        movido.current = 0;
        setArrastrando(true);
    };

    const elegir = (ranura) => {
        // Arrastrar acaba con el dedo encima de un titulo: sin esto, soltar
        // saltaria a esa categoria en vez de quedarse donde lo dejaste. La
        // marca se gasta al leerla, no se limpia al soltar: el clic llega
        // despues del pointerup, asi que borrarla ahi la dejaba en cero justo
        // antes de que sirviera para algo. Y sin gastarla, el arrastre de hace
        // un rato seguia comiendose el clic siguiente, que era de verdad.
        if (movido.current > ARRASTRE_MINIMO) {
            movido.current = 0;
            return;
        }
        setIndice(ranura);
    };

    const activa = CATEGORIAS[enRango(indice)];
    const suyos = productos.filter(activa.suya).slice(0, MAX_PRODUCTOS);

    // Ranuras a la vista. El indice no da la vuelta nunca: crece o mengua sin
    // limite y el contenido se saca por modulo, asi que el bucle no tiene
    // costura y no hay que duplicar la lista.
    const ranuras = [];
    for (let r = indice - VECINOS; r <= indice + VECINOS; r++) {
        ranuras.push({ ranura: r, cat: CATEGORIAS[enRango(r)] });
    }

    return (
        <section className={styles.section}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <span className={styles.label}>Explora</span>
                    <h2 className={styles.title}>NUESTRAS CATEGORÍAS</h2>
                </div>
            </div>

            {/* La franja va fuera del contenedor y a sangre, de borde a borde:
                es lo que la hace leerse como una cinta que cruza la pagina y no
                como otro bloque mas alineado con el resto. Solo lleva los
                titulos; el encabezado y las portadas viven fuera, sobre el
                fondo del landing. */}
            <div className={styles.franja}>
                <div
                    ref={marco}
                    className={`${styles.regleta} ${arrastrando ? styles.arrastrando : ''}`}
                    onPointerDown={tomar}
                    onDragStart={(e) => e.preventDefault()}
                >
                    <div
                        ref={(el) => { reglas.current[0] = el; }}
                        className={`${styles.regla} ${styles.reglaArriba}`}
                        style={escala}
                        aria-hidden="true"
                    >
                        <span className={styles.aguja} />
                    </div>

                    <div ref={pista} className={styles.pista}>
                        {ranuras.map(({ ranura, cat }) => {
                            const lejos = Math.abs(ranura - indice);
                            return (
                                <button
                                    key={ranura}
                                    type="button"
                                    data-ranura={ranura}
                                    className={`${styles.ranura} ${ranura === indice ? styles.ranuraActiva : ''}`}
                                    style={{
                                        transform: `translate3d(calc(-50% + ${(ranura - indice) * paso}px), 0, 0)`,
                                        opacity: 1 - APAGADO * Math.min(lejos, 1),
                                    }}
                                    onClick={() => elegir(ranura)}
                                    // Solo la del centro cuenta para el teclado y
                                    // el lector: las otras son la misma lista
                                    // repetida para que el bucle no tenga borde.
                                    tabIndex={ranura === indice ? 0 : -1}
                                    aria-hidden={ranura === indice ? undefined : 'true'}
                                    aria-current={ranura === indice ? 'true' : undefined}
                                >
                                    {cat.titulo}
                                </button>
                            );
                        })}
                    </div>

                    <div
                        ref={(el) => { reglas.current[1] = el; }}
                        className={`${styles.regla} ${styles.reglaAbajo}`}
                        style={escala}
                        aria-hidden="true"
                    >
                        <span className={styles.aguja} />
                    </div>
                </div>
            </div>

            <div className={styles.estante}>
                <div className={styles.container}>
                    <div className={styles.mandos}>
                        <button
                            type="button"
                            className={styles.mando}
                            onClick={() => setIndice(i => i - 1)}
                            aria-label="Categoría anterior"
                        >
                            ‹
                        </button>
                        <p className={styles.desc} key={activa.id}>{activa.desc}</p>
                        <button
                            type="button"
                            className={styles.mando}
                            onClick={() => setIndice(i => i + 1)}
                            aria-label="Categoría siguiente"
                        >
                            ›
                        </button>
                    </div>

                    {/* El estante se pinta siempre, tenga o no productos: tres de
                        las cuatro categorias estan vacias mientras el POS termina
                        de surtir, y quitarlo hacia que el bloque encogiera de
                        golpe y todo el landing diera un salto al cambiar. */}
                    <div className={styles.escaparate} key={activa.id}>
                        <CarruselPortadas productos={cargando ? [] : suyos} />
                        <Link href={activa.href} className={styles.verTodo}>
                            {activa.cta} →
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
