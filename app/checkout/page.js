'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCartStore } from '@/store/cartStore';
import LoginModal from '@/components/LoginModal';
import { useCurrency } from '@/context/CurrencyContext';
import { useAuthStore } from '@/store/authStore';
import { CheckCircle, ChevronDown, ShieldCheck, Truck, CreditCard, ShoppingBag, ArrowLeft, Plus, Minus, Trash2, Tag, X, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './checkout.module.css';

// Ensure you replace this with your actual Stripe publishable key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_mock');

export default function CheckoutPage() {
    return (
        <Elements stripe={stripePromise} options={{ wallets: { link: 'never' } }}>
            <CheckoutFlow />
        </Elements>
    );
}

// ── Saved address dropdown ─────────────────────────────
function AddressDropdown({ addresses, onSelect }) {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState(null);
    const ref = React.useRef(null);

    React.useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSelect = (addr) => {
        setSelected(addr);
        setOpen(false);
        onSelect(addr);
    };

    const label = selected
        ? `${selected.calle}${selected.numero_ext ? ` #${selected.numero_ext}` : ''}, ${selected.colonia}, ${selected.municipio}`
        : 'Selecciona una dirección guardada';

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${open ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: '10px', color: selected ? 'var(--foreground)' : 'var(--muted)',
                    fontSize: '0.9rem', fontFamily: 'var(--font-sans)', cursor: 'pointer',
                    boxShadow: open ? '0 0 0 3px rgba(230,57,70,0.12)' : 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s', textAlign: 'left', gap: '0.5rem',
                }}
            >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                </span>
                <ChevronDown size={15} style={{ flexShrink: 0, color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {open && (
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: '10px', zIndex: 50, overflow: 'hidden',
                        boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
                    }}
                >
                    {addresses.map((addr, i) => (
                        <button
                            key={addr.id}
                            type="button"
                            onClick={() => handleSelect(addr)}
                            style={{
                                width: '100%', padding: '0.85rem 1rem',
                                background: selected?.id === addr.id ? 'rgba(230,57,70,0.07)' : 'transparent',
                                border: 'none', borderBottom: i < addresses.length - 1 ? '1px solid var(--border)' : 'none',
                                cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
                                display: 'flex', flexDirection: 'column', gap: '0.2rem',
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { if (selected?.id !== addr.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                            onMouseLeave={e => { if (selected?.id !== addr.id) e.currentTarget.style.background = 'transparent'; }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--foreground)' }}>
                                    {addr.nombre_recibe || `${addr.calle} #${addr.numero_ext}`}
                                </span>
                                {addr.is_default === 1 && (
                                    <span style={{
                                        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.8px',
                                        textTransform: 'uppercase', color: 'var(--primary)',
                                        background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.25)',
                                        padding: '0.1rem 0.4rem', borderRadius: '20px',
                                    }}>Principal</span>
                                )}
                                {selected?.id === addr.id && <CheckCircle size={13} style={{ color: 'var(--primary)', marginLeft: 'auto' }} />}
                            </div>
                            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                                {addr.calle}{addr.numero_ext ? ` #${addr.numero_ext}` : ''}{addr.numero_int ? ` Int. ${addr.numero_int}` : ''}, {addr.colonia}, {addr.municipio}, {addr.estado} CP {addr.cp}
                            </span>
                        </button>
                    ))}
                </motion.div>
            )}
        </div>
    );
}

function CheckoutFlow() {
    const router = useRouter();
    const { isAuthenticated, user, clearUser } = useAuthStore();
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

    const { formatPrice, currency, usdRate } = useCurrency();
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
    const [shippingOptions, setShippingOptions] = useState(null);
    const [selectedShipping, setSelectedShipping] = useState(null);
    const [isFetchingQuote, setIsFetchingQuote] = useState(false);
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [savedAddress, setSavedAddress] = useState(null);
    const [showAddressBanner, setShowAddressBanner] = useState(false);
    const usedSavedAddressRef = React.useRef(false); // true si dirección viene de guardadas
    const [saveAddressToProfile, setSaveAddressToProfile] = useState(false);

    const stripe = useStripe();
    const elements = useElements();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (isMounted && !isAuthenticated) {
            // No expulsar a home: abrir login y conservar el carrito/checkout
            setIsLoginOpen(true);
            return;
        }
        if (isAuthenticated) {
            setIsLoginOpen(false);
            // Cargar tarjetas guardadas
            fetch('/api/payment-methods')
                .then(r => r.json())
                .then(({ paymentMethods }) => { if (paymentMethods?.length) setSavedCards(paymentMethods); })
                .catch(() => {});
            // Cargar direcciones guardadas
            fetch('/api/addresses')
                .then(r => r.json())
                .then(({ addresses }) => {
                    if (addresses?.length) {
                        setSavedAddresses(addresses);
                        const def = addresses.find(a => a.is_default) || addresses[0];
                        setSavedAddress(def);
                        setShowAddressBanner(true);
                    }
                })
                .catch(() => {});
        }
    }, [isMounted, isAuthenticated, setIsLoginOpen]);

    // Auto-fetch quote when entering step 3
    // MUST be before any conditional return (Rules of Hooks)
    React.useEffect(() => {
        if (step === 3 && !shippingOptions && !isFetchingQuote) {
            setIsFetchingQuote(true);
            fetch('/api/shipping/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: cartItems, destination: shippingForm }),
            })
                .then(r => r.json())
                .then(data => {
                    setShippingOptions(data.success ? data : { carriers: [] });
                })
                .catch(() => {
                    setShippingOptions({ carriers: [] });
                })
                .finally(() => setIsFetchingQuote(false));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    if (!isMounted) return null;

    const totals = getTotals();

    const handleNextStep = async () => {
        if (step === 2) {
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

            // Guardar dirección si usuario lo marcó
            if (saveAddressToProfile && !usedSavedAddressRef.current) {
                fetch('/api/addresses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(shippingForm),
                }).catch(() => {});
            }

            setStep(3);
            window.scrollTo(0, 0);
            return;
        }
        if (step === 3) {
            if (!selectedShipping) {
                setStep2Error('Selecciona una opción de envío para continuar.');
                return;
            }
            setStep2Error(null);
            setShippingCost(selectedShipping.price);
            setStep(4);
            window.scrollTo(0, 0);
            return;
        }
        setStep(prev => Math.min(prev + 1, 5));
        window.scrollTo(0, 0);
    };

    const handlePrevStep = () => {
        setClientSecret(null);
        if (step === 3) {
            // back to address — reset quote so it refetches if address changed
            setShippingOptions(null);
            setSelectedShipping(null);
        }
        setStep(prev => Math.max(prev - 1, 1));
        window.scrollTo(0, 0);
    };

    const handleInputChange = (e) => {
        setShippingForm({ ...shippingForm, [e.target.name]: e.target.value });
        usedSavedAddressRef.current = false;
        if (step2Error) setStep2Error(null);
        setShippingOptions(null);
        setSelectedShipping(null);
    };

    const applySavedAddress = (addr) => {
        const a = addr || savedAddress;
        if (!a) return;
        setShippingForm(prev => ({
            ...prev,
            nombre_recibe: a.nombre_recibe || '',
            telefono: a.telefono || prev.telefono || '',
            calle: a.calle || '',
            numero_exterior: a.numero_ext || '',
            numero_interior: a.numero_int || '',
            colonia: a.colonia || '',
            cp: a.cp || '',
            municipio: a.municipio || '',
            estado: a.estado || '',
            referencias: a.referencias || '',
        }));
        usedSavedAddressRef.current = true;
        setShowAddressBanner(false);
        setShippingOptions(null);
        setSelectedShipping(null);
    };

    const handlePayment = async () => {
        if (!stripe) return;

        setIsProcessing(true);
        setPaymentError(null);

        try {
            // Crear PaymentIntent aquí para capturar saveCard correcto
            let activeSecret = clientSecret;
            if (!activeSecret) {
                const totals = getTotals();
                const res = await fetch('/api/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        items: cartItems,
                        discountCode: appliedDiscount?.code || null,
                        appliedCredit: totals.appliedCredit || 0,
                        saveCard,
                        currency: currency || 'MXN',
                        usdRate: usdRate || 0.049,
                        shippingCost: totals.shippingCost || 220,
                        shippingMethod: 'envia',
                    }),
                });
                const data = await res.json();
                if (!data.success) {
                    // Sesión expirada — limpiar estado y redirigir a login
                    if (res.status === 401) {
                        clearUser();
                        router.replace('/login');
                        return;
                    }
                    setPaymentError(data.error || 'Error al preparar el pago.');
                    return;
                }
                activeSecret = data.clientSecret;
                setClientSecret(activeSecret);
            }

            let confirmParams;

            if (selectedCard) {
                // Tarjeta guardada + verificación CVC
                const cvcEl = elements.getElement(CardCvcElement);
                confirmParams = {
                    payment_method: selectedCard,
                    ...(cvcEl && { payment_method_options: { card: { cvc: cvcEl } } }),
                };
            } else {
                // Nueva tarjeta — usar CardNumberElement como referencia
                const cardNumberEl = elements.getElement(CardNumberElement);
                confirmParams = {
                    payment_method: {
                        card: cardNumberEl,
                        billing_details: {
                            name: user?.nombre ? `${user.nombre} ${user.apellido || ''}`.trim() : 'Cliente',
                            email: user?.email || undefined,
                        }
                    },
                };
            }

            const { error, paymentIntent } = await stripe.confirmCardPayment(activeSecret, confirmParams);

            if (error) {
                setPaymentError(error.message);
                return;
            }

            if (paymentIntent.status === 'requires_capture') {
                const totals = getTotals();

                // Direcciones se gestionan desde perfil/ajustes, no desde checkout

                const confirmRes = await fetch('/api/checkout/confirm', {
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
                        shipping: totals.shippingCost || 220,
                        total: totals.totalToPayNow || 0,
                        shippingMethod: 'envia',
                        envia_quote_data: selectedShipping || null,
                        shipping_address: shippingForm,
                    })
                });
                const confirmData = await confirmRes.json();
                const saleId = confirmData?.saleId;

                const orderNumber = saleId ? `#${saleId}` : ('BS-' + paymentIntent.id.slice(-8).toUpperCase());
                setOrderNumber(orderNumber);
                clearCart();
                setStep(5);
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

    // Sin sesión: pedir login en el lugar (el modal lo renderiza el Navbar vía cartStore)
    if (!isAuthenticated) {
        return (
            <div className={styles.checkoutContainer} style={{ gridTemplateColumns: '1fr', textAlign: 'center', padding: '6rem 2rem' }}>
                <ShieldCheck size={64} style={{ margin: '0 auto 1rem', color: 'var(--muted)' }} />
                <h2>Inicia sesión para continuar con tu compra</h2>
                <p className="text-muted" style={{ marginTop: '0.5rem' }}>Tu carrito sigue guardado, no se pierde nada.</p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem', flexWrap: 'wrap' }}>
                    <button className={styles.btnSecondary} style={{ width: 'auto' }} onClick={() => router.push('/')}>
                        Volver a la tienda
                    </button>
                    <button className={styles.btnPrimary} style={{ width: 'auto', margin: 0 }} onClick={() => setIsLoginOpen(true)}>
                        Iniciar sesión
                    </button>
                </div>
            </div>
        );
    }

    // If cart is empty and we are not in success step
    if (cartItems.length === 0 && step !== 5) {
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
        <div className={step === 5 ? styles.checkoutContainerSuccess : styles.checkoutContainer}>
            {/* Main Content Column */}
            <div className={styles.mainColumn}>

                {step < 5 && (
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
                            <span style={{ fontSize: '1rem' }}>📦</span> Paquetería
                        </div>
                        <div className={styles.progressDivider}>—</div>
                        <div className={`${styles.progressStep} ${step >= 4 ? styles.active : ''}`}>
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

                            {/* Dropdown direcciones guardadas */}
                            {savedAddresses.length > 0 && (
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '0.45rem' }}>
                                        Direcciones guardadas
                                    </label>
                                    <AddressDropdown
                                        addresses={savedAddresses}
                                        onSelect={applySavedAddress}
                                    />
                                </div>
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

                            {/* Guardar dirección */}
                            {isAuthenticated && !usedSavedAddressRef.current && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '1rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted)' }}>
                                    <input
                                        type="checkbox"
                                        checked={saveAddressToProfile}
                                        onChange={e => setSaveAddressToProfile(e.target.checked)}
                                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                    />
                                    Guardar esta dirección en mi perfil
                                </label>
                            )}

                            {step2Error && (
                                <div className={styles.fieldError}>✗ {step2Error}</div>
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
                                    Continuar a Paquetería
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 3: Selección de Paquetería */}
                    {step === 3 && (
                        <motion.div key="step3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                            <div className={styles.stepHeader}>
                                <h1>Opciones de Envío</h1>
                                <p className="text-muted">Selecciona cómo quieres recibir tu pedido.</p>
                            </div>

                            {isFetchingQuote ? (
                                <div className={styles.shipLoading}>
                                    <div className={styles.shipSpinner} />
                                    <p style={{ fontFamily: "'Caveat', cursive", fontSize: '1.2rem' }}>Cotizando paqueterías...</p>
                                </div>
                            ) : shippingOptions?.carriers?.length === 0 ? (
                                <div className={styles.shipEmpty}>
                                    <p style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>⚠️ No encontramos paqueterías disponibles para tu código postal.</p>
                                    <p style={{ fontSize: '0.82rem' }}>Verifica que tu dirección sea correcta o contáctanos.</p>
                                </div>
                            ) : (
                                <div className={styles.shipList}>
                                    {(shippingOptions?.carriers || []).map(opt => {
                                        const isSelected = selectedShipping?.carrier === opt.carrier && selectedShipping?.service === opt.service;
                                        return (
                                            <button
                                                key={`${opt.carrier}-${opt.service}`}
                                                type="button"
                                                onClick={() => { setSelectedShipping(opt); setStep2Error(null); }}
                                                className={`${styles.shipOption} ${isSelected ? styles.shipOptionSelected : ''}`}
                                            >
                                                <div className={styles.shipLeft}>
                                                    <div className={`${styles.shipRadio} ${isSelected ? styles.shipRadioOn : ''}`}>
                                                        {isSelected && <div className={styles.shipRadioDot} />}
                                                    </div>
                                                    <div>
                                                        <div className={styles.shipName}>📦 {opt.name}</div>
                                                        <div className={styles.shipService}>
                                                            {opt.service}{opt.deliveryEstimate ? ` · ${opt.deliveryEstimate}` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={styles.shipPrice}>
                                                    {formatPrice(opt.price)}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {step2Error && (
                                <div className={styles.fieldError}>✗ {step2Error}</div>
                            )}

                            <div className={styles.checkoutActions}>
                                <button className={styles.btnSecondary} onClick={handlePrevStep} disabled={isProcessing}>
                                    <ArrowLeft size={18} style={{ display: 'inline', marginRight: '8px' }}/> Volver a dirección
                                </button>
                                <button
                                    className={styles.btnPrimary}
                                    style={{ width: 'fit-content', margin: 0 }}
                                    onClick={handleNextStep}
                                    disabled={isProcessing || isFetchingQuote || !selectedShipping}
                                >
                                    Continuar a Pago
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 4: Pago */}
                    {step === 4 && (
                        <motion.div key="step4" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
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
                                    {/* Nueva tarjeta — 3 campos separados */}
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
                                            {/* Número */}
                                            <div style={{ marginBottom: '0.75rem' }}>
                                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.35rem' }}>Número de tarjeta</label>
                                                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #333' }}>
                                                    <CardNumberElement options={{ showIcon: true, disableLink: true, style: { base: { fontSize: '16px', color: '#fff', '::placeholder': { color: '#666' }, iconColor: '#e63946' }, invalid: { color: '#ef4444' } } }} />
                                                </div>
                                            </div>
                                            {/* Expiración + CVC */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.35rem' }}>Vencimiento</label>
                                                    <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #333' }}>
                                                        <CardExpiryElement options={{ style: { base: { fontSize: '16px', color: '#fff', '::placeholder': { color: '#666' } }, invalid: { color: '#ef4444' } } }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.35rem' }}>CVV</label>
                                                    <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #333' }}>
                                                        <CardCvcElement options={{ style: { base: { fontSize: '16px', color: '#fff', '::placeholder': { color: '#666' } }, invalid: { color: '#ef4444' } } }} />
                                                    </div>
                                                </div>
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

                                    {/* Tarjeta guardada — solo CVC */}
                                    {selectedCard && (
                                        <div style={{ marginTop: '0.75rem' }}>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.35rem' }}>Código de seguridad (CVV)</label>
                                            <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #333', maxWidth: '140px' }}>
                                                <CardCvcElement options={{ style: { base: { fontSize: '16px', color: '#fff', '::placeholder': { color: '#666' } }, invalid: { color: '#ef4444' } } }} />
                                            </div>
                                        </div>
                                    )}
                                </AnimatePresence>

                                {paymentError && (
                                    <div style={{ color: '#ef4444', fontSize: '0.9rem', marginTop: '1rem' }}>{paymentError}</div>
                                )}
                            </div>

                            <div className={styles.checkoutActions}>
                                <button className={styles.btnSecondary} onClick={handlePrevStep} disabled={isProcessing}>
                                    <ArrowLeft size={18} style={{ display: 'inline', marginRight: '8px' }}/> Volver a paquetería
                                </button>
                                <button className={styles.btnPrimary} style={{ width: 'fit-content', margin: 0 }} onClick={handlePayment} disabled={isProcessing || !stripe}>
                                    {isProcessing ? 'Procesando...' : `Pagar ${formatPrice(totals.totalToPayNow)}`}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 5: Confirmación */}
                    {step === 5 && (
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
                                        Pedido <strong>{orderNumber}</strong> — Te enviaremos la confirmación a tu correo.
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
            {step < 5 && (
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

                    {(step >= 4 || selectedShipping) && (
                        <div className={styles.summaryRow}>
                            <span>Costo de Envío {selectedShipping?.carrier ? `(${selectedShipping.carrier})` : ''}</span>
                            <span>{formatPrice(selectedShipping ? selectedShipping.price : (totals.shippingCost || 220))}</span>
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
