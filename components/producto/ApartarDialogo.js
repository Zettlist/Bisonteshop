'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { X, BookmarkPlus, CalendarClock, Wallet, ShieldCheck, AlertTriangle, Check, LogIn } from 'lucide-react';
import {
    Elements,
    CardNumberElement,
    CardExpiryElement,
    CardCvcElement,
    useStripe,
    useElements,
} from '@stripe/react-stripe-js';
import styles from './ApartarDialogo.module.css';
import { stripeDelNavegador } from '@/lib/stripeNavegador';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { calcularApartado, diasDePlazo, fechaLimite, tipoDeApartado } from '@/lib/apartado';

/**
 * Siempre en pesos, aunque la tienda este mostrando dolares.
 *
 * El apartado tiene que cuadrar al centavo contra lo que se guarda en la base,
 * que esta en pesos, y contra lo que se cobra en Stripe. Ensenar aqui una
 * conversion dejaria a alguien esperando pagar 25 dolares un saldo que la
 * tienda va a cobrar en pesos al tipo de cambio de otro dia.
 */
const dinero = (n) => `$${Number(n || 0).toFixed(2)}`;

const campoStripe = {
    style: {
        base: { fontSize: '16px', color: '#fff', '::placeholder': { color: '#666' }, iconColor: '#ffd60a' },
        invalid: { color: '#ef4444' },
    },
};

const enLetra = (fecha) => fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Elegir cuanto se paga hoy y pagarlo.
 *
 * Tres pasos y ninguno se puede saltar: la tienda prepara el cobro
 * (/apartados/preparar), la tarjeta lo autoriza en el navegador y la tienda
 * crea el apartado y cobra (/apartados/crear). La pieza no se separa hasta ese
 * ultimo paso, asi que cerrar la pestana a medias no deja nada colgando.
 *
 * `porRegistrar` sostiene el caso feo: la tarjeta autorizo pero la ultima
 * llamada no contesto. El dinero esta retenido y no cobrado, y lo unico que
 * falta es repetirla — es idempotente por el indice unico del cobro. Sin esto,
 * la unica salida seria empezar de nuevo y arriesgar una segunda autorizacion.
 */
function Formulario({ producto, total, minimo, porcentaje, limite, onListo }) {
    const stripe = useStripe();
    const elements = useElements();

    const [monto, setMonto] = useState(minimo);
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState(null);
    const [porRegistrar, setPorRegistrar] = useState(null);

    const saldo = Math.round((total - monto) * 100) / 100;

    // Los atajos: el minimo, la mitad y todo. La mitad se cae cuando no aporta
    // nada — en un articulo barato el minimo ya pasa del 50%.
    const opciones = useMemo(() => {
        const mitad = Math.round(total * 50) / 100;
        const lista = [{ etiqueta: `Mínimo ${porcentaje}%`, valor: minimo }];
        if (mitad > minimo + 0.5) lista.push({ etiqueta: 'La mitad', valor: mitad });
        lista.push({ etiqueta: 'Todo', valor: total });
        return lista;
    }, [total, minimo, porcentaje]);

    const registrar = async (paymentIntentId) => {
        const res = await fetch('/api/me/apartados/crear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId }),
        });
        const data = await res.json();

        if (!data.success) {
            // El 409 es el unico fallo en el que se sabe que NO hubo cargo: la
            // ruta suelta la autorizacion antes de contestar.
            setPorRegistrar(res.status === 409 ? null : paymentIntentId);
            setError(data.error || 'No pudimos registrar el apartado.');
            return;
        }

        setPorRegistrar(null);
        onListo(data);
    };

    const pagar = async () => {
        if (!stripe || !elements) return;
        setProcesando(true);
        setError(null);

        try {
            if (porRegistrar) {
                await registrar(porRegistrar);
                return;
            }

            const res = await fetch('/api/me/apartados/preparar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productoId: producto.id, monto }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'No pudimos preparar el apartado.');
                return;
            }

            const { error: errorStripe, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
                payment_method: {
                    card: elements.getElement(CardNumberElement),
                    billing_details: { name: producto.title },
                },
            });

            if (errorStripe) {
                setError(errorStripe.message);
                return;
            }

            await registrar(paymentIntent.id);
        } catch {
            setError('Se interrumpió la conexión. Si ya autorizaste el cargo, vuelve a pulsar para terminar.');
        } finally {
            setProcesando(false);
        }
    };

    return (
        <>
            <p className={styles.pregunta}>¿Cuánto quieres pagar hoy?</p>

            <div className={styles.opciones}>
                {opciones.map((o) => (
                    <button
                        key={o.etiqueta}
                        type="button"
                        onClick={() => setMonto(o.valor)}
                        disabled={procesando}
                        className={`${styles.opcion} ${monto === o.valor ? styles.opcionActiva : ''}`}
                    >
                        <span>{o.etiqueta}</span>
                        <strong>{dinero(o.valor)}</strong>
                    </button>
                ))}
            </div>

            {total - minimo >= 1 && (
                <input
                    type="range"
                    className={styles.barra}
                    min={minimo}
                    max={total}
                    step={1}
                    value={monto}
                    disabled={procesando}
                    onChange={(e) => setMonto(Math.round(Number(e.target.value) * 100) / 100)}
                    aria-label="Cuánto pagas hoy"
                />
            )}

            <dl className={styles.cuentas}>
                <div className={styles.renglon}>
                    <dt>Precio total</dt>
                    <dd>{dinero(total)} MXN</dd>
                </div>
                <div className={`${styles.renglon} ${styles.renglonFuerte}`}>
                    <dt>Pagas hoy</dt>
                    <dd>{dinero(monto)} MXN</dd>
                </div>
                <div className={styles.renglon}>
                    <dt>Te queda por pagar</dt>
                    <dd>{dinero(saldo)} MXN</dd>
                </div>
            </dl>

            {/* La regla dura, junto al monto y no enterrada en los terminos: es
                la que hace que alguien se enoje si no la leyo. */}
            {saldo > 0 ? (
                <p className={styles.reglaDura}>
                    <AlertTriangle size={15} />
                    <span>
                        Tienes hasta el <strong>{enLetra(limite)}</strong> para pagar los {dinero(saldo)} que
                        faltan. Si no, vuelve al catálogo y <strong>el anticipo no se devuelve</strong>.
                    </span>
                </p>
            ) : (
                <p className={styles.reglaSuave}>
                    <CalendarClock size={15} />
                    <span>Lo pagas completo hoy. Te escribimos para coordinar la entrega.</span>
                </p>
            )}

            <label className={styles.campo}>
                <span>Número de tarjeta</span>
                <div className={styles.campoStripe}>
                    <CardNumberElement options={{ ...campoStripe, showIcon: true, disableLink: true }} />
                </div>
            </label>

            <div className={styles.campoFila}>
                <label className={styles.campo}>
                    <span>Vencimiento</span>
                    <div className={styles.campoStripe}><CardExpiryElement options={campoStripe} /></div>
                </label>
                <label className={styles.campo}>
                    <span>CVC</span>
                    <div className={styles.campoStripe}><CardCvcElement options={campoStripe} /></div>
                </label>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.confirmar} onClick={pagar} disabled={procesando || !stripe}>
                <BookmarkPlus size={17} />
                {procesando
                    ? 'Procesando…'
                    : porRegistrar
                        ? 'Terminar el apartado'
                        : `Pagar ${dinero(monto)} y apartar`}
            </button>

            <p className={styles.aviso}>
                <ShieldCheck size={13} /> Cobro seguro con Stripe, en pesos mexicanos.
            </p>
        </>
    );
}

/** Lo que se ve cuando el apartado ya existe. */
function Hecho({ resultado, articulo }) {
    const vence = new Date(resultado.vence);
    return (
        <div className={styles.exito}>
            <div className={styles.palomita}><Check size={26} /></div>
            <p className={styles.folio}>{resultado.folio}</p>
            <p className={styles.exitoTexto}>
                <strong>{articulo}</strong> es tuyo. Lo guardamos hasta el <strong>{enLetra(vence)}</strong>.
            </p>
            {resultado.saldo > 0 ? (
                <p className={styles.exitoTexto}>
                    Te faltan <strong>{dinero(resultado.saldo)}</strong>. Puedes pagarlos cuando quieras
                    desde tus apartados.
                </p>
            ) : (
                <p className={styles.exitoTexto}>Está pagado por completo. Te escribimos para coordinar la entrega.</p>
            )}
            <Link href="/perfil/apartados" className={styles.confirmar}>
                <Wallet size={16} /> Ver mis apartados
            </Link>
            <p className={styles.aviso}>Te mandamos el folio y la fecha por correo.</p>
        </div>
    );
}

export default function ApartarDialogo({ producto, onCerrar }) {
    // El tipo sale del catalogo, no de un prop: el mismo dialogo se abre
    // desde la ficha de un articulo en tienda y desde el de importacion, y
    // el anticipo no es el mismo.
    const tipo = tipoDeApartado(producto);
    const { total, anticipo, saldo, porcentaje } = calcularApartado(producto.price, tipo);
    // En una preventa no hay fecha: el plazo cuenta desde que el pedido llega
    // a la tienda, y eso lo marca el POS. Se dice el plazo, no un dia.
    const limite = fechaLimite(new Date(), tipo);
    const dias = diasDePlazo(tipo);

    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const setIsLoginOpen = useCartStore((s) => s.setIsLoginOpen);
    const [hecho, setHecho] = useState(null);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const alPulsar = (e) => { if (e.key === 'Escape') onCerrar(); };
        window.addEventListener('keydown', alPulsar);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', alPulsar);
        };
    }, [onCerrar]);

    if (typeof document === 'undefined') return null;

    const contenido = (
        <motion.div
            className={styles.telon}
            onClick={onCerrar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
        >
            <motion.div
                className={styles.tarjeta}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="apartar-titulo"
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
                <button className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
                    <X size={18} />
                </button>

                <h2 id="apartar-titulo" className={styles.titulo}>
                    {hecho ? 'Apartado hecho' : tipo === 'preventa' ? 'Apartar esta preventa' : 'Apartar este artículo'}
                </h2>
                <p className={styles.producto}>{producto.title}</p>

                {hecho ? (
                    <Hecho resultado={hecho} articulo={producto.title} />
                ) : tipo === 'preventa' ? (
                    /* La preventa se aparta contra otro contador y su plazo
                       arranca cuando el pedido llega a la tienda, cosa que la
                       web no sabe. Va por su propio camino y no esta hecho. */
                    <>
                        <dl className={styles.cuentas}>
                            <div className={styles.renglon}>
                                <dt>Precio total</dt>
                                <dd>{dinero(total)} MXN</dd>
                            </div>
                            <div className={`${styles.renglon} ${styles.renglonFuerte}`}>
                                <dt>Anticipo</dt>
                                <dd>{dinero(anticipo)} MXN</dd>
                            </div>
                            <div className={styles.renglon}>
                                <dt>Saldo restante</dt>
                                <dd>{dinero(saldo)} MXN</dd>
                            </div>
                        </dl>
                        <ul className={styles.condiciones}>
                            <li>
                                <Wallet size={15} />
                                <span>Pagas el {porcentaje}% para apartarla y el resto cuando llegue.</span>
                            </li>
                            <li>
                                <CalendarClock size={15} />
                                <span>
                                    Te avisamos en cuanto llegue a la tienda, y a partir de ese día
                                    tienes <strong>{dias} días</strong> para liquidarla.
                                </span>
                            </li>
                        </ul>
                        <button className={styles.confirmar} disabled>
                            <BookmarkPlus size={17} />
                            Apartar preventa
                        </button>
                        <p className={styles.aviso}>
                            La preventa todavía no se puede apartar por internet. Escríbenos y te la
                            apartamos mientras tanto.
                        </p>
                    </>
                ) : !isAuthenticated ? (
                    <>
                        <dl className={styles.cuentas}>
                            <div className={styles.renglon}>
                                <dt>Precio total</dt>
                                <dd>{dinero(total)} MXN</dd>
                            </div>
                            <div className={`${styles.renglon} ${styles.renglonFuerte}`}>
                                <dt>Desde</dt>
                                <dd>{dinero(anticipo)} MXN</dd>
                            </div>
                        </dl>
                        <p className={styles.aviso}>
                            El apartado queda a tu nombre y el saldo lo pagas desde tu cuenta, así que
                            necesitas entrar antes.
                        </p>
                        <button
                            className={styles.confirmar}
                            onClick={() => { onCerrar(); setIsLoginOpen(true); }}
                        >
                            <LogIn size={17} /> Iniciar sesión para apartar
                        </button>
                    </>
                ) : (
                    <Elements stripe={stripeDelNavegador()} options={{ wallets: { link: 'never' } }}>
                        <Formulario
                            producto={producto}
                            total={total}
                            minimo={anticipo}
                            porcentaje={porcentaje}
                            limite={limite}
                            onListo={setHecho}
                        />
                    </Elements>
                )}
            </motion.div>
        </motion.div>
    );

    return createPortal(contenido, document.body);
}
