'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { useCurrency } from '@/context/CurrencyContext';
import { useRouter } from 'next/navigation';
import styles from './CartSidebar.module.css';

export default function CartSidebar() {
    const router = useRouter();
    const [isMounted, setIsMounted] = useState(false);
    
    const isCartOpen = useCartStore((state) => state.isCartOpen);
    const setIsCartOpen = useCartStore((state) => state.setIsCartOpen);
    const cartItems = useCartStore((state) => state.items);
    const updateQuantity = useCartStore((state) => state.updateQuantity);
    const removeFromCart = useCartStore((state) => state.removeItem);
    const getTotals = useCartStore((state) => state.getTotals);

    const { formatPrice } = useCurrency();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return null;

    const totals = getTotals();
    const totalItemsCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

    const handleCheckout = () => {
        setIsCartOpen(false);
        router.push('/checkout');
    };

    return (
        <AnimatePresence>
            {isCartOpen && (
                <>
                    {/* Backdrop Overlay */}
                    <motion.div
                        className={styles.overlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsCartOpen(false)}
                    />

                    {/* Sliding Sidebar */}
                    <motion.div
                        className={styles.sidebar}
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    >
                        {/* Header */}
                        <div className={styles.header}>
                            <h2>Mi Carrito <span className={styles.badge}>{totalItemsCount}</span></h2>
                            <button className={styles.closeBtn} onClick={() => setIsCartOpen(false)}>
                                <X size={24} />
                            </button>
                        </div>

                        {/* Cart Items List */}
                        <div className={styles.cartList}>
                            {cartItems.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <ShoppingBag size={48} className={styles.emptyIcon} />
                                    <p>Tu carrito está vacío</p>
                                    <button
                                        className={styles.continueBtn}
                                        onClick={() => setIsCartOpen(false)}
                                    >
                                        Seguir comprando
                                    </button>
                                </div>
                            ) : (
                                cartItems.map((item) => (
                                    <div key={`${item.id}-${item.type}`} className={styles.cartItem}>
                                        <div className={styles.itemImageWrapper}>
                                            {item.image_url ? (
                                                <img src={item.image_url} alt={item.title} className={styles.itemImage} />
                                            ) : (
                                                <div className={styles.placeholderImage}>📚</div>
                                            )}
                                        </div>

                                        <div className={styles.itemInfo}>
                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                                              {item.type === 'preventa' ? (
                                                  <span className={styles.preventaBadge}>Preventa ({item.anticipo_percent}% Anticipo)</span>
                                              ) : (
                                                  <span className={styles.stockBadge}>Stock</span>
                                              )}
                                            </div>
                                            <h4 className={styles.itemTitle}>{item.title}</h4>
                                            
                                            {item.type === 'preventa' ? (
                                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span className={styles.itemPriceLabel}>Anticipo Hoy: <span className={styles.itemPrice}>{formatPrice(item.price * (item.anticipo_percent/100))}</span></span>
                                              </div>
                                            ) : (
                                              <span className={styles.itemPrice}>{formatPrice(item.price)}</span>
                                            )}

                                            <div className={styles.controlsRow}>
                                                <div className={styles.quantityControls}>
                                                    <button
                                                        className={styles.qtyBtn}
                                                        onClick={() => updateQuantity(item.id, item.type, item.quantity - 1)}
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <span className={styles.qtyValue}>{item.quantity}</span>
                                                    <button
                                                        className={styles.qtyBtn}
                                                        onClick={() => updateQuantity(item.id, item.type, item.quantity + 1)}
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>

                                                <button
                                                    className={styles.removeBtn}
                                                    onClick={() => removeFromCart(item.id, item.type)}
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer (Totals & Checkout) */}
                        {cartItems.length > 0 && (
                            <div className={styles.footer}>
                                <div className={styles.totals}>
                                    <div className={styles.totalRow}>
                                        <span>Subtotal de productos</span>
                                        <span>{formatPrice(totals.subtotalStock)}</span>
                                    </div>
                                    <div className={styles.totalRow}>
                                        <span>Subtotal de anticipos</span>
                                        <span>{formatPrice(totals.subtotalAnticipos)}</span>
                                    </div>
                                    <div className={styles.totalRow}>
                                        <span>Envío</span>
                                        <span>Calculado en checkout</span>
                                    </div>
                                    <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                                        <span>Total a pagar hoy</span>
                                        <span style={{ color: 'var(--primary)' }}>{formatPrice(totals.totalToPayNow)}</span>
                                    </div>
                                    {totals.totalLater > 0 && (
                                      <div className={styles.totalRow} style={{ marginTop: '0.5rem', color: '#f59e0b', fontWeight: 'bold' }}>
                                          <span>Saldo pendiente al recibir</span>
                                          <span>{formatPrice(totals.totalLater)}</span>
                                      </div>
                                    )}
                                </div>

                                <button className={styles.checkoutBtn} onClick={handleCheckout}>
                                    Proceder al Pago
                                </button>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
