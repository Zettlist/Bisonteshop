'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CalendarClock, PackageCheck, PackageX, PackageOpen, Truck, Boxes, X } from 'lucide-react';
import styles from '@/app/perfil/CommonProfile.module.css';
import a from '@/app/perfil/apartados/Apartados.module.css';
import { rutaDeProducto } from '@/lib/slug';
import LiquidarApartado from './LiquidarApartado';
import EnviarApartados from './EnviarApartados';

const dinero = (n) => `$${Number(n || 0).toFixed(2)}`;

const fecha = (v) => new Date(v).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
});

/** El estado en una frase, que es lo que la persona quiere saber al entrar:
 *  si todavia lo tiene y hasta cuando. */
function situacion(ap) {
    // Un apartado que ya se mando esta cerrado, pero «Liquidado y entregado» no
    // es lo que le paso: va en una caja. El pedido detras es lo que lo sabe.
    if (ap.pedido) {
        if (ap.pedido.estado === 'entregado') return { texto: 'Entregado', tono: 'ok', Icono: PackageCheck };
        if (ap.pedido.estado === 'cancelado') return { texto: 'Envío cancelado', tono: 'mal', Icono: PackageX };
        if (ap.pedido.estado === 'envio') return { texto: 'En camino', tono: 'ok', Icono: Truck };
        return { texto: 'Empacando tu envío', tono: 'ok', Icono: Truck };
    }
    if (ap.status === 'completed') return { texto: 'Liquidado y entregado', tono: 'ok', Icono: PackageCheck };
    if (ap.status === 'expired') return { texto: 'Venció y volvió al catálogo', tono: 'mal', Icono: PackageX };
    if (ap.status === 'cancelled') return { texto: 'Cancelado', tono: 'neutro', Icono: PackageX };

    // Pagado pero todavia `pending`: ya no debe nada y le toca recibirlo, asi
    // que la cuenta atras deja de ser lo primero que se ve.
    if (ap.saldo <= 0) return { texto: 'Pagado · pide tu envío', tono: 'ok', Icono: PackageOpen };

    const d = ap.dias_restantes;
    if (d < 0) return { texto: `Se pasó la fecha hace ${Math.abs(d)} día${Math.abs(d) === 1 ? '' : 's'}`, tono: 'mal', Icono: CalendarClock };
    if (d === 0) return { texto: 'Vence hoy', tono: 'urgente', Icono: CalendarClock };
    if (d === 1) return { texto: 'Te queda 1 día', tono: 'urgente', Icono: CalendarClock };
    if (d <= 3) return { texto: `Te quedan ${d} días`, tono: 'urgente', Icono: CalendarClock };
    return { texto: `Te quedan ${d} días`, tono: 'ok', Icono: CalendarClock };
}

export default function ApartadosPanel() {
    const [apartados, setApartados] = useState(null);
    const [error, setError] = useState(null);

    // El envio multiple: juntar varios apartados en una sola caja y pagar un
    // solo envio. `marcados` es null cuando no se esta eligiendo nada, que es
    // lo normal; asi la lista no se llena de casillas para quien solo quiere
    // mandar uno.
    const [marcados, setMarcados] = useState(null);
    const [enviando, setEnviando] = useState(null);

    useEffect(() => {
        let vivo = true;
        fetch('/api/me/apartados')
            .then((r) => r.json())
            .then((d) => {
                if (!vivo) return;
                if (d.success) setApartados(d.apartados);
                else setError(d.error || 'No pudimos cargar tus apartados.');
            })
            .catch(() => { if (vivo) setError('No pudimos cargar tus apartados.'); })
            .finally(() => { if (vivo) setApartados((p) => p ?? []); });
        return () => { vivo = false; };
    }, []);

    // Tras cobrar no se vuelve a pedir la lista entera: el saldo nuevo lo
    // devuelve /confirm, que es quien acaba de escribirlo. Recargar aqui seria
    // una consulta mas para enterarse de algo que ya se sabe.
    //
    // `enviable` si se recalcula aqui: liquidar es justo lo que abre la puerta
    // del envio, y el servidor lo vuelve a comprobar cuando se pulse.
    const registrarPago = (id, saldo) => {
        setApartados((prev) => prev.map((ap) => (
            ap.id === id
                ? { ...ap, saldo, pagado: Number((ap.total - saldo).toFixed(2)), enviable: saldo <= 0 }
                : ap
        )));
    };

    // El envio ya registrado. Los apartados que iban en esa caja dejan de ser
    // enviables y pasan a colgar del pedido.
    const registrarEnvio = (saleId, ids) => {
        setApartados((prev) => prev.map((ap) => (
            ids.includes(ap.id)
                ? { ...ap, enviable: false, status: 'completed', pedido: { id: saleId, estado: 'pendiente', guia: null } }
                : ap
        )));
        setEnviando(null);
        setMarcados(null);
    };

    if (apartados === null && !error) {
        return <div className={styles.card}><div className={styles.emptyState}>Cargando…</div></div>;
    }

    if (error) {
        return <div className={styles.card}><div className={styles.emptyState}>{error}</div></div>;
    }

    if (apartados.length === 0) {
        return (
            <div className={styles.card}>
                <div className={styles.emptyState}>
                    <p>Todavía no tienes nada apartado.</p>
                    <p className={a.pista}>
                        Si apartaste algo en la tienda, pide que lo liguen a tu cuenta
                        para verlo aquí.
                    </p>
                </div>
            </div>
        );
    }

    const enviables = apartados.filter((ap) => ap.enviable);
    const eligiendo = marcados !== null;

    const alternar = (id) => {
        setMarcados((prev) => (
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        ));
    };

    const seleccionados = eligiendo
        ? enviables.filter((ap) => marcados.includes(ap.id))
        : [];

    return (
        <>
            {/* «Envío múltiple» solo tiene sentido con dos o mas listos: con uno
                el boton de su tarjeta ya hace el trabajo. */}
            {enviables.length > 1 && !eligiendo && (
                <div className={styles.card}>
                    <p className={a.barraMultipleTexto}>
                        Tienes <strong>{enviables.length} apartados pagados</strong>. Puedes
                        mandarlos en una sola caja y pagar un solo envío.
                    </p>
                    <div className={a.botonera} style={{ marginTop: '0.9rem' }}>
                        <button className={a.secundario} onClick={() => setMarcados([])}>
                            <Boxes size={16} />
                            Envío múltiple
                        </button>
                    </div>
                </div>
            )}

            {apartados.map((ap) => {
                const { texto, tono, Icono } = situacion(ap);
                const marcable = eligiendo && ap.enviable;
                const marcado = marcable && marcados.includes(ap.id);

                return (
                    <article
                        key={ap.id}
                        className={`${styles.card} ${a.tarjeta} ${marcable ? a.seleccionable : ''} ${marcado ? a.marcada : ''}`}
                        onClick={marcable ? () => alternar(ap.id) : undefined}
                    >
                        <header className={a.cabecera}>
                            <div>
                                <p className={a.folio}>{ap.folio}</p>
                                <p className={a.meta}>
                                    Apartado del {fecha(ap.created_at)}
                                </p>
                            </div>
                            <span className={`${a.estado} ${a[tono]}`}>
                                <Icono size={15} />
                                {texto}
                            </span>
                        </header>

                        <ul className={a.articulos}>
                            {ap.items.map((item) => (
                                <li key={item.product_id} className={a.articulo}>
                                    {item.image_url ? (
                                        <Image
                                            src={item.image_url}
                                            alt={item.title}
                                            width={44}
                                            height={64}
                                            className={a.portada}
                                        />
                                    ) : (
                                        <span className={`${a.portada} ${a.sinPortada}`} aria-hidden="true" />
                                    )}
                                    <Link
                                        href={rutaDeProducto({ id: item.product_id, title: item.title })}
                                        className={a.titulo}
                                    >
                                        {item.title}
                                    </Link>
                                    {item.quantity > 1 && <span className={a.cantidad}>×{item.quantity}</span>}
                                </li>
                            ))}
                        </ul>

                        <dl className={a.cuentas}>
                            <div>
                                <dt>Total</dt>
                                <dd>{dinero(ap.total)}</dd>
                            </div>
                            <div>
                                <dt>Abonado</dt>
                                <dd>{dinero(ap.pagado)}</dd>
                            </div>
                            <div className={a.saldo}>
                                <dt>Te falta</dt>
                                <dd>{dinero(ap.saldo)}</dd>
                            </div>
                        </dl>

                        {marcable && (
                            <label className={a.casilla} onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" checked={marcado} onChange={() => alternar(ap.id)} />
                                Meter en la misma caja
                            </label>
                        )}

                        {/* Con saldo: liquidar. Liquidado y sin pedido: enviar.
                            Ya enviado: dónde verlo. Y nunca las dos cosas: el
                            envío no aparece hasta que el saldo llega a cero. */}
                        {!eligiendo && ap.status === 'pending' && ap.saldo > 0 && (
                            <div className={a.acciones}>
                                <p className={a.limite}>
                                    <CalendarClock size={15} />
                                    Liquídalo antes del <strong>{fecha(ap.expires_at)}</strong>.
                                    Después de esa fecha vuelve al catálogo y el anticipo se pierde.
                                </p>
                                <LiquidarApartado apartado={ap} onPagado={registrarPago} />
                            </div>
                        )}

                        {!eligiendo && ap.enviable && (
                            <div className={a.acciones}>
                                <p className={a.limite}>
                                    <PackageOpen size={15} />
                                    Ya está pagado. Dinos a dónde lo mandamos y paga solo el envío.
                                </p>
                                <button className={a.pagarBtn} onClick={() => setEnviando([ap])}>
                                    <Truck size={16} />
                                    Preparar envío
                                </button>
                            </div>
                        )}

                        {ap.pedido && (
                            <p className={a.limite}>
                                <Truck size={15} />
                                Va en el pedido <strong>#{ap.pedido.id}</strong>.{' '}
                                <Link href="/perfil/pedidos" className={a.titulo}>Ver el pedido</Link>
                            </p>
                        )}
                    </article>
                );
            })}

            {eligiendo && (
                <div className={a.barraMultiple}>
                    <p className={a.barraMultipleTexto}>
                        {seleccionados.length === 0
                            ? 'Marca los apartados que van en la misma caja.'
                            : <>Van <strong>{seleccionados.length}</strong> en la caja.</>}
                    </p>
                    <div className={a.botonera}>
                        <button className={a.secundario} onClick={() => setMarcados(null)}>
                            <X size={16} />
                            Cancelar
                        </button>
                        <button
                            className={a.pagarBtn}
                            disabled={seleccionados.length === 0}
                            onClick={() => setEnviando(seleccionados)}
                        >
                            <Truck size={16} />
                            Cotizar el envío
                        </button>
                    </div>
                </div>
            )}

            {enviando && (
                <EnviarApartados
                    apartados={enviando}
                    onListo={registrarEnvio}
                    onCerrar={() => setEnviando(null)}
                />
            )}
        </>
    );
}
