'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const CurrencyContext = createContext();

// Tasas de cambio (ejemplo estático, en una app real podrían venir de una API)
// Base: MXN (Peso Mexicano)
const EXCHANGE_RATES = {
    MXN: 1,
    USD: 0.049,   // 1 MXN = 0.049 USD
    EUR: 0.046,   // 1 MXN = 0.046 EUR
    COP: 198.50,  // 1 MXN = 198.50 Pesos Colombianos
    CLP: 47.30,   // 1 MXN = 47.30 Pesos Chilenos
    ARS: 42.50,   // 1 MXN = 42.50 Pesos Argentinos
};

const CURRENCY_SYMBOLS = {
    MXN: '$',
    USD: '$',
    EUR: '€',
    COP: '$',
    CLP: '$',
    ARS: '$',
};

export function CurrencyProvider({ children }) {
    const [currency, setCurrency] = useState('MXN');

    // Cargar preferencia del usuario si existe
    useEffect(() => {
        const saved = localStorage.getItem('bisonte-currency');
        if (saved && EXCHANGE_RATES[saved]) {
            setCurrency(saved);
        }
    }, []);

    const changeCurrency = (newCurrency) => {
        if (EXCHANGE_RATES[newCurrency]) {
            setCurrency(newCurrency);
            localStorage.setItem('bisonte-currency', newCurrency);
        }
    };

    /**
     * Recibe un precio base en MXN y lo convierte a la moneda actual.
     * Devuelve un string formateado con el símbolo.
     */
    const formatPrice = (priceInMXN) => {
        if (!priceInMXN || isNaN(priceInMXN)) return `${CURRENCY_SYMBOLS[currency]}0.00`;

        const rate = EXCHANGE_RATES[currency] || 1;
        const converted = priceInMXN * rate;

        // Formatear dependiendo de la moneda
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: currency,
        }).format(converted);
    };

    return (
        <CurrencyContext.Provider value={{ currency, changeCurrency, formatPrice, availableCurrencies: Object.keys(EXCHANGE_RATES) }}>
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    return useContext(CurrencyContext);
}
