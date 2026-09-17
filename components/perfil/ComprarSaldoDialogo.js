'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { stripeDelNavegador } from '@/lib/stripeNavegador';
import {
    Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { X, Wallet, CreditCard, CheckCircle2, Lock } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { useAuthStore } from '@/store/authStore';
import { anotarRecarga, olvidarRecarga } from '@/lib/recargaPendiente';
import styles from './ComprarSaldoDialogo.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Comprar saldo sin salir del perfil.
//
// Hasta ahora "Comprar saldo" llevaba a /contacto y el abono lo hacia la tienda
// a mano. Aqui se cobra con tarjeta: /api/credit/topup prepara el cargo, Stripe
// lo confirma en el navegador y /api/credit/confirm suma el saldo. El monto que
// vale es el que acota el servidor — lo de esta pantalla es solo la propuesta.
// ─────────────────────────────────────────────────────────────────────────────


// Los mismos limites que /api/credit/topup. Repetirlos aqui no los hace verdad
// (la verdad esta alli); sirven para no mandar al cobro un monto que el
// servidor va a rechazar.
const MIN_MXN = 100;
const MAX_MXN = 10000;
const SUGERIDOS = [200, 500, 1000, 2000];

// El mismo aspecto que los campos de tarjeta del checkout: son el mismo
// formulario de Stripe y no deberian verse como dos tiendas distintas.
const campoStripe = {
    style: {
        base: { fontSize: '16px', color: '#fff', '::placeholder': { color: '#666' }, iconColor: '#e63946' },
        invalid: { color: '#ef4444' },
    },
};

// El saldo se abona en pesos siempre, asi que no pasa por formatPrice:
// convertirlo a la moneda de la vitrina diria un numero que no es el que entra
// a la cuenta.
function fmt(n) { return `$${Number(n || 0).toFixed(2)}`; }

export default function ComprarSaldoDialogo({ onCerrar, onRecarga }) {
    if (typeof document === 'undefined') return null;

    return createPortal(
        <Elements stripe={stripeDelNavegador()} options={{ wallets: { link: 'never' } }}>
            <Dialogo onCerrar={onCerrar} onRecarga={onRecarga} />
        </Elements>,
        document.body
    );
}

function Dialogo({ onCerrar, onRecarga }) {
    const stripe = useStripe();
    const elements = useElements();
    const { currency, formatPrice } = useCurrency();
    const { user } = useAuthStore();

    const [seleccion, setSeleccion] = useState(500);   // uno de SUGERIDOS, o 'otro'
    const [otro, setOtro] = useState('');

    const [tarjetas, setTarjetas] = useState([]);
    const [tarjeta, setTarjeta] = useState('nueva');   // 'nueva' o el id del metodo
    const [guardar, setGuardar] = useState(false);

    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState(null);
    const [faltaPerfil, setFaltaPerfil] = useState(false);
    const [exito, setExito] = useState(null);          // { amount, balance }

    // El clientSecret se guarda junto al monto con el que nacio: mientras el
    // monto no cambie se reutiliza, y asi un segundo intento tras un rechazo no
    // deja PaymentIntents sueltos. Si el monto cambia, el de antes ya no sirve.
    const [pago, setPago] = useState(null);            // { secret, monto }

    const monto = seleccion === 'otro' ? Math.round(parseFloat(otro) * 100) / 100 : seleccion;
    const montoValido = Number.isFinite(monto) && monto >= MIN_MXN && monto <= MAX_MXN;

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const alPulsar = (e) => { if (e.key === 'Escape' && !procesando) onCerrar(); };
        window.addEventListener('keydown', alPulsar);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', alPulsar);
        };
    }, [onCerrar, procesando]);

    // Las tarjetas guardadas cuelgan del mismo Stripe Customer que usa el
    // checkout, asi que quien ya compro en la tienda no vuelve a teclear la suya.
    useEffect(() => {
        let vivo = true;
        fetch('/api/payment-methods')
            .then(r => r.json())
            .then(d => {
                if (!vivo) return;
                const pms = d.paymentMethods || [];
                setTarjetas(pms);
                if (pms.length) setTarjeta(pms[0].id);
            })
            .catch(() => { });
        return () => { vivo = false; };
    }, []);

    const elegirMonto = (valor) => {
        setSeleccion(valor);
        setError(null);
        // El cargo preparado era por el monto anterior: se descarta para que el
        // siguiente intento pida uno nuevo.
        setPago(null);
    };

    const pagar = async () => {
        if (!stripe || !elements || !montoValido || procesando) return;

        setProcesando(true);
        setError(null);
        setFaltaPerfil(false);

        try {
            // ── 1. El cargo, preparado en el servidor ────────────────────
            let secreto = (pago && pago.monto === monto) ? pago.secret : null;
            if (!secreto) {
                const res = await fetch('/api/credit/topup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: monto,
                        currency: currency || 'MXN',
                        saveCard: tarjeta === 'nueva' && guardar,
                    }),
                });
                const data = await res.json();
                if (!data.success) {
                    if (data.needsProfile) setFaltaPerfil(true);
                    setError(data.error || 'No se pudo preparar el pago.');
                    return;
                }
                secreto = data.clientSecret;
                setPago({ secret: secreto, monto });
            }

            // El cobro se deja apuntado ANTES de mandarlo. A partir de la
            // linea de abajo puede haber dinero cobrado, y si esta pestaña no
            // llega al paso 3 nadie mas sabria que ese PaymentIntent existe:
            // el apunte deja que Mi Cuenta lo reintente la proxima vez.
            anotarRecarga(secreto.split('_secret_')[0]);

            // ── 2. La tarjeta, confirmada en el navegador ────────────────
            let parametros;
            if (tarjeta !== 'nueva') {
                const cvc = elements.getElement(CardCvcElement);
                parametros = {
                    payment_method: tarjeta,
                    ...(cvc && { payment_method_options: { card: { cvc } } }),
                };
            } else {
                parametros = {
                    payment_method: {
                        card: elements.getElement(CardNumberElement),
                        billing_details: {
                            name: user?.nombre ? `${user.nombre} ${user.apellido || ''}`.trim() : 'Cliente',
                            email: user?.email || undefined,
                        },
                    },
                };
            }

            const { error: errStripe, paymentIntent } = await stripe.confirmCardPayment(secreto, parametros);
            if (errStripe) {
                // La tarjeta se rechazo: no hay cargo que acreditar y el apunte
                // solo haria que Mi Cuenta persiguiera un pago que no existe.
                olvidarRecarga();
                setError(errStripe.message);
                return;
            }
            if (paymentIntent?.status !== 'succeeded') {
                olvidarRecarga();
                setError('El pago no se completó. Intenta con otra tarjeta.');
                return;
            }

            // ── 3. El abono, en el servidor ──────────────────────────────
            // A partir de aqui el dinero YA se cobro. Si esta llamada falla, el
            // mensaje tiene que decirlo: callarlo dejaria al cliente creyendo
            // que no pago nada.
            const res = await fetch('/api/credit/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
            });
            const data = await res.json();
            if (!data.success) {
                // El apunte se queda a proposito: el cargo existe y el abono no.
                // Mi Cuenta lo reintentara sola la proxima vez que se abra.
                setError(data.error || 'Tu pago se realizó, pero no pudimos abonarlo. Escríbenos y lo resolvemos.');
                return;
            }

            olvidarRecarga();
            setPago(null);
            setExito({ amount: data.amount, balance: data.balance });
            onRecarga?.(data.balance);
        } catch (e) {
            setError(e.message || 'Error procesando el pago. Intenta nuevamente.');
        } finally {
            setProcesando(false);
        }
    };

    return (
        <div className={styles.telon} onClick={() => { if (!procesando) onCerrar(); }}>
            <div
                className={styles.dialogo}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="saldo-titulo"
            >
                <button
                    className={styles.cerrar}
                    onClick={onCerrar}
                    disabled={procesando}
                    aria-label="Cerrar"
                >
                    <X size={18} />
                </button>

                {exito ? (
                    <div className={styles.exito}>
                        <CheckCircle2 size={44} className={styles.exitoIcono} />
                        <h2 id="saldo-titulo" className={styles.titulo}>Saldo abonado</h2>
                        <p className={styles.exitoMonto}>+{fmt(exito.amount)}</p>
                        <p className={styles.exitoNota}>
                            Tu saldo disponible ahora es <strong>{fmt(exito.balance)}</strong>. Se aplica
                            solo en tu siguiente compra.
                        </p>
                        <button className={styles.pagar} onClick={onCerrar}>Listo</button>
                    </div>
                ) : (
                    <>
                        <h2 id="saldo-titulo" className={styles.titulo}>
                            <Wallet size={20} /> Comprar saldo
                        </h2>
                        <p className={styles.bajada}>
                            El saldo se abona en pesos y se descuenta solo del total de tu siguiente
                            compra.
                        </p>

                        {/* ── Monto ── */}
                        <div className={styles.montos}>
                            {SUGERIDOS.map(v => (
                                <button
                                    key={v}
                                    type="button"
                                    className={`${styles.chip} ${seleccion === v ? styles.chipActivo : ''}`}
                                    onClick={() => elegirMonto(v)}
                                    disabled={procesando}
                                >
                                    ${v}
                                </button>
                            ))}
                            <button
                                type="button"
                                className={`${styles.chip} ${seleccion === 'otro' ? styles.chipActivo : ''}`}
                                onClick={() => elegirMonto('otro')}
                                disabled={procesando}
                            >
                                Otro
                            </button>
                        </div>

                        {seleccion === 'otro' && (
                            <div className={styles.campo}>
                                <label className={styles.etiqueta} htmlFor="saldo-otro">
                                    Monto en pesos (entre ${MIN_MXN} y ${MAX_MXN})
                                </label>
                                <input
                                    id="saldo-otro"
                                    className={styles.entrada}
                                    type="number"
                                    inputMode="decimal"
                                    min={MIN_MXN}
                                    max={MAX_MXN}
                                    step="10"
                                    placeholder="500"
                                    value={otro}
                                    disabled={procesando}
                                    onChange={(e) => { setOtro(e.target.value); setPago(null); setError(null); }}
                                />
                            </div>
                        )}

                        {/* ── Tarjeta ── */}
                        {tarjetas.length > 0 && (
                            <div className={styles.campo}>
                                <span className={styles.etiqueta}>Tarjeta</span>
                                <div className={styles.tarjetas}>
                                    {tarjetas.map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            className={`${styles.opcion} ${tarjeta === t.id ? styles.opcionActiva : ''}`}
                                            onClick={() => setTarjeta(t.id)}
                                            disabled={procesando}
                                        >
                                            <CreditCard size={15} />
                                            <span>{t.brand?.toUpperCase()} •••• {t.last4}</span>
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className={`${styles.opcion} ${tarjeta === 'nueva' ? styles.opcionActiva : ''}`}
                                        onClick={() => setTarjeta('nueva')}
                                        disabled={procesando}
                                    >
                                        <CreditCard size={15} />
                                        <span>Otra tarjeta</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {tarjeta !== 'nueva' ? (
                            <div className={styles.campo}>
                                <span className={styles.etiqueta}>CVC</span>
                                <div className={styles.stripeCampo}>
                                    <CardCvcElement options={campoStripe} />
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className={styles.campo}>
                                    <span className={styles.etiqueta}>Número de tarjeta</span>
                                    <div className={styles.stripeCampo}>
                                        <CardNumberElement options={{ ...campoStripe, showIcon: true, disableLink: true }} />
                                    </div>
                                </div>
                                <div className={styles.fila}>
                                    <div className={styles.campo}>
                                        <span className={styles.etiqueta}>Vencimiento</span>
                                        <div className={styles.stripeCampo}>
                                            <CardExpiryElement options={campoStripe} />
                                        </div>
                                    </div>
                                    <div className={styles.campo}>
                                        <span className={styles.etiqueta}>CVC</span>
                                        <div className={styles.stripeCampo}>
                                            <CardCvcElement options={campoStripe} />
                                        </div>
                                    </div>
                                </div>
                                <label className={styles.guardar}>
                                    <input
                                        type="checkbox"
                                        checked={guardar}
                                        disabled={procesando}
                                        onChange={(e) => { setGuardar(e.target.checked); setPago(null); }}
                                    />
                                    <span>Guardar esta tarjeta para la próxima vez</span>
                                </label>
                            </>
                        )}

                        {/* ── Resumen ── */}
                        <div className={styles.resumen}>
                            <span>Saldo que recibes</span>
                            <strong>{montoValido ? fmt(monto) : '—'}</strong>
                        </div>
                        {montoValido && currency === 'USD' && (
                            <p className={styles.aviso}>
                                Tu tarjeta verá el cargo en dólares ({formatPrice(monto)}), al tipo de
                                cambio del día.
                            </p>
                        )}

                        {error && (
                            <p className={styles.error}>
                                {error}
                                {faltaPerfil && (
                                    <>
                                        {' '}
                                        <Link href="/perfil/ajustes" className={styles.errorEnlace}>
                                            Completar perfil
                                        </Link>
                                    </>
                                )}
                            </p>
                        )}

                        <button
                            className={styles.pagar}
                            onClick={pagar}
                            disabled={!stripe || !montoValido || procesando}
                        >
                            {procesando ? 'Procesando…' : `Pagar ${montoValido ? fmt(monto) : ''}`}
                        </button>
                        <p className={styles.seguro}>
                            <Lock size={12} /> El cobro lo procesa Stripe. La tienda no guarda tu tarjeta.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
