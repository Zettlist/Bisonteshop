'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCartStore } from '@/store/cartStore';
import LoginModal from '@/components/LoginModal';
import { useCurrency } from '@/context/CurrencyContext';
import { useAuthStore } from '@/store/authStore';
import { CheckCircle, ShieldCheck, Truck, CreditCard, ShoppingBag, ArrowLeft, Plus, Minus, Trash2, Tag, X, Wallet } from 'lucide-react';
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
    const addCoupon = useCartStore(state => state.addCoupon);
    const removeCoupon = useCartStore(state => state.removeCoupon);
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
    const [savedCards, setSavedCards] = useState([]);
    const [selectedCard, setSelectedCard] = useState(null); // id del PM guardado

    const [discountInput, setDiscountInput] = useState('');
    const [discountError, setDiscountError] = useState(null);
    const [discountSuccess, setDiscountSuccess] = useState(null);
    const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
    const [step2Error, setStep2Error] = useState(null);
    const [useCreditBalance, setUseCreditBalance] = useState(false);
    const [clientSecret, setClientSecret] = useState(null);
    const [savedAddress, setSavedAddress] = useState(null);
    const [showAddressBanner, setShowAddressBanner] = useState(false);

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
            // Cargar tarjetas guardadas
            fetch('/api/payment-methods')
                .then(r => r.json())
                .then(({ paymentMethods }) => { if (paymentMethods?.length) setSavedCards(paymentMethods); })
                .catch(() => {});
            // Cargar dirección guardada
            fetch('/api/addresses')
                .then(r => r.json())
                .then(({ address }) => {
                    if (address) {
                        setSavedAddress(address);
                        setShowAddressBanner(true);
                    }
                })
                .catch(() => {});
        }
    }, [isMounted, isAuthenticated, setIsLoginOpen]);

    if (!isMounted) return null;

    const totals = getTotals();

    const handleNextStep = async () => {
        if (step === 2) {
            // Validar campos requeridos
            const required = [
                { key: 'nombre_recibe', label: 'Nombre de quien recibe' },
                { key: 'telefono', label: 'Teléfono de contacto' },
                { key: 'calle', label: 'Calle' },
                { key: 'numero_exterior', label: 'Número Exterior' },
                { key: 'colonia', label: 'Colonia' },
                { key: 'cp', label: 'Código Postal' },
                { key: 'municipio', label: 'Ciudad / Municipio' },
                { key: 'estado', label: 'Estado' },
            ];
            const missing = required.find(f => !shippingForm[f.key]?.trim());
            if (missing) {
                setStep2Error(`El campo "${missing.label}" es obligatorio.`);
                return;
            }
            if (shippingForm.telefono.replace(/\D/g, '').length < 10) {
                setStep2Error('El teléfono debe tener al menos 10 dígitos.');
                return;
            }
            setStep2Error(null);

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
                        saveCard,
                    })
                });
                const data = await res.json();
                if (data.success) {
                    setClientSecret(data.clientSecret);
                } else {
                    setStep2Error(data.error || 'Error al preparar el pago. Intenta nuevamente.');
                    return;
                }
            } catch (e) {
                setStep2Error('Error de conexión. Verifica tu internet e intenta de nuevo.');
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
        if (step2Error) setStep2Error(null);
    };

    const applySavedAddress = () => {
        if (!savedAddress) return;
        const [numExt, ...numIntParts] = (savedAddress.numero || '').split(' Int. ');
        setShippingForm(prev => ({
            ...prev,
            nombre_recibe: savedAddress.nombre_recibe || '',
            calle: savedAddress.calle || '',
            numero_exterior: numExt || '',
            numero_interior: numIntParts.join(' Int. ') || '',
            colonia: savedAddress.colonia || '',
            cp: savedAddress.cp || '',
            municipio: savedAddress.municipio || '',
            estado: savedAddress.estado || '',
        }));
        setShowAddressBanner(false);
    };

    const handlePayment = async () => {
        if (!stripe || !clientSecret) return;

        setIsProcessing(true);
        setPaymentError(null);

        try {
            let confirmParams;

            if (selectedCard) {
                // Pagar con tarjeta guardada
                confirmParams = { payment_method: selectedCard };
            } else {
                // Pagar con nueva tarjeta
                const cardElement = elements.getElement(CardElement);
                confirmParams = {
                    payment_method: {
                        card: cardElement,
                        billing_details: {
                            name: user?.nombre ? `${user.nombre} ${user.apellido || ''}`.trim() : 'Cliente',
                            email: user?.email || undefined,
                        }
                    },
                };
            }

            const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, confirmParams);

            if (error) {
                setPaymentError(error.message);
                return;
            }

            if (paymentIntent.status === 'requires_capture') {
                const totals = getTotals();

                // Guardar dirección de envío para futuros pedidos
                if (user?.id && shippingForm.calle) {
                    fetch('/api/addresses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(shippingForm),
                    }).catch(() => {});
                }

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
        const code = discountInput.trim().toUpperCase();
        const alreadyApplied = totals.appliedCoupons?.find(c => c.code === code);
        if (alreadyApplied) { setDiscountError('Este cupón ya fue aplicado'); return; }

        setIsApplyingDiscount(true);
        setDiscountError(null);
        setDiscountSuccess(null);
        try {
            const res = await fetch('/api/discount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, subtotal: totals.subtotalStock + totals.subtotalAnticipos })
            });
            const data = await res.json();
            if (data.success) {
                addCoupon(data.code, data.discountAmount);
                setDiscountInput('');
                setDiscountSuccess(data.code);
                setTimeout(() => setDiscountSuccess(null), 3000);
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

                            {/* Banner dirección guardada */}
                            {showAddressBanner && savedAddress && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        background: 'rgba(230,57,70,0.08)',
                                        border: '1px solid rgba(230,57,70,0.3)',
                                        borderRadius: '12px',
                                        padding: '14px 18px',
                                        marginBottom: '20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '2px' }}>
                                            📍 Tienes una dirección guardada
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                                            {savedAddress.calle} {savedAddress.numero}, {savedAddress.colonia}, {savedAddress.municipio}, {savedAddress.estado} CP {savedAddress.cp}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                        <button
                                            onClick={applySavedAddress}
                                            style={{
                                                background: 'var(--primary)', color: '#fff',
                                                border: 'none', borderRadius: '8px',
                                                padding: '8px 16px', fontSize: '0.8rem',
                                                fontWeight: 700, cursor: 'pointer',
                                            }}
                                        >
                                            Usar esta dirección
                                        </button>
                                        <button
                                            onClick={() => setShowAddressBanner(false)}
                                            style={{
                                                background: 'transparent', color: 'var(--muted)',
                                                border: '1px solid var(--border)', borderRadius: '8px',
                                                padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer',
                                            }}
                                        >
                                            Ignorar
                                        </button>
                                    </div>
                                </motion.div>
                            )}

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

                            {step2Error && (
                                <div style={{
                                    color: '#ef4444',
                                    fontSize: '0.88rem',
                                    background: 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    borderRadius: '8px',
                                    padding: '0.75rem 1rem',
                                    marginTop: '0.5rem',
                                }}>
                                    ✗ {step2Error}
                                </div>
                            )}

                            <div className={styles.checkoutActions}>
                                <button className={styles.btnSecondary} onClick={handlePrevStep} disabled={isProcessing}>
                                    <ArrowLeft size={18} style={{ display: 'inline', marginRight: '8px' }}/> Volver al carrito
                                </button>
                                <button
                                    className={styles.btnPrimary}
                                    style={{ width: 'fit-content', margin: 0 }}
                                    onClick={handleNextStep}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? 'Preparando pago...' : 'Continuar a Pago'}
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

                                {/* Tarjetas guardadas */}
                                {savedCards.length > 0 && (
                                    <div className={styles.savedCardsSection}>
                                        <div className={styles.savedCardsTitle}>Tus tarjetas guardadas</div>
                                        <div className={styles.savedCardsList}>
                                            {savedCards.map(card => (
                                                <motion.div
                                                    key={card.id}
                                                    className={`${styles.savedCard} ${selectedCard === card.id ? styles.savedCardSelected : ''}`}
                                                    onClick={() => setSelectedCard(selectedCard === card.id ? null : card.id)}
                                                    whileHover={{ scale: 1.01 }}
                                                    whileTap={{ scale: 0.98 }}
                                                >
                                                    <div className={styles.savedCardBrand}>
                                                        {card.brand === 'visa' ? '💳' : card.brand === 'mastercard' ? '💳' : '💳'}
                                                        <span className={styles.savedCardBrandName}>{card.brand.toUpperCase()}</span>
                                                    </div>
                                                    <span className={styles.savedCardNumber}>•••• •••• •••• {card.last4}</span>
                                                    <span className={styles.savedCardExp}>{card.exp_month}/{String(card.exp_year).slice(-2)}</span>
                                                    {selectedCard === card.id && (
                                                        <span className={styles.savedCardCheck}><CheckCircle size={16} /></span>
                                                    )}
                                                    <button
                                                        className={styles.savedCardDelete}
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            await fetch('/api/payment-methods', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ paymentMethodId: card.id }) });
                                                            setSavedCards(prev => prev.filter(c => c.id !== card.id));
                                                            if (selectedCard === card.id) setSelectedCard(null);
                                                        }}
                                                        title="Eliminar tarjeta"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </motion.div>
                                            ))}
                                        </div>
                                        {savedCards.length > 0 && (
                                            <button
                                                className={styles.useNewCardBtn}
                                                onClick={() => setSelectedCard(null)}
                                            >
                                                {selectedCard ? '+ Usar otra tarjeta' : '+ Agregar nueva tarjeta'}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Formulario nueva tarjeta */}
                                <AnimatePresence>
                                    {!selectedCard && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            style={{ overflow: 'hidden' }}
                                        >
                                            <label className={styles.label} style={{ marginBottom: '0.75rem', display: 'block' }}>
                                                {savedCards.length > 0 ? 'Nueva tarjeta' : 'Datos de Tarjeta'}
                                            </label>
                                            <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
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
                                        </motion.div>
                                    )}
                                </AnimatePresence>

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

                    {/* ── Cupones ── */}
                    <div className={styles.couponSection}>
                        <div className={styles.couponLabel}><Tag size={13} /> Códigos de descuento</div>

                        {/* Cupones ya aplicados */}
                        <AnimatePresence>
                            {(totals.appliedCoupons || []).map(c => (
                                <motion.div
                                    key={c.code}
                                    className={styles.couponTag}
                                    initial={{ opacity: 0, scale: 0.85, y: -6 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.85 }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                >
                                    <CheckCircle size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                                    <span className={styles.couponCode}>{c.code}</span>
                                    <span className={styles.couponAmount}>−{formatPrice(c.amount)}</span>
                                    <button className={styles.couponRemove} onClick={() => removeCoupon(c.code)}>
                                        <X size={13} />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {/* Input nuevo cupón */}
                        <div className={styles.couponInputRow}>
                            <input
                                type="text"
                                className={`${styles.input} ${styles.couponInput} ${discountError ? styles.inputError : discountSuccess ? styles.inputSuccess : ''}`}
                                placeholder="Código de cupón"
                                value={discountInput}
                                onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(null); }}
                                onKeyDown={e => e.key === 'Enter' && handleApplyDiscount()}
                            />
                            <motion.button
                                className={styles.couponBtn}
                                onClick={handleApplyDiscount}
                                disabled={isApplyingDiscount || !discountInput}
                                whileTap={{ scale: 0.95 }}
                            >
                                {isApplyingDiscount ? (
                                    <span className={styles.couponSpinner} />
                                ) : (
                                    'Aplicar'
                                )}
                            </motion.button>
                        </div>

                        <AnimatePresence mode="wait">
                            {discountError && (
                                <motion.span key="err" className={styles.couponMsg} style={{ color: '#ef4444' }}
                                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                    ✗ {discountError}
                                </motion.span>
                            )}
                            {discountSuccess && (
                                <motion.span key="ok" className={styles.couponMsg} style={{ color: '#10b981' }}
                                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                    ✓ Cupón <strong>{discountSuccess}</strong> aplicado
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Saldo de tienda ── */}
                    {user?.store_credit > 0 && (
                        <motion.div
                            className={`${styles.creditCard} ${useCreditBalance ? styles.creditCardActive : ''}`}
                            onClick={() => {
                                const next = !useCreditBalance;
                                setUseCreditBalance(next);
                                if (next) applyCredit(user.store_credit);
                                else applyCredit(0);
                            }}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <div className={styles.creditCardLeft}>
                                <div className={`${styles.creditIcon} ${useCreditBalance ? styles.creditIconActive : ''}`}>
                                    <Wallet size={18} />
                                </div>
                                <div>
                                    <div className={styles.creditCardTitle}>Saldo de tienda</div>
                                    <div className={styles.creditCardSub}>
                                        Disponible: <strong>{formatPrice(user.store_credit)}</strong>
                                    </div>
                                </div>
                            </div>
                            <div className={`${styles.creditToggle} ${useCreditBalance ? styles.creditToggleOn : ''}`}>
                                <div className={styles.creditToggleThumb} />
                            </div>
                        </motion.div>
                    )}

                    {totals.creditDiscount > 0 && (
                        <div className={styles.summaryRow} style={{ color: '#10b981' }}>
                            <span>Saldo de tienda aplicado</span>
                            <span>−{formatPrice(totals.creditDiscount)}</span>
                        </div>
                    )}
                    {totals.promoDiscount > 0 && (
                        <div className={styles.summaryRow} style={{ color: '#10b981' }}>
                            <span>Descuentos totales</span>
                            <span>−{formatPrice(totals.promoDiscount)}</span>
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
