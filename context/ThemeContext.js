'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => { } });

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState('dark');
    const pathname = usePathname();

    useEffect(() => {
        const isAdultos = pathname?.startsWith('/adultos');
        const saved = localStorage.getItem('bisonte-theme') || 'dark';

        if (isAdultos) {
            document.documentElement.setAttribute('data-theme', 'adultos');
        } else {
            setTheme(saved);
            document.documentElement.setAttribute('data-theme', saved);
        }
    }, [pathname]);

    const toggleTheme = () => {
        const isAdultos = pathname?.startsWith('/adultos');
        if (isAdultos) return; // Bloquear cambio de tema en la sección adultos

        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('bisonte-theme', next);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}

