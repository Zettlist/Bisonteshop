'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { useCurrency } from '@/context/CurrencyContext';
import styles from './CartPopover.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Carrito en popover, colgado del boton de la barra.
//
// Antes era un panel lateral que tapaba la pantalla. La idea aqui es que
// agregar y quitar cosas no interrumpa la compra: el popover se abre junto al
// icono, se edita en dos clics y se cierra al hacer clic fuera. A /checkout
// solo se va cuando el cliente ya quiere pagar.
//
// Se monta DENTRO del boton del carrito (que es position: relative), asi queda
// anclado sin calcular coordenadas.
// ─────────────────────────────────────────────────────────────────────────────
export default function CartPopover() {
    const router = useRouter();
    const [montado, setMontado] = useState(false);
    const ref = useRef(null);

    const isCartOpen = useCartStore((s) => s.isCartOpen);
    const setIsCartOpen = useCartStore((s) => s.setIsCartOpen);
    const cartItems = useCartStore((s) => s.items);
    const updateQuantity = useCartStore((s) => s.updateQuantity);
    const removeFromCart = useCartStore((s) => s.removeItem);
    const getTotals = useCartStore((s) => s.getTotals);

    const { formatPrice } = useCurrency();

    useEffect(() => { setMontado(true); }, []);

    // Clic fuera y Escape lo cierran. El clic se escucha en 'mousedown' para
    // que cerrar no dispare de paso el boton que hay debajo.
    useEffect(() => {
        if (!isCartOpen) return;
        const fuera = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setIsCartOpen(false);
        };
        const tecla = (e) => { if (e.key === 'Escape') setIsCartOpen(false); };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', tecla);
        return () => {
            document.removeEventListener('mousedown', fuera);
            document.removeEventListener('keydown', tecla);
        };
    }, [isCartOpen, setIsCartOpen]);

    if (!montado) return null;

    const totals = getTotals();
    const totalItems = cartItems.reduce((acc, i) => acc + i.quantity, 0);

    const irAPagar = () => {
        setIsCartOpen(false);
        router.push('/checkout');
    };

    return (
        <AnimatePresence>
            {isCartOpen && (
                <motion.div
                    ref={ref}
                    className={styles.popover}
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    // El popover vive dentro del boton del carrito: sin esto,
                    // cualquier clic adentro tambien contaria como clic al boton
                    // y lo cerraria.
                    onClick={(e) => e.stopPropagation()}
                >
                    <span className={styles.pico} aria-hidden="true" />

                    <div className={styles.cabecera}>
                        <span className={styles.titulo}>Mi carrito</span>
                        <span className={styles.cuenta}>
                            {totalItems} {totalItems === 1 ? 'artículo' : 'artículos'}
                        </span>
                    </div>

                    {cartItems.length === 0 ? (
                        <div className={styles.vacio}>
                            <ShoppingBag size={30} />
                            <p>Tu carrito está vacío</p>
                            <button className={styles.seguir} onClick={() => setIsCartOpen(false)}>
                                Seguir comprando
                            </button>
                        </div>
                    ) : (
                        <>
                            <ul className={styles.lista}>
                                {cartItems.map((item) => (
                                    <li key={`${item.id}-${item.type}`} className={styles.item}>
                                        <div className={styles.miniatura}>
                                            {item.image_url
                                                ? <img src={item.image_url} alt="" />
                                                : <span className={styles.sinFoto}>📚</span>}
                                        </div>

                                        <div className={styles.datos}>
                                            <p className={styles.nombre} title={item.title}>{item.title}</p>

                                            {item.type === 'preventa' ? (
                                                <span className={styles.preventa}>
                                                    Preventa · anticipo {item.anticipo_percent}% ·{' '}
                                                    <strong>{formatPrice(item.price * (item.anticipo_percent / 100))}</strong>
                                                </span>
                                            ) : (
                                                <span className={styles.precio}>{formatPrice(item.price)}</span>
                                            )}

                                            <div className={styles.controles}>
                                                <div className={styles.cantidad}>
                                                    <button
                                                        onClick={() => updateQuantity(item.id, item.type, item.quantity - 1)}
                                                        aria-label="Quitar uno"
                                                    >
                                                        <Minus size={13} />
                                                    </button>
                                                    <span>{item.quantity}</span>
                                                    <button
                                                        onClick={() => updateQuantity(item.id, item.type, item.quantity + 1)}
                                                        aria-label="Agregar uno"
                                                    >
                                                        <Plus size={13} />
                                                    </button>
                                                </div>
                                                <button
                                                    className={styles.eliminar}
                                                    onClick={() => removeFromCart(item.id, item.type)}
                                                    aria-label={`Eliminar ${item.title}`}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>

                            <div className={styles.pie}>
                                <div className={styles.fila}>
                                    <span>Productos</span>
                                    <span>{formatPrice(totals.subtotalStock)}</span>
                                </div>
                                {totals.subtotalAnticipos > 0 && (
                                    <div className={styles.fila}>
                                        <span>Anticipos</span>
                                        <span>{formatPrice(totals.subtotalAnticipos)}</span>
                                    </div>
                                )}
                                <div className={styles.fila}>
                                    <span>Envío</span>
                                    <span className={styles.tenue}>se calcula al pagar</span>
                                </div>
                                <div className={`${styles.fila} ${styles.total}`}>
                                    <span>Total hoy</span>
                                    <span className={styles.montoTotal}>{formatPrice(totals.totalToPayNow)}</span>
                                </div>
                                {totals.totalLater > 0 && (
                                    <div className={`${styles.fila} ${styles.pendiente}`}>
                                        <span>Pendiente al recibir</span>
                                        <span>{formatPrice(totals.totalLater)}</span>
                                    </div>
                                )}

                                <button className={styles.pagar} onClick={irAPagar}>
                                    Proceder al pago
                                </button>
                            </div>
                        </>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
