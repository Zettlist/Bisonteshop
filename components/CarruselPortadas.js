'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Check } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { useCartStore } from '@/store/cartStore';
import RatingStars from './RatingStars';
import { rutaDeProducto } from '@/lib/slug';
import styles from './CarruselPortadas.module.css';

/**
 * Tira de tarjetas para el estante de una categoría.
 *
 * No usa MangaCard a proposito: esa tarjeta es de vidrio y esta pensada para
 * una rejilla sobre el fondo del catalogo. Aqui el bloque es una franja oscura
 * y la tarjeta es propia, pero si lleva marco: sueltas sobre la franja, las
 * portadas se leian como un collage del landing y no como productos que se
 * pueden meter al carrito sin salir de aqui.
 *
 * El hueco se mantiene aunque no haya nada: si el estante desapareciera, el
 * bloque daria un salto de alto cada vez que se cambia de categoria, y tres de
 * las cuatro estan vacias mientras el POS termina de surtir.
 */

const HUECO = 18;      // px entre tarjetas; la pista lo toma de aqui
const VACIAS = 6;      // marcos que se dejan puestos cuando no hay productos
const ARRASTRE_MINIMO = 8;
const AVISO = 1400;    // ms que el boton se queda diciendo "Agregado"

export default function CarruselPortadas({ productos = [] }) {
    const { formatPrice } = useCurrency();
    const router = useRouter();
    const addItem = useCartStore(state => state.addItem);
    const [agregado, setAgregado] = useState(null);
    const aviso = useRef(null);
    const marco = useRef(null);
    const pista = useRef(null);
    const partida = useRef(null);
    const desvio = useRef(0);
    const posicion = useRef(0);
    const [arrastrando, setArrastrando] = useState(false);
    const [tope, setTope] = useState(0);

    // Cuanto se puede recorrer: lo que sobresale de la pista por la derecha. Sin
    // este limite la tira se va al vacio y deja la franja en negro. El estante
    // vacio no se recorre aunque sus marcos desborden: no hay nada que ver mas
    // alla, y dejarlo arrastrable prometia contenido que no existe.
    useEffect(() => {
        const m = marco.current;
        const p = pista.current;
        if (!m || !p) return;
        const medir = () => setTope(
            productos.length === 0 ? 0 : Math.max(0, p.scrollWidth - m.clientWidth)
        );
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(m);
        ro.observe(p);
        return () => ro.disconnect();
    }, [productos.length]);

    // Al encoger la ventana el recorrido se acorta y la tira puede quedar mas
    // alla del nuevo final, con media franja vacia.
    useEffect(() => {
        if (posicion.current > tope) {
            posicion.current = tope;
            if (pista.current) pista.current.style.transform = `translate3d(${-tope}px, 0, 0)`;
        }
    }, [tope]);

    const colocar = (x) => {
        posicion.current = Math.min(tope, Math.max(0, x));
        if (pista.current) {
            pista.current.style.transform = `translate3d(${-posicion.current}px, 0, 0)`;
        }
    };

    // El gesto se sigue desde la ventana y sin capturar el puntero: capturarlo
    // reapunta el clic al contenedor y las portadas dejarian de abrirse.
    useEffect(() => {
        const mover = (e) => {
            if (partida.current === null) return;
            const dx = e.clientX - partida.current;
            partida.current = e.clientX;
            desvio.current += Math.abs(dx);
            colocar(posicion.current - dx);
        };
        const soltar = () => {
            if (partida.current === null) return;
            partida.current = null;
            setArrastrando(false);
        };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
        window.addEventListener('pointercancel', soltar);
        return () => {
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
            window.removeEventListener('pointercancel', soltar);
        };
    }, [tope]);

    useEffect(() => {
        const m = marco.current;
        if (!m) return;
        // Solo el gesto horizontal: quedarse con la rueda vertical dejaria la
        // pagina atrapada en la franja.
        const rueda = (e) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            e.preventDefault();
            colocar(posicion.current + e.deltaX);
        };
        m.addEventListener('wheel', rueda, { passive: false });
        return () => m.removeEventListener('wheel', rueda);
    }, [tope]);

    // Con botones dentro, el estante ya se puede tabular. El marco recorta y
    // quien se mueve es la tira, pero el navegador no lo sabe: al enfocar un
    // boton que cae fuera intenta acercarlo recorriendo el marco, y eso deja la
    // franja descuadrada para siempre (el difuminado de los bordes y el arrastre
    // siguen contando desde cero). Se deshace ese scroll y el acercamiento se
    // hace moviendo la tira, que es lo unico aqui que sabe moverse.
    useEffect(() => {
        const m = marco.current;
        if (!m) return;
        const enfocar = (e) => {
            m.scrollLeft = 0;
            // Por si el navegador recorre despues de avisar del foco.
            requestAnimationFrame(() => { m.scrollLeft = 0; });

            const tarjeta = e.target?.closest?.(`.${styles.portada}`);
            if (!tarjeta) return;
            const suya = tarjeta.getBoundingClientRect();
            const mia = m.getBoundingClientRect();
            if (suya.left < mia.left) colocar(posicion.current - (mia.left - suya.left));
            else if (suya.right > mia.right) colocar(posicion.current + (suya.right - mia.right));
        };
        m.addEventListener('focusin', enfocar);
        return () => m.removeEventListener('focusin', enfocar);
    }, [tope]);

    // El "Agregado" se apaga solo; si se cambia de categoria antes de tiempo, el
    // temporizador quedaria escribiendo sobre un componente ya desmontado.
    useEffect(() => () => clearTimeout(aviso.current), []);

    const tomar = (e) => {
        if (e.button !== 0 || !tope) return;
        partida.current = e.clientX;
        desvio.current = 0;
        setArrastrando(true);
    };

    // Cada portada es un enlace: sin esto, arrastrar abre el producto que quedo
    // debajo del dedo al soltar. Va en captura, asi que de paso desactiva los
    // botones de compra cuando lo que hubo fue un arrastre y no un clic.
    const filtrarClic = (e) => {
        if (desvio.current <= ARRASTRE_MINIMO) return;
        e.preventDefault();
        e.stopPropagation();
        desvio.current = 0;
    };

    const agregar = (p) => {
        addItem(p);
        setAgregado(p.id);
        clearTimeout(aviso.current);
        aviso.current = setTimeout(() => setAgregado(null), AVISO);
    };

    // "Comprar" es el atajo del estante: mete el producto y lleva a pagar. El
    // checkout ya se defiende solo si falta la sesion o el carrito llega vacio.
    const comprar = (p) => {
        addItem(p);
        router.push('/checkout');
    };

    const vacio = productos.length === 0;

    return (
        <div
            ref={marco}
            className={`${styles.marco} ${arrastrando ? styles.arrastrando : ''} ${tope > 0 ? styles.movible : ''}`}
            onPointerDown={tomar}
            onClickCapture={filtrarClic}
            onDragStart={(e) => e.preventDefault()}
        >
            <div ref={pista} className={styles.pista} style={{ gap: `${HUECO}px` }}>
                {vacio
                    ? Array.from({ length: VACIAS }).map((_, i) => (
                        // Misma estructura que una tarjeta de verdad, con el
                        // rotulo, el precio y los botones en blanco: asi el
                        // estante vacio mide exactamente lo mismo que el lleno y
                        // el bloque no pega un salto al cambiar de categoria.
                        <div key={i} className={`${styles.portada} ${styles.portadaVacia}`} aria-hidden="true">
                            <div className={`${styles.lamina} ${styles.laminaVacia}`} />
                            <span className={styles.rotulo} />
                            <span className={styles.rating} />
                            <span className={styles.precio} />
                            <div className={styles.botones}>
                                <span className={`${styles.btn} ${styles.btnFantasma}`} />
                                <span className={`${styles.btn} ${styles.btnFantasma}`} />
                            </div>
                        </div>
                    ))
                    : productos.map(p => {
                        const agotado = p.stock <= 0;
                        return (
                            <div key={p.id} className={`${styles.portada} ${agotado ? styles.sinStock : ''}`}>
                                {/* El enlace envuelve portada, titulo y precio,
                                    no la tarjeta entera: los botones quedan
                                    fuera porque un <button> dentro de un <a> no
                                    es HTML valido. */}
                                <Link href={rutaDeProducto(p)} className={styles.enlace}>
                                    <div className={styles.lamina}>
                                        {p.image_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={p.image_url}
                                                alt={p.title || 'Portada'}
                                                className={styles.imagen}
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        ) : (
                                            <span className={styles.sinFoto}>📚</span>
                                        )}
                                        {agotado && <span className={styles.agotado}>Agotado</span>}
                                    </div>
                                    <span className={styles.rotulo}>{p.title}</span>
                                    {/* El renglón se reserva aunque el producto
                                        no tenga nota: sin calificar, RatingStars
                                        no pinta nada y las tarjetas de la fila
                                        acabarían midiendo distinto. */}
                                    <span className={styles.rating}>
                                        <RatingStars valor={p.rating} total={p.rating_count} size={13} />
                                    </span>
                                    <span className={styles.precio}>{formatPrice(p.price)}</span>
                                </Link>

                                <div className={styles.botones}>
                                    <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnAgregar} ${agregado === p.id ? styles.btnListo : ''}`}
                                        onClick={() => agregar(p)}
                                        disabled={agotado}
                                        aria-label={`Agregar ${p.title} al carrito`}
                                    >
                                        {agregado === p.id
                                            ? <><Check size={14} /> Agregado</>
                                            : <><ShoppingCart size={14} /> Agregar</>}
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnComprar}`}
                                        onClick={() => comprar(p)}
                                        disabled={agotado}
                                        aria-label={`Comprar ${p.title} ahora`}
                                    >
                                        Comprar
                                    </button>
                                </div>
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}
