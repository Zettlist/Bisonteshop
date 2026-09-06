'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CalendarClock, Wallet, PackageCheck, PackageX } from 'lucide-react';
import styles from '@/app/perfil/CommonProfile.module.css';
import a from '@/app/perfil/apartados/Apartados.module.css';
import { rutaDeProducto } from '@/lib/slug';

const dinero = (n) => `$${Number(n || 0).toFixed(2)}`;

const fecha = (v) => new Date(v).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
});

/** El estado en una frase, que es lo que la persona quiere saber al entrar:
 *  si todavia lo tiene y hasta cuando. */
function situacion(ap) {
    if (ap.status === 'completed') return { texto: 'Liquidado y entregado', tono: 'ok', Icono: PackageCheck };
    if (ap.status === 'expired') return { texto: 'Venció y volvió al catálogo', tono: 'mal', Icono: PackageX };
    if (ap.status === 'cancelled') return { texto: 'Cancelado', tono: 'neutro', Icono: PackageX };

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

    return (
        <>
            {apartados.map((ap) => {
                const { texto, tono, Icono } = situacion(ap);
                return (
                    <article key={ap.id} className={`${styles.card} ${a.tarjeta}`}>
                        <header className={a.cabecera}>
                            <div>
                                <p className={a.folio}>{ap.folio}</p>
                                <p className={a.meta}>
                                    {ap.tipo === 'preventa' ? 'Preventa' : 'Apartado'} del {fecha(ap.created_at)}
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

                        {ap.status === 'pending' && (
                            <p className={a.limite}>
                                <Wallet size={15} />
                                Pasa a liquidarlo antes del <strong>{fecha(ap.expires_at)}</strong>.
                                Después de esa fecha vuelve al catálogo.
                            </p>
                        )}
                    </article>
                );
            })}
        </>
    );
}
