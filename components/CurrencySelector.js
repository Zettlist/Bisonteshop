'use client';

import { useState, useRef, useEffect } from 'react';
import { useCurrency } from '@/context/CurrencyContext';
import styles from './CurrencySelector.module.css';

// Usamos SVG flags para que se vean bien en todos los S.O.
import { MX, US, EU, CO, CL, AR } from 'country-flag-icons/react/3x2';

const CURRENCY_FLAGS = {
    MXN: <MX title="México" className={styles.flagIcon} />,
    USD: <US title="Estados Unidos" className={styles.flagIcon} />,
    EUR: <EU title="Unión Europea" className={styles.flagIcon} />,
    COP: <CO title="Colombia" className={styles.flagIcon} />,
    CLP: <CL title="Chile" className={styles.flagIcon} />,
    ARS: <AR title="Argentina" className={styles.flagIcon} />,
};

export default function CurrencySelector() {
    const { currency, changeCurrency, availableCurrencies } = useCurrency();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Cierra el menú si se hace click fuera
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (cur) => {
        changeCurrency(cur);
        setIsOpen(false);
    };

    return (
        <div className={styles.container} ref={dropdownRef}>
            <button
                className={styles.triggerBtn}
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Seleccionar moneda"
                aria-expanded={isOpen}
            >
                {CURRENCY_FLAGS[currency]}
                <span className={styles.currencyCode}>{currency}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '4px', opacity: 0.6 }}>
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>

            {isOpen && (
                <ul className={styles.dropdownList}>
                    {availableCurrencies.map((cur) => (
                        <li
                            key={cur}
                            className={`${styles.dropdownItem} ${currency === cur ? styles.active : ''}`}
                            onClick={() => handleSelect(cur)}
                        >
                            {CURRENCY_FLAGS[cur]}
                            <span>{cur}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
