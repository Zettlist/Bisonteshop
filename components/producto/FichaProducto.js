'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    ShoppingBag, BookmarkPlus, ChevronRight,
    BookOpen, Layers, Globe, Building2, User2, Weight, Barcode, Hash,
} from 'lucide-react';
import styles from './FichaProducto.module.css';
import MangaCard from '@/components/MangaCard';
import RatingStars from '@/components/RatingStars';
import PuertaAdultos from './PuertaAdultos';
import ApartarDialogo from './ApartarDialogo';
import CalificarProducto from './CalificarProducto';
import { useCurrency } from '@/context/CurrencyContext';
import { useCartStore } from '@/store/cartStore';
import { describirDimensiones } from '@/lib/dimensiones';
import { verProducto } from '@/lib/analytics';

export default function FichaProducto({ producto, similares = [] }) {
    const { formatPrice, currency } = useCurrency();
    const addItem = useCartStore(state => state.addItem);
    const [apartando, setApartando] = useState(false);

    // El promedio se guarda aparte del producto para poder repintarlo en cuanto
    // el cliente deja su nota. /api/productos cachea cinco minutos, asi que
    // leerlo de `producto` dejaria las estrellas contando la opinion anterior
    // justo delante de quien acaba de escribirla.
    const [resumen, setResumen] = useState({ rating: producto.rating, rating_count: producto.rating_count });
    useEffect(() => {
        setResumen({ rating: producto.rating, rating_count: producto.rating_count });
    }, [producto.id, producto.rating, producto.rating_count]);

    // Igual que en la ficha anterior: una vista por producto. El ref evita el
    // doble montaje de React en desarrollo, que inflaba al doble justo la
    // comparacion vistas/carrito para la que se mide.
    const medido = useRef(null);
    useEffect(() => {
        if (!producto || medido.current === producto.id) return;
        medido.current = producto.id;
        verProducto(producto);
    }, [producto]);

    const agotado = (producto.stock ?? 0) <= 0;
    const precio = producto.price != null ? Number(producto.price) : null;
    const tags = Array.isArray(producto.tags) ? producto.tags.filter(t => t?.trim()) : [];
    const editorial = producto.publisher?.toLowerCase() !== 'undefined' ? producto.publisher : null;

    const detalles = useMemo(() => {
        const dimensiones = describirDimensiones(producto.dimensions);
        return [
            producto.isbn      && { icon: Hash,      label: 'ISBN',      value: producto.isbn },
            producto.barcode   && { icon: Barcode,   label: 'Código',    value: producto.barcode },
            producto.pages > 0 && { icon: BookOpen,  label: 'Páginas',   value: `${producto.pages} págs` },
            producto.language  && { icon: Globe,     label: 'Idioma',    value: producto.language },
            producto.artist    && { icon: User2,     label: 'Artista',   value: producto.artist },
            // La medida real primero y el formato debajo: "B5" a secas no le
            // dice nada a quien no conoce la nomenclatura japonesa.
            dimensiones        && { icon: Layers,    label: 'Dimensiones',
                                    value: dimensiones.medidas || dimensiones.etiqueta,
                                    hint:  dimensiones.medidas && dimensiones.etiqueta
                                               ? [dimensiones.etiqueta, dimensiones.nota].filter(Boolean).join(' · ')
                                               : dimensiones.nota },
            producto.weight > 0 && { icon: Weight,   label: 'Peso',      value: `${producto.weight} g` },
            editorial          && { icon: Building2, label: 'Editorial', value: editorial },
        ].filter(Boolean);
    }, [producto, editorial]);

    // Cada catalogo se filtra distinto y hay que armar el enlace entero, no
    // solo el nombre del parametro: /adultos ademas necesita open=1 o se queda
    // en su portada y el filtro no se llega a aplicar.
    const catalogo = producto.is_adult
        ? {
            href: '/adultos',
            nombre: 'Adultos',
            porCategoria: v => `/adultos?open=1&cat=${encodeURIComponent(v)}`,
            porEtiqueta:  v => `/adultos?open=1&tag=${encodeURIComponent(v)}`,
          }
        : {
            href: '/mangas',
            nombre: 'Mangas',
            porCategoria: v => `/mangas?categoria=${encodeURIComponent(v)}`,
            porEtiqueta:  v => `/mangas?etiqueta=${encodeURIComponent(v)}`,
          };

    const contenido = (
        <main className={styles.pagina}>
            <nav className={styles.migas} aria-label="Ruta de navegación">
                <Link href="/">Inicio</Link>
                <ChevronRight size={13} aria-hidden="true" />
                <Link href={catalogo.href}>{catalogo.nombre}</Link>
                {producto.category && (
                    <>
                        <ChevronRight size={13} aria-hidden="true" />
                        <Link href={catalogo.porCategoria(producto.category)}>
                            {producto.category}
                        </Link>
                    </>
                )}
                <ChevronRight size={13} aria-hidden="true" />
                <span aria-current="page">{producto.title}</span>
            </nav>

            <div className={styles.cuerpo}>
                {/* ── Portada ── */}
                <div className={styles.columnaImagen}>
                    <figure className={`${styles.marco} ${agotado ? styles.marcoAgotado : ''}`}>
                        {producto.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={producto.image_url}
                                alt={`Portada de ${producto.title}`}
                                className={styles.portada}
                            />
                        ) : (
                            <div className={styles.sinPortada}>📚</div>
                        )}
                        {agotado && <span className={styles.selloAgotado}>Agotado</span>}
                    </figure>
                </div>

                {/* ── Datos ── */}
                <div className={styles.columnaDatos}>
                    <div className={styles.badges}>
                        {editorial && <span className={styles.badge}>{editorial}</span>}
                        {producto.category && (
                            <span className={`${styles.badge} ${styles.badgeCategoria}`}>{producto.category}</span>
                        )}
                        {producto.gender && (
                            <span className={`${styles.badge} ${styles.badgeGenero}`}>{producto.gender}</span>
                        )}
                    </div>

                    <h1 className={styles.titulo}>{producto.title}</h1>

                    <RatingStars
                        valor={resumen.rating}
                        total={resumen.rating_count}
                        size={17}
                        className={styles.rating}
                    />

                    <CalificarProducto productoId={producto.id} onResumen={setResumen} />

                    <div className={styles.precioFila}>
                        <span className={styles.precio}>
                            {precio != null ? formatPrice(precio) : '—'}
                            {precio != null && <small> {currency}</small>}
                        </span>
                        <span className={`${styles.stock} ${agotado ? styles.stockAgotado : styles.stockHay}`}>
                            {agotado ? 'Agotado' : `${producto.stock} disponibles`}
                        </span>
                    </div>

                    {/* El envio no es un numero fijo: lo cotiza Envia contra la
                        direccion. Prometer una cifra aqui seria inventarla. */}
                    <p className={styles.notaEnvio}>Envío calculado al finalizar la compra</p>

                    <div className={styles.acciones}>
                        <button
                            onClick={() => addItem(producto)}
                            disabled={agotado}
                            className={`${styles.btn} ${styles.btnPrimario}`}
                        >
                            <ShoppingBag size={17} />
                            {agotado ? 'No disponible' : 'Agregar al carrito'}
                        </button>
                        <button
                            onClick={() => setApartando(true)}
                            disabled={agotado}
                            className={`${styles.btn} ${styles.btnSecundario}`}
                        >
                            <BookmarkPlus size={17} />
                            Apartar
                        </button>
                    </div>

                    {tags.length > 0 && (
                        <div className={styles.tags}>
                            {tags.map(tag => (
                                <Link
                                    key={tag}
                                    href={catalogo.porEtiqueta(tag)}
                                    className={styles.tag}
                                >
                                    {tag}
                                </Link>
                            ))}
                        </div>
                    )}

                    <Sinopsis texto={producto.sinopsis} fuente={producto.sinopsis_fuente} />

                    {detalles.length > 0 && (
                        <section className={styles.ficha}>
                            <h2 className={styles.fichaTitulo}>Detalles</h2>
                            <dl className={styles.fichaLista}>
                                {detalles.map(({ icon: Icono, label, value, hint }) => (
                                    <div key={label} className={styles.fichaFila}>
                                        <span className={styles.fichaIcono}><Icono size={13} /></span>
                                        <dt className={styles.fichaCampo}>{label}</dt>
                                        <dd className={styles.fichaValor}>
                                            {value}
                                            {hint && <span className={styles.fichaNota}>{hint}</span>}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    )}
                </div>
            </div>

            {similares.length > 0 && (
                <section id="similares" className={styles.similares}>
                    <h2 className={styles.similaresTitulo}>También te puede gustar</h2>
                    <div className={styles.similaresRejilla}>
                        {similares.map(p => <MangaCard key={p.id} manga={p} />)}
                    </div>
                </section>
            )}

            {apartando && (
                <ApartarDialogo producto={producto} onCerrar={() => setApartando(false)} />
            )}
        </main>
    );

    // Una URL directa a un producto +18 no pasa por la portada de /adultos, que
    // es donde vive la confirmacion de edad. La puerta se repite aqui, o el
    // enlace compartido seria la puerta de atras al catalogo adulto.
    return producto.is_adult
        ? <PuertaAdultos titulo={producto.title}>{contenido}</PuertaAdultos>
        : contenido;
}

/**
 * Sinopsis recortada a cuatro renglones.
 *
 * El boton solo aparece si de verdad hay texto escondido: medir el
 * desbordamiento evita un "Leer más" que no revela nada en las fichas de
 * sinopsis corta, que son la mayoria del catalogo.
 */
function Sinopsis({ texto, fuente }) {
    const parrafo = useRef(null);
    const [desborda, setDesborda] = useState(false);
    const [abierta, setAbierta] = useState(false);

    useEffect(() => {
        const el = parrafo.current;
        if (!el) return;
        const medir = () => setDesborda(el.scrollHeight > el.clientHeight + 2);
        medir();
        // Cuanto cabe depende del ancho: al girar el telefono cambia el recorte.
        const observador = new ResizeObserver(medir);
        observador.observe(el);
        return () => observador.disconnect();
    }, [texto]);

    if (!texto) return null;

    return (
        <section className={styles.sinopsis}>
            <p
                ref={parrafo}
                className={`${styles.sinopsisTexto} ${abierta ? styles.sinopsisAbierta : ''}`}
            >
                {texto}
            </p>
            {(desborda || abierta) && (
                <button className={styles.leerMas} onClick={() => setAbierta(v => !v)}>
                    {abierta ? 'Leer menos' : 'Leer más'}
                </button>
            )}
            {fuente && <p className={styles.sinopsisFuente}>Sinopsis: {fuente}</p>}
        </section>
    );
}
