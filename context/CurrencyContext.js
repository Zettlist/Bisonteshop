'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const CurrencyContext = createContext();

const FALLBACK_USD_RATE = 0.049; // 1 MXN = 0.049 USD (fallback si falla API)
const CACHE_KEY = 'bisonte-usd-rate';
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

async function fetchUSDRate() {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.rate;

        const res = await fetch('https://open.er-api.com/v6/latest/MXN');
        const data = await res.json();
        const rate = data?.rates?.USD;
        if (rate) {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, ts: Date.now() }));
            return rate;
        }
    } catch {}
    return FALLBACK_USD_RATE;
}

export function CurrencyProvider({ children }) {
    const [currency, setCurrency] = useState('MXN');
    const [usdRate, setUsdRate] = useState(FALLBACK_USD_RATE);

    useEffect(() => {
        const saved = localStorage.getItem('bisonte-currency');
        if (saved === 'USD' || saved === 'MXN') setCurrency(saved);
        fetchUSDRate().then(setUsdRate);
    }, []);

    const changeCurrency = (c) => {
        if (c === 'MXN' || c === 'USD') {
            setCurrency(c);
            localStorage.setItem('bisonte-currency', c);
        }
    };

    const formatPrice = (priceInMXN) => {
        if (!priceInMXN || isNaN(priceInMXN)) {
            return currency === 'USD' ? '$0.00 USD' : '$0.00';
        }
        if (currency === 'USD') {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(priceInMXN * usdRate) + ' USD';
        }
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(priceInMXN);
    };

    return (
        <CurrencyContext.Provider value={{
            currency,
            changeCurrency,
            formatPrice,
            usdRate,
            availableCurrencies: ['MXN', 'USD'],
        }}>
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    return useContext(CurrencyContext);
}
