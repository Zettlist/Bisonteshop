'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { stripeDelNavegador } from '@/lib/stripeNavegador';
import {
    Elements,
    CardNumberElement,
    CardExpiryElement,
    CardCvcElement,
    useStripe,
    useElements,
} from '@stripe/react-stripe-js';
import { Truck, X, ShieldCheck, Check, MapPin, PackageCheck } from 'lucide-react';
import a from '@/app/perfil/apartados/Apartados.module.css';

const dinero = (n) => `$${Number(n || 0).toFixed(2)}`;

const campoStripe = {
    style: {
        base: { fontSize: '16px', color: '#fff', '::placeholder': { color: '#666' }, iconColor: '#ffd60a' },
        invalid: { color: '#ef4444' },
    },
};

const VACIA = {
    nombre_recibe: '', telefono: '', calle: '', numero_exterior: '', numero_interior: '',
    colonia: '', cp: '', municipio: '', estado: '', referencias: '',
};

const OBLIGATORIOS = [
    ['nombre_recibe', 'Nombre de quien recibe'],
    ['telefono', 'Teléfono'],
    ['calle', 'Calle'],
    ['numero_exterior', 'Número exterior'],
    ['colonia', 'Colonia'],
    ['cp', 'Código postal'],
    ['municipio', 'Ciudad o municipio'],
    ['estado', 'Estado'],
];

/**
 * Pedir el envio de uno o varios apartados ya pagados.
 *
 * Cuatro pasos y ninguno se puede saltar: direccion, cotizacion, tarjeta y
 * listo. La mercancia NO se vuelve a cobrar — ya se pago en el apartado — y lo
 * unico que pasa por la tarjeta es el envio del dia.
 *
 * El estado `porRegistrar` sostiene el caso feo: la tarjeta autorizo pero la
 * tienda no alcanzo a registrar el envio (se cayo la red, se cerro el
 * portatil). Ahi el dinero esta retenido y no cobrado, y lo unico que falta es
 * repetir la ultima llamada, que es idempotente. Sin esto la unica salida seria
 * volver a empezar y arriesgar una segunda autorizacion.
 */
function Formulario({ apartados, onListo, onCerrar }) {
    const stripe = useStripe();
    const elements = useElements();

    const [paso, setPaso] = useState('direccion');
    const [direccion, setDireccion] = useState(VACIA);
    const [guardadas, setGuardadas] = useState([]);
    const [opciones, setOpciones] = useState(null);
    const [elegida, setElegida] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const [porRegistrar, setPorRegistrar] = useState(null);
    const [pedido, setPedido] = useState(null);

    const ids = apartados.map((ap) => ap.id);
    const folios = apartados.map((ap) => ap.folio);

    useEffect(() => {
        fetch('/api/addresses')
            .then((r) => r.json())
            .then(({ addresses }) => {
                if (!addresses?.length) return;
                setGuardadas(addresses);
                usar(addresses.find((d) => d.is_default) || addresses[0]);
            })
            .catch(() => { });
        // Solo al abrir.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const usar = (d) => {
        setDireccion({
            nombre_recibe: d.nombre_recibe || '',
            telefono: d.telefono || '',
            calle: d.calle || '',
            numero_exterior: d.numero_ext || '',
            numero_interior: d.numero_int || '',
            colonia: d.colonia || '',
            cp: d.cp || '',
            municipio: d.municipio || '',
            estado: d.estado || '',
            referencias: d.referencias || '',
        });
        // Cambiar de direccion invalida lo cotizado: el precio depende de a
        // donde va el paquete.
        setOpciones(null);
        setElegida(null);
    };

    const escribir = (e) => {
        setDireccion((prev) => ({ ...prev, [e.target.name]: e.target.value }));
        setOpciones(null);
        setElegida(null);
        if (error) setError(null);
    };

    const cotizar = async () => {
        const falta = OBLIGATORIOS.find(([campo]) => !String(direccion[campo] || '').trim());
        if (falta) {
            setError(`Falta ${falta[1].toLowerCase()}.`);
            return;
        }
        if (direccion.telefono.replace(/\D/g, '').length < 10) {
            setError('El teléfono debe tener 10 dígitos.');
            return;
        }

        setOcupado(true);
        setError(null);
        try {
            const res = await fetch('/api/me/apartados/envio/cotizar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apartadoIds: ids, direccion }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'No pudimos cotizar el envío.');
                return;
            }
            setOpciones(data.carriers);
            setElegida(data.carriers[0] || null);
            setPaso('envio');
        } catch {
            setError('Se interrumpió la conexión. Intenta de nuevo.');
        } finally {
            setOcupado(false);
        }
    };

    const registrar = async (paymentIntentId) => {
        const res = await fetch('/api/me/apartados/envio/confirmar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId, direccion, envia_quote_data: elegida }),
        });
        const data = await res.json();

        if (!data.success) {
            // El 409 es el unico fallo en el que se sabe que NO hubo cargo: la
            // ruta suelta la autorizacion antes de contestar. En los demas no se
            // puede prometer, asi que se deja el reintento a mano.
            setPorRegistrar(res.status === 409 ? null : paymentIntentId);
            setError(data.error || 'No pudimos registrar el envío.');
            return;
        }

        setPorRegistrar(null);
        setPedido(data.saleId);
        setPaso('listo');
    };

    const pagar = async () => {
        if (!stripe || !elements || !elegida) return;
        setOcupado(true);
        setError(null);

        try {
            if (porRegistrar) {
                await registrar(porRegistrar);
                return;
            }

            const res = await fetch('/api/me/apartados/envio/preparar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apartadoIds: ids, direccion, shippingToken: elegida.vale }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'No pudimos preparar el cobro del envío.');
                // La cotizacion caduco o dejo de valer: hay que volver a pedirla.
                if (data.envioInvalido) {
                    setOpciones(null);
                    setElegida(null);
                    setPaso('direccion');
                }
                return;
            }

            const { error: errorStripe, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
                payment_method: {
                    card: elements.getElement(CardNumberElement),
                    billing_details: { name: direccion.nombre_recibe },
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
            setOcupado(false);
        }
    };

    return (
        <div className={a.modalFondo} role="dialog" aria-modal="true" aria-label="Preparar envío">
            <div className={a.modal}>
                <header className={a.modalCabecera}>
                    <div>
                        <h2 className={a.modalTitulo}>
                            {paso === 'listo' ? 'Ya va en camino' : 'Preparar envío'}
                        </h2>
                        <p className={a.modalMeta}>{folios.join(' · ')}</p>
                    </div>
                    <button className={a.cerrar} onClick={onCerrar} aria-label="Cerrar" disabled={ocupado}>
                        <X size={18} />
                    </button>
                </header>

                {paso === 'direccion' && (
                    <>
                        <p className={a.nota}>
                            Lo que apartaste <strong>ya está pagado</strong>. Aquí solo se cobra el envío
                            del día, y lo eliges tú.
                        </p>

                        {guardadas.length > 0 && (
                            <div className={a.guardadas}>
                                {guardadas.map((d) => (
                                    <button
                                        key={d.id}
                                        type="button"
                                        className={`${a.guardada} ${direccion.cp === (d.cp || '') && direccion.calle === (d.calle || '') ? a.guardadaActiva : ''}`}
                                        onClick={() => usar(d)}
                                    >
                                        <MapPin size={14} />
                                        <span>{d.calle} {d.numero_ext}, {d.colonia} · CP {d.cp}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        <label className={a.campo}>
                            <span>Quién recibe</span>
                            <input className={a.input} name="nombre_recibe" value={direccion.nombre_recibe} onChange={escribir} maxLength={200} />
                        </label>
                        <label className={a.campo}>
                            <span>Teléfono</span>
                            <input className={a.input} name="telefono" value={direccion.telefono} onChange={escribir} maxLength={15} inputMode="tel" placeholder="10 dígitos" />
                        </label>
                        <div className={a.campoFila}>
                            <label className={a.campo}>
                                <span>Calle</span>
                                <input className={a.input} name="calle" value={direccion.calle} onChange={escribir} maxLength={300} />
                            </label>
                            <label className={a.campo}>
                                <span>Número</span>
                                <input className={a.input} name="numero_exterior" value={direccion.numero_exterior} onChange={escribir} maxLength={30} />
                            </label>
                        </div>
                        <div className={a.campoFila}>
                            <label className={a.campo}>
                                <span>Colonia</span>
                                <input className={a.input} name="colonia" value={direccion.colonia} onChange={escribir} maxLength={200} />
                            </label>
                            <label className={a.campo}>
                                <span>Código postal</span>
                                <input className={a.input} name="cp" value={direccion.cp} onChange={escribir} maxLength={5} inputMode="numeric" />
                            </label>
                        </div>
                        <div className={a.campoFila}>
                            <label className={a.campo}>
                                <span>Ciudad o municipio</span>
                                <input className={a.input} name="municipio" value={direccion.municipio} onChange={escribir} maxLength={200} />
                            </label>
                            <label className={a.campo}>
                                <span>Estado</span>
                                <input className={a.input} name="estado" value={direccion.estado} onChange={escribir} maxLength={100} />
                            </label>
                        </div>

                        {error && <p className={a.errorPago}>{error}</p>}

                        <button className={a.pagarBtn} onClick={cotizar} disabled={ocupado}>
                            <Truck size={16} />
                            {ocupado ? 'Cotizando…' : 'Ver costo del envío'}
                        </button>
                    </>
                )}

                {paso === 'envio' && (
                    <>
                        <p className={a.nota}>Elige cómo quieres que te llegue.</p>

                        <div className={a.opciones}>
                            {(opciones || []).map((o) => (
                                <button
                                    key={`${o.carrier}-${o.service}`}
                                    type="button"
                                    className={`${a.opcion} ${elegida === o ? a.opcionActiva : ''}`}
                                    onClick={() => setElegida(o)}
                                >
                                    <span className={a.opcionNombre}>
                                        {o.name} <small>{o.service}</small>
                                        {o.deliveryEstimate && <em>{o.deliveryEstimate}</em>}
                                    </span>
                                    <strong>{dinero(o.price)}</strong>
                                </button>
                            ))}
                        </div>

                        {error && <p className={a.errorPago}>{error}</p>}

                        <button className={a.pagarBtn} onClick={() => setPaso('tarjeta')} disabled={!elegida}>
                            <Truck size={16} />
                            Pagar {dinero(elegida?.price)} de envío
                        </button>
                        <button className={a.volver} type="button" onClick={() => setPaso('direccion')}>
                            Cambiar la dirección
                        </button>
                    </>
                )}

                {paso === 'tarjeta' && (
                    <>
                        <p className={a.nota}>
                            Solo el envío: <strong>{dinero(elegida?.price)}</strong> con {elegida?.name}.
                            La mercancía ya la pagaste.
                        </p>

                        <label className={a.campo}>
                            <span>Número de tarjeta</span>
                            <div className={a.campoStripe}>
                                <CardNumberElement options={{ ...campoStripe, showIcon: true, disableLink: true }} />
                            </div>
                        </label>

                        <div className={a.campoFila}>
                            <label className={a.campo}>
                                <span>Vencimiento</span>
                                <div className={a.campoStripe}><CardExpiryElement options={campoStripe} /></div>
                            </label>
                            <label className={a.campo}>
                                <span>CVC</span>
                                <div className={a.campoStripe}><CardCvcElement options={campoStripe} /></div>
                            </label>
                        </div>

                        {error && <p className={a.errorPago}>{error}</p>}

                        <button className={a.pagarBtn} onClick={pagar} disabled={ocupado || !stripe}>
                            <Truck size={16} />
                            {ocupado
                                ? 'Procesando…'
                                : porRegistrar
                                    ? 'Terminar el pago'
                                    : `Pagar ${dinero(elegida?.price)}`}
                        </button>

                        <p className={a.seguro}>
                            <ShieldCheck size={14} />
                            Cobro seguro con Stripe. Te mandamos la guía en cuanto salga.
                        </p>
                    </>
                )}

                {paso === 'listo' && (
                    <div className={a.exito}>
                        <span className={a.palomita}><Check size={26} /></span>
                        <p className={a.exitoTexto}>
                            Quedó como el pedido <strong>#{pedido}</strong>.
                            Lo empacamos y te mandamos el número de guía por correo.
                        </p>
                        <button className={a.pagarBtn} onClick={() => onListo(pedido, ids)}>
                            <PackageCheck size={16} />
                            Entendido
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * <Elements> se monta solo al abrir: cargar Stripe en cada tarjeta de la lista
 * seria pedir su script tantas veces como apartados tenga la persona.
 */
export default function EnviarApartados({ apartados, onListo, onCerrar }) {
    if (typeof document === 'undefined') return null;
    return createPortal(
        <Elements stripe={stripeDelNavegador()} options={{ wallets: { link: 'never' } }}>
            <Formulario apartados={apartados} onListo={onListo} onCerrar={onCerrar} />
        </Elements>,
        document.body
    );
}
