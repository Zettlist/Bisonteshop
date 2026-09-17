'use client';

import { useState } from 'react';
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
import { Wallet, X, ShieldCheck } from 'lucide-react';
import a from '@/app/perfil/apartados/Apartados.module.css';


const dinero = (n) => `$${Number(n || 0).toFixed(2)}`;

const campoStripe = {
    style: {
        base: { fontSize: '16px', color: '#fff', '::placeholder': { color: '#666' }, iconColor: '#ffd60a' },
        invalid: { color: '#ef4444' },
    },
};

/**
 * El formulario de cobro, ya dentro de <Elements>.
 *
 * Tres pasos y ninguno se puede saltar: la tienda prepara el cobro (/pay), la
 * tarjeta lo autoriza (Stripe, en el navegador) y la tienda lo registra y lo
 * cobra (/confirm).
 *
 * El estado `porRegistrar` es el que sostiene el caso feo: la tarjeta autorizo
 * pero /confirm no contesto (se cayo la red, se cerro el portatil). Ahi el
 * dinero esta retenido y no cobrado, y lo unico que falta es repetir la ultima
 * llamada — que es idempotente por el indice unico de `payment_intent_id`. Sin
 * esto, la unica salida seria volver a empezar y arriesgar una segunda
 * autorizacion sobre la misma tarjeta.
 */
function Formulario({ apartado, onListo, onCerrar }) {
    const stripe = useStripe();
    const elements = useElements();

    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState(null);
    const [porRegistrar, setPorRegistrar] = useState(null);

    const registrar = async (paymentIntentId) => {
        const res = await fetch(`/api/me/apartados/${apartado.id}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId }),
        });
        const data = await res.json();

        if (!data.success) {
            // El 409 es el unico fallo en el que se sabe que NO hubo cargo: la
            // ruta suelta la autorizacion antes de contestar. En los demas no se
            // puede prometer eso, asi que se deja el reintento a mano.
            setPorRegistrar(res.status === 409 ? null : paymentIntentId);
            setError(data.error || 'No pudimos registrar el pago.');
            return;
        }

        setPorRegistrar(null);
        onListo(data.saldo);
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

            const res = await fetch(`/api/me/apartados/${apartado.id}/pay`, { method: 'POST' });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'No pudimos preparar el pago.');
                return;
            }

            const { error: errorStripe, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
                payment_method: {
                    card: elements.getElement(CardNumberElement),
                    billing_details: { name: apartado.folio },
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
        <div className={a.modalFondo} role="dialog" aria-modal="true" aria-label="Liquidar apartado">
            <div className={a.modal}>
                <header className={a.modalCabecera}>
                    <div>
                        <h2 className={a.modalTitulo}>Liquidar {apartado.folio}</h2>
                        <p className={a.modalMeta}>Te falta <strong>{dinero(apartado.saldo)}</strong></p>
                    </div>
                    <button className={a.cerrar} onClick={onCerrar} aria-label="Cerrar" disabled={procesando}>
                        <X size={18} />
                    </button>
                </header>

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

                <button className={a.pagarBtn} onClick={pagar} disabled={procesando || !stripe}>
                    <Wallet size={16} />
                    {procesando
                        ? 'Procesando…'
                        : porRegistrar
                            ? 'Terminar el pago'
                            : `Pagar ${dinero(apartado.saldo)}`}
                </button>

                <p className={a.seguro}>
                    <ShieldCheck size={14} />
                    Cobro seguro con Stripe. Te escribimos para coordinar la entrega.
                </p>
            </div>
        </div>
    );
}

/**
 * El boton de liquidar y su dialogo.
 *
 * <Elements> se monta solo al abrir: cargar Stripe en cada tarjeta de la lista
 * seria pedir el script de Stripe tantas veces como apartados tenga la persona,
 * y casi siempre no va a pagar ninguno desde esa pantalla.
 */
export default function LiquidarApartado({ apartado, onPagado }) {
    const [abierto, setAbierto] = useState(false);

    const listo = (saldo) => {
        setAbierto(false);
        onPagado?.(apartado.id, saldo);
    };

    return (
        <>
            <button className={a.pagarBtn} onClick={() => setAbierto(true)}>
                <Wallet size={16} />
                Liquidar {dinero(apartado.saldo)}
            </button>

            {abierto && typeof document !== 'undefined' && createPortal(
                <Elements stripe={stripeDelNavegador()} options={{ wallets: { link: 'never' } }}>
                    <Formulario apartado={apartado} onListo={listo} onCerrar={() => setAbierto(false)} />
                </Elements>,
                document.body
            )}
        </>
    );
}
