'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// Globo de dialogo de Bisa: el texto se escribe letra por letra, como si ella
// estuviera hablando, y el globo va creciendo con lo que lleva escrito.
//
// El globo no lleva animacion de tamano propia: envuelve al texto y crece con
// el, letra a letra. Se probo con `layout` de framer-motion y sale peor — esa
// prop interpola el tamano escalando el elemento, y lo que se deforma en cada
// paso son las letras.
//
// El texto completo va aparte en un nodo para lectores de pantalla: leer el
// parcial letra por letra seria ruido, y el visible queda oculto para ellos.
// ─────────────────────────────────────────────────────────────────────────────

// Ritmo de tecleo. Un poco mas lento tras signo de puntuacion: es lo que hace
// que se lea como habla y no como maquina.
const MS_POR_LETRA = 32;
const MS_PAUSA = 190;
const PUNTUACION = new Set(['.', ',', '!', '?', '…', ':', ';']);

export default function GloboBisa({ texto, className, retraso = 250 }) {
    const [escrito, setEscrito] = useState('');
    const [terminado, setTerminado] = useState(false);
    const reducido = useRef(false);

    useEffect(() => {
        // Quien pidio menos animacion ve la frase completa de una.
        reducido.current = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        if (reducido.current) {
            setEscrito(texto);
            setTerminado(true);
            return;
        }

        setEscrito('');
        setTerminado(false);

        let i = 0;
        let timer;

        const siguiente = () => {
            i += 1;
            setEscrito(texto.slice(0, i));
            if (i >= texto.length) { setTerminado(true); return; }
            const anterior = texto[i - 1];
            timer = setTimeout(siguiente, PUNTUACION.has(anterior) ? MS_PAUSA : MS_POR_LETRA);
        };

        // El globo aparece primero y recien entonces empieza a hablar.
        timer = setTimeout(siguiente, retraso);
        return () => clearTimeout(timer);
    }, [texto, retraso]);

    return (
        <motion.p
            className={className}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
            <span aria-hidden="true">
                {escrito}
                {!terminado && <span className="globo-cursor" />}
            </span>
            <span className="sr-only">{texto}</span>
        </motion.p>
    );
}
