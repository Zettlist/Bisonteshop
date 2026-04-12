'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCartStore } from '@/store/cartStore';
import LoginModal from '@/components/LoginModal';
import { useCurrency } from '@/context/CurrencyContext';
import { useAuthStore } from '@/store/authStore';
import { CheckCircle, ShieldCheck, Truck, CreditCard, ShoppingBag, ArrowLeft, Plus, Minus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './checkout.module.css';

// Ensure you replace this with your actual Stripe publishable key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_mock');

export default function CheckoutPage() {
    return (
        <Elements stripe={stripePromise}>
            <CheckoutFlow />
        </Elements>
    );
}

function CheckoutFlow() {
    const router = useRouter();
    const { isAuthenticated, user } = useAuthStore();
    const cartItems = useCartStore(state => state.items);
    const getTotals = useCartStore(state => state.getTotals);
    const setShippingCost = useCartStore(state => state.setShippingCost);
    const applyCredit = useCartStore(state => state.applyCredit);
    const setDiscount = useCartStore(state => state.setDiscount);
    const removeDiscount = useCartStore(state => state.removeDiscount);
    const appliedDiscount = useCartStore(state => state.appliedDiscount);
    const clearCart = useCartStore(state => state.clearCart);
    const updateQuantity = useCartStore(state => state.updateQuantity);
    const removeItem = useCartStore(state => state.removeItem);
    const setIsLoginOpen = useCartStore(state => state.setIsLoginOpen);
    const isLoginOpen = useCartStore(state => state.isLoginOpen);

    const { formatPrice } = useCurrency();
    const [step, setStep] = useState(1);
    const [isMounted, setIsMounted] = useState(false);
    
    // Form States
    const [shippingForm, setShippingForm] = useState({
        nombre_recibe: '',
        telefono: '',
        calle: '',
        numero_exterior: '',
        numero_interior: '',
        colonia: '',
        cp: '',
        municipio: '',
        estado: '',
        entre_calles: '',
        referencias: '',
    });

    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentError, setPaymentError] = useState(null);
    const [orderNumber, setOrderNumber] = useState(null);
    const [saveCard, setSaveCard] = useState(false);

    const [discountInput, setDiscountInput] = useState('');
    const [discountError, setDiscountError] = useState(null);
    const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
    const [clientSecret, setClientSecret] = useState(null);

    const stripe = useStripe();
    const elements = useElements();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (isMounted && !isAuthenticated) {
            setIsLoginOpen(true);
        }
        if (isAuthenticated) {
            setIsLoginOpen(false);
        }
    }, [isMounted, isAuthenticated, setIsLoginOpen]);

    if (!isMounted) return null;

    const totals = getTotals();

    const handleNextStep = async () => {
        if (step === 2) {
            setShippingCost(150);
            // Crear PaymentIntent al avanzar al paso de pago
            setIsProcessing(true);
            try {
                const res = await fetch('/api/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        items: cartItems,
                        userId: user?.id,
                        discountCode: appliedDiscount?.code || null,
                        appliedCredit: totals.appliedCredit || 0,
                    })
                });
                const data = await res.json();
                if (data.success) {
                    setClientSecret(data.clientSecret);
                } else {
                    setPaymentError(data.error || 'Error al preparar el pago');
                    return;
                }
            } catch (e) {
                setPaymentError('Error de conexión al preparar el pago');
                return;
            } finally {
                setIsProcessing(false);
            }
        }
        setStep(prev => Math.min(prev + 1, 4));
        window.scrollTo(0, 0);
    };

    const handlePrevStep = () => {
        setStep(prev => Math.max(prev - 1, 1));
        window.scrollTo(0, 0);
    };

    const handleInputChange = (e) => {
        setShippingForm({ ...shippingForm, [e.target.name]: e.target.value });
    };

    const handlePayment = async () => {
        if (!stripe || !elements || !clientSecret) return;

        setIsProcessing(true);
        setPaymentError(null);

        try {
            const cardElement = elements.getElement(CardElement);
            const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: cardElement,
                    billing_details: {
                        name: user?.nombre ? `${user.nombre} ${user.apellido || ''}`.trim() : 'Cliente',
                        email: user?.email || undefined,
                    }
                },
                setup_future_usage: saveCard ? 'off_session' : undefined,
            });

            if (error) {
                setPaymentError(error.message);
                return;
            }

            if (paymentIntent.status === 'succeeded') {
                const totals = getTotals();
                await fetch('/api/checkout/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentIntentId: paymentIntent.id,
                        items: cartItems,
                        userId: user?.id || null,
                        userEmail: user?.email || null,
                        userName: user?.nombre || null,
                        subtotal: (totals.subtotalStock || 0) + (totals.subtotalAnticipos || 0),
                        discount: totals.promoDiscount || 0,
                        shipping: totals.shippingCost || 150,
                        total: totals.totalToPayNow || 0,
                    })
                });

                const orderNumber = 'BS-' + paymentIntent.id.slice(-8).toUpperCase();
                setOrderNumber(orderNumber);
                clearCart();
                setStep(4);
            }
        } catch (err) {
            setPaymentError(err.message || 'Error procesando el pago. Intenta nuevamente.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApplyDiscount = async () => {
        if (!discountInput.trim()) return;
        setIsApplyingDiscount(true);
        setDiscountError(null);
        try {
            const res = await fetch('/api/discount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: discountInput, subtotal: totals.subtotalStock + totals.subtotalAnticipos })
            });
            const data = await res.json();
            if (data.success) {
                setDiscount(data.code, data.discountAmount);
                setDiscountInput('');
            } else {
                setDiscountError(data.error);
            }
        } catch (e) {
            setDiscountError('Error aplicando descuento');
        } finally {
            setIsApplyingDiscount(false);
        }
    };

    // Si no está autenticado, mostrar solo el modal de login
    if (!isAuthenticated) {
        return (
            <LoginModal
                isOpen={isLoginOpen}
                onClose={() => {
                    setIsLoginOpen(false);
                    router.push('/');
                }}
            />
        );
    }

    // If cart is empty and we are not in success step
    if (cartItems.length === 0 && step !== 4) {
        return (
            <div className={styles.checkoutContainer} style={{ gridTemplateColumns: '1fr', textAlign: 'center', padding: '6rem 2rem' }}>
                <ShoppingBag size={64} style={{ margin: '0 auto 1rem', color: 'var(--muted)' }} />
                <h2>Tu carrito está vacío</h2>
                <button className={styles.btnPrimary} style={{ width: 'auto', marginTop: '2rem' }} onClick={() => router.push('/')}>
                    Volver a la tienda
                </button>
            </div>
        );
    }

    return (
        <div className={step === 4 ? styles.checkoutContainerSuccess : styles.checkoutContainer}>
            {/* Main Content Column */}
            <div className={styles.mainColumn}>
                
                {step < 4 && (
                    <div className={styles.progressIndicator}>
                        <div className={`${styles.progressStep} ${step >= 1 ? styles.active : ''}`}>
                            <ShoppingBag size={18} /> Carrito
                        </div>
                        <div className={styles.progressDivider}>—</div>
                        <div className={`${styles.progressStep} ${step >= 2 ? styles.active : ''}`}>
                            <Truck size={18} /> Envío
                        </div>
                        <div className={styles.progressDivider}>—</div>
                        <div className={`${styles.progressStep} ${step >= 3 ? styles.active : ''}`}>
                            <CreditCard size={18} /> Pago
                        </div>
                    </div>
                )}

                <AnimatePresence mode="wait">
                    {/* STEP 1: Revisar Carrito */}
                    {step === 1 && (
                        <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                            <div className={styles.stepHeader}>
                                <h1>Revisar Carrito</h1>
                                <p className="text-muted">Asegúrate de que tus productos y cantidades sean correctos antes de proceder al pago.</p>
                            </div>

                            <div className={styles.cartList}>
                                {cartItems.map(item => (
                                    <motion.div
                                        key={`${item.id}-${item.type}`}
                                        className={styles.cartItem}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                    >
                                        {/* Imagen */}
                                        <div className={styles.itemImageWrapper}>
                                            <img src={item.image_url || '/placeholder.jpg'} alt={item.title} className={styles.itemImage} />
                                        </div>

                                        {/* Info central */}
                                        <div className={styles.itemDetails}>
                                            <span className={item.type === 'preventa' ? styles.badgePreventa : styles.badgeStock}>
                                                {item.type === 'preventa' ? `Preventa · ${item.anticipo_percent}% anticipo` : 'En stock'}
                                            </span>
                                            <h3 className={styles.itemTitle}>{item.title}</h3>
                                            <p className={styles.itemUnitPrice}>
                                                {formatPrice(item.price)} c/u
                                            </p>

                                            {/* Controles de cantidad */}
                                            <div className={styles.qtyControls}>
                                                <button
                                                    className={styles.qtyBtn}
                                                    onClick={() => item.quantity > 1 ? updateQuantity(item.id, item.type, item.quantity - 1) : removeItem(item.id, item.type)}
                                                    aria-label="Reducir cantidad"
                                                >
                                                    <Minus size={14} />
                                                </button>
                                                <span className={styles.qtyValue}>{item.quantity}</span>
                                                <button
                                                    className={styles.qtyBtn}
                                                    onClick={() => updateQuantity(item.id, item.type, item.quantity + 1)}
                                                    aria-label="Aumentar cantidad"
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Precio y eliminar */}
                                        <div className={styles.itemRight}>
                                            {item.type === 'preventa' ? (
                                                <div className={styles.itemPriceBlock}>
                                                    <span className={styles.itemPriceLabel}>Anticipo hoy</span>
                                                    <span className={styles.itemPrice}>
                                                        {formatPrice(item.price * (item.anticipo_percent / 100) * item.quantity)}
                                                    </span>
                                                    <span className={styles.itemPriceFull}>
                                                        Total: {formatPrice(item.price * item.quantity)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className={styles.itemPriceBlock}>
                                                    <span className={styles.itemPrice}>
                                                        {formatPrice(item.price * item.quantity)}
                                                    </span>
                                                </div>
                                            )}
                                            <button
                                                className={styles.removeBtn}
                                                onClick={() => removeItem(item.id, item.type)}
                                                aria-label="Eliminar producto"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className={styles.checkoutActions}>
                                <button className={styles.btnSecondary} onClick={() => router.push('/')}>
                                    ← Seguir comprando
                                </button>
                                <button className={styles.btnPrimary} style={{ width: 'fit-content', margin: 0 }} onClick={handleNextStep}>
                                    Continuar con Envío
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 2: Datos de Envío */}
                    {step === 2 && (
                        <motion.div key="step2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                            <div className={styles.stepHeader}>
                                <h1>Dirección de Envío</h1>
                                <p className="text-muted">Ingresa a dónde enviaremos tu pedido. Todos los envíos se realizan por paquetería express.</p>
                            </div>

                            <div className={styles.formGrid}>
                                {/* Nombre y teléfono */}
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Nombre de quien recibe *</label>
                                    <input className={styles.input} name="nombre_recibe" value={shippingForm.nombre_recibe} onChange={handleInputChange} required maxLength={50} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Teléfono de contacto *</label>
                                    <input className={styles.input} name="telefono" type="tel" value={shippingForm.telefono} onChange={handleInputChange} required maxLength={10} placeholder="10 dígitos" />
                                </div>

                                {/* Calle y números */}
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Calle *</label>
                                    <input className={styles.input} name="calle" value={shippingForm.calle} onChange={handleInputChange} required maxLength={50} />
                                </div>
                                <div className={styles.formGroup} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    <div>
                                        <label className={styles.label}>Núm. Exterior *</label>
                                        <input className={styles.input} name="numero_exterior" value={shippingForm.numero_exterior} onChange={handleInputChange} required maxLength={10} />
                                    </div>
                                    <div>
                                        <label className={styles.label}>Núm. Interior</label>
                                        <input className={styles.input} name="numero_interior" value={shippingForm.numero_interior} onChange={handleInputChange} maxLength={10} placeholder="Depto., piso…" />
                                    </div>
                                </div>

                                {/* Colonia y CP */}
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Colonia *</label>
                                    <input className={styles.input} name="colonia" value={shippingForm.colonia} onChange={handleInputChange} required maxLength={50} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Código Postal *</label>
                                    <input className={styles.input} name="cp" value={shippingForm.cp} onChange={handleInputChange} required maxLength={5} placeholder="5 dígitos" />
                                </div>

                                {/* Ciudad y Estado */}
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Ciudad / Municipio *</label>
                                    <input className={styles.input} name="municipio" value={shippingForm.municipio} onChange={handleInputChange} required maxLength={35} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Estado *</label>
                                    <select className={styles.input} name="estado" value={shippingForm.estado} onChange={handleInputChange} required>
                                        <option value="">Selecciona un estado</option>
                                        {['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Guanajuato','Guerrero','Hidalgo','Jalisco','Estado de México','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'].map(e => (
                                            <option key={e} value={e}>{e}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Entre calles y referencias */}
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Entre calles <span style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>(opcional)</span></label>
                                    <input className={styles.input} name="entre_calles" value={shippingForm.entre_calles} onChange={handleInputChange} maxLength={80} placeholder="Ej. Entre Insurgentes y Reforma" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Referencias <span style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>(opcional)</span></label>
                                    <input className={styles.input} name="referencias" value={shippingForm.referencias} onChange={handleInputChange} maxLength={100} placeholder="Ej. Casa color rojo, portón negro" />
                                </div>
                            </div>

                            <div className={styles.checkoutActions}>
                                <button className={styles.btnSecondary} onClick={handlePrevStep}>
                                    <ArrowLeft size={18} style={{ display: 'inline', marginRight: '8px' }}/> Volver al carrito
                                </button>
                                <button className={styles.btnPrimary} style={{ width: 'fit-content', margin: 0 }} onClick={handleNextStep}>
                                    Continuar a Pago
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 3: Pago */}
                    {step === 3 && (
                        <motion.div key="step3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                            <div className={styles.stepHeader}>
                                <h1>Resumen y Pago</h1>
                                <p className="text-muted"><ShieldCheck size={18} style={{ display: 'inline', color: '#10b981' }}/> Transacción segura y encriptada por Stripe.</p>
                            </div>

                            <div className={styles.paymentContainer}>
                                <label className={styles.label} style={{ marginBottom: '1rem', display: 'block' }}>Datos de Tarjeta</label>
                                <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                    <CardElement options={{
                                        style: {
                                            base: {
                                                fontSize: '16px',
                                                color: '#ffffff',
                                                '::placeholder': { color: '#aab7c4' },
                                                iconColor: '#ff2e4b',
                                            },
                                            invalid: { color: '#ef4444' }
                                        }
                                    }}/>
                                </div>
                                {/* Guardar tarjeta */}
                                <label className={styles.saveCardLabel}>
                                    <input
                                        type="checkbox"
                                        checked={saveCard}
                                        onChange={e => setSaveCard(e.target.checked)}
                                        className={styles.saveCardCheck}
                                    />
                                    <span>
                                        Guardar tarjeta para futuras compras
                                        <span className={styles.saveCardSafe}> · Procesado de forma segura por Stripe</span>
                                    </span>
                                </label>

                                {paymentError && (
                                    <div style={{ color: '#ef4444', fontSize: '0.9rem', marginTop: '1rem' }}>{paymentError}</div>
                                )}
                            </div>

                            <div className={styles.checkoutActions}>
                                <button className={styles.btnSecondary} onClick={handlePrevStep} disabled={isProcessing}>
                                    <ArrowLeft size={18} style={{ display: 'inline', marginRight: '8px' }}/> Volver a envío
                                </button>
                                <button className={styles.btnPrimary} style={{ width: 'fit-content', margin: 0 }} onClick={handlePayment} disabled={isProcessing || !stripe}>
                                    {isProcessing ? 'Procesando...' : `Pagar ${formatPrice(totals.totalToPayNow)}`}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 4: Confirmación */}
                    {step === 4 && (
                        <motion.div
                            key="step4"
                            className={styles.successContainer}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.45 }}
                        >
                            {/* Header */}
                            <div className={styles.successHeader}>
                                <motion.div
                                    className={styles.checkmarkWrapper}
                                    initial={{ scale: 0.6, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ duration: 0.4, ease: 'backOut' }}
                                >
                                    <svg className={styles.checkmarkSvg} viewBox="0 0 52 52">
                                        <motion.path
                                            d="M14 27 L22 35 L38 18"
                                            fill="none" stroke="#10b981"
                                            strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                                            initial={{ pathLength: 0 }}
                                            animate={{ pathLength: 1 }}
                                            transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
                                        />
                                    </svg>
                                </motion.div>
                                <div>
                                    <motion.h1
                                        className={styles.successTitle}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.35, duration: 0.4 }}
                                    >
                                        ¡Pedido Confirmado!
                                    </motion.h1>
                                    <motion.p
                                        className={styles.successSubtitle}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.5, duration: 0.4 }}
                                    >
                                        Orden <strong>{orderNumber}</strong> — Te enviaremos la confirmación a tu correo.
                                    </motion.p>
                                </div>
                            </div>

                            {/* Barra de progreso del pedido */}
                            <motion.div
                                className={styles.progressCard}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.6, duration: 0.4 }}
                            >
                                <p className={styles.progressCardTitle}>Estado del Pedido</p>

                                {/* Track line */}
                                <div className={styles.progressTrack}>
                                    {[
                                        { icon: '✅', label: 'Confirmado',              desc: 'Pago recibido',                        done: true,  active: false },
                                        { icon: '🔍', label: 'Confirmación de existencias', desc: 'Verificando stock en almacén',        done: false, active: true  },
                                        { icon: '📦', label: 'Preparando',              desc: 'Armando tu paquete',                   done: false, active: false },
                                        { icon: '🚚', label: 'En camino',               desc: 'Con la paquetería',                    done: false, active: false },
                                        { icon: '🏠', label: 'Entregado',               desc: 'En tu puerta',                         done: false, active: false },
                                    ].map((s, i, arr) => (
                                        <div key={s.label} className={styles.progressStepWrap}>
                                            <div className={`${styles.progressStep} ${s.done ? styles.progressDone : s.active ? styles.progressActive : styles.progressPending}`}>
                                                <div className={styles.progressBubble}>
                                                    <span>{s.icon}</span>
                                                </div>
                                                <div className={styles.progressInfo}>
                                                    <span className={styles.progressLabel}>{s.label}</span>
                                                    <span className={styles.progressDesc}>{s.desc}</span>
                                                </div>
                                            </div>
                                            {i < arr.length - 1 && (
                                                <div className={`${styles.progressLine} ${s.done ? styles.progressLineDone : ''}`} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* Botones */}
                            <motion.div
                                className={styles.successActions}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.9, duration: 0.4 }}
                            >
                                <button className={styles.btnSecondary} onClick={() => router.push('/perfil/mis-pedidos')}>
                                    Ver mis pedidos
                                </button>
                                <button className={styles.btnPrimary} onClick={() => router.push('/')}>
                                    Volver a la Tienda
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Sticky Summary Column */}
            {step < 4 && (
                <div className={styles.summaryColumn}>
                    <h2 className={styles.summaryTitle}>Resumen del Pedido</h2>
                    
                    <div className={styles.summaryRow}>
                        <span>Subtotal de Productos</span>
                        <span>{formatPrice(totals.subtotalStock)}</span>
                    </div>

                    {totals.subtotalAnticipos > 0 && (
                        <div className={styles.summaryRow}>
                            <span>Anticipos de Preventa</span>
                            <span>{formatPrice(totals.subtotalAnticipos)}</span>
                        </div>
                    )}

                    {step >= 3 && (
                        <div className={styles.summaryRow}>
                            <span>Costo de Envío</span>
                            <span>{formatPrice(totals.shippingCost)}</span>
                        </div>
                    )}

                    <div className={styles.creditSection} style={{ marginTop: '1.5rem', paddingTop: '1.5rem' }}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className={styles.label} style={{ display: 'block', marginBottom: '0.5rem' }}>Código de Descuento</label>
                            {appliedDiscount.code ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '4px', border: '1px solid #10b981' }}>
                                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>{appliedDiscount.code} aplicado</span>
                                    <button onClick={removeDiscount} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', textDecoration: 'underline' }}>Remover</button>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input 
                                            type="text" 
                                            className={styles.input} 
                                            placeholder="Ingresa tu cupón" 
                                            value={discountInput}
                                            onChange={(e) => setDiscountInput(e.target.value)}
                                            style={{ flex: 1 }}
                                        />
                                        <button className={styles.btnSecondary} onClick={handleApplyDiscount} disabled={isApplyingDiscount || !discountInput}>
                                            {isApplyingDiscount ? '...' : 'Aplicar'}
                                        </button>
                                    </div>
                                    {discountError && <span style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{discountError}</span>}
                                </div>
                            )}
                        </div>

                        {totals.promoDiscount > 0 && (
                            <div className={styles.summaryRow} style={{ color: '#10b981' }}>
                                <span>Descuento aplicado</span>
                                <span>-{formatPrice(totals.promoDiscount)}</span>
                            </div>
                        )}
                    </div>

                    {user?.store_credit > 0 && (
                        <div className={styles.creditSection}>
                            <div className={styles.creditHeader}>
                                <span>Crédito de Tienda Disponible</span>
                                <span className={styles.creditBalance}>{formatPrice(user.store_credit)}</span>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={totals.creditDiscount > 0} 
                                    onChange={(e) => {
                                        if (e.target.checked) applyCredit(user.store_credit);
                                        else applyCredit(0);
                                    }}
                                />
                                Aplicar crédito a esta compra
                            </label>
                            {totals.creditDiscount > 0 && (
                                <div className={styles.summaryRow} style={{ marginTop: '1rem', color: '#10b981' }}>
                                    <span>Crédito Aplicado</span>
                                    <span>-{formatPrice(totals.creditDiscount)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className={`${styles.summaryRow} ${styles.totalNow}`}>
                        <span>Total a pagar hoy</span>
                        <span style={{ color: 'var(--primary)' }}>{formatPrice(totals.totalToPayNow)}</span>
                    </div>

                    {totals.totalLater > 0 && (
                        <div className={`${styles.summaryRow} ${styles.totalLater}`}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span>Saldo pendiente al recibir preventas:</span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'rgba(245, 158, 11, 0.8)', marginTop: '4px' }}>Este monto no se cobra de tu tarjeta hoy. Se te notificará cuando el producto esté en stock para su liquidación.</span>
                            </div>
                            <span style={{ fontSize: '1.2rem', marginLeft: '1rem' }}>{formatPrice(totals.totalLater)}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
