'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useCurrency } from '@/context/CurrencyContext';
import styles from './CartSidebar.module.css';

export default function CartSidebar() {
    const {
        cartItems,
        isCartOpen,
        setIsCartOpen,
        removeFromCart,
        updateQuantity,
        totalItemsCount,
        isMounted
    } = useCart();

    const { formatPrice } = useCurrency();

    // Prevent hydration mismatch
    if (!isMounted) return null;

    const subtotal = cartItems.reduce((acc, item) => acc + (parseFloat(item.price) * item.quantity), 0);

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
                                    <div key={item.id} className={styles.cartItem}>
                                        <div className={styles.itemImageWrapper}>
                                            {item.image_url ? (
                                                <img src={item.image_url} alt={item.title} className={styles.itemImage} />
                                            ) : (
                                                <div className={styles.placeholderImage}>📚</div>
                                            )}
                                        </div>

                                        <div className={styles.itemInfo}>
                                            <h4 className={styles.itemTitle}>{item.title}</h4>
                                            <span className={styles.itemPrice}>{formatPrice(item.price)}</span>

                                            <div className={styles.controlsRow}>
                                                <div className={styles.quantityControls}>
                                                    <button
                                                        className={styles.qtyBtn}
                                                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <span className={styles.qtyValue}>{item.quantity}</span>
                                                    <button
                                                        className={styles.qtyBtn}
                                                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>

                                                <button
                                                    className={styles.removeBtn}
                                                    onClick={() => removeFromCart(item.id)}
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
                                        <span>Subtotal</span>
                                        <span>{formatPrice(subtotal)}</span>
                                    </div>
                                    <div className={styles.totalRow}>
                                        <span>Envío</span>
                                        <span>Calculado en el checkout</span>
                                    </div>
                                    <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                                        <span>Total estimado</span>
                                        <span>{formatPrice(subtotal)}</span>
                                    </div>
                                </div>

                                <button className={styles.checkoutBtn}>
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
