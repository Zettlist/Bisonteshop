'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export function CartProvider({ children }) {
    const [cartItems, setCartItems] = useState([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    // Initialize from LocalStorage just once on mount
    useEffect(() => {
        setIsMounted(true);
        try {
            const savedCart = localStorage.getItem('bisonte-cart');
            if (savedCart) {
                setCartItems(JSON.parse(savedCart));
            }
        } catch (error) {
            console.error("Failed to load cart from localStorage", error);
        }
    }, []);

    // Save to LocalStorage whenever cartItems change
    useEffect(() => {
        if (isMounted) {
            localStorage.setItem('bisonte-cart', JSON.stringify(cartItems));
        }
    }, [cartItems, isMounted]);

    const addToCart = (product) => {
        setCartItems((prevItems) => {
            const existingItem = prevItems.find((item) => item.id === product.id);
            if (existingItem) {
                // Determine max stock available
                const maxStock = product.stock || 1;
                // If it exists, just update quantity if it doesn't exceed stock
                if (existingItem.quantity < maxStock) {
                    return prevItems.map((item) =>
                        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                    );
                } else {
                    return prevItems; // Optionally trigger a toast notification here later
                }
            }
            // If it's pure new, add with quantity 1
            return [...prevItems, { ...product, quantity: 1 }];
        });

        // Always open sidebar when adding an item for user feedback
        setIsCartOpen(true);
    };

    const removeFromCart = (productId) => {
        setCartItems((prevItems) => prevItems.filter((item) => item.id !== productId));
    };

    const updateQuantity = (productId, newQuantity) => {
        if (newQuantity < 1) {
            removeFromCart(productId);
            return;
        }

        setCartItems((prevItems) => {
            return prevItems.map((item) => {
                if (item.id === productId) {
                    const maxStock = item.stock || 1;
                    const finalQuantity = newQuantity > maxStock ? maxStock : newQuantity;
                    return { ...item, quantity: finalQuantity };
                }
                return item;
            });
        });
    };

    const clearCart = () => {
        setCartItems([]);
    };

    const totalItemsCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

    return (
        <CartContext.Provider
            value={{
                cartItems,
                isCartOpen,
                setIsCartOpen,
                addToCart,
                removeFromCart,
                updateQuantity,
                clearCart,
                totalItemsCount,
                isMounted
            }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    return useContext(CartContext);
}
