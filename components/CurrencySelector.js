'use client';

import { useState, useRef, useEffect } from 'react';
import { useCurrency } from '@/context/CurrencyContext';
import styles from './CurrencySelector.module.css';
import { MX, US } from 'country-flag-icons/react/3x2';

const FLAGS = {
    MXN: <MX title="México" />,
    USD: <US title="Estados Unidos" />,
};

const LABELS = {
    MXN: 'Peso Mexicano',
    USD: 'Dólar Americano',
};

export default function CurrencySelector() {
    const { currency, changeCurrency } = useCurrency();
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSelect = (cur) => { changeCurrency(cur); setIsOpen(false); };

    return (
        <div className={styles.container} ref={ref}>
            <button
                className={styles.triggerBtn}
                onClick={() => setIsOpen(v => !v)}
                aria-label="Seleccionar moneda"
                aria-expanded={isOpen}
            >
                <span className={styles.flagIcon}>{FLAGS[currency]}</span>
                <span className={styles.currencyCode}>{currency}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ marginLeft: '4px', opacity: 0.6, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {isOpen && (
                <ul className={styles.dropdownList}>
                    {['MXN', 'USD'].map((cur) => (
                        <li
                            key={cur}
                            className={`${styles.dropdownItem} ${currency === cur ? styles.active : ''}`}
                            onClick={() => handleSelect(cur)}
                        >
                            <span className={styles.flagIcon}>{FLAGS[cur]}</span>
                            <div className={styles.curInfo}>
                                <span className={styles.curCode}>{cur}</span>
                                <span className={styles.curLabel}>{LABELS[cur]}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
