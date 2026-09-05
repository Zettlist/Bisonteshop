'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import FichaProducto from './FichaProducto';
import styles from './ProductoPopup.module.css';

/**
 * La ficha de producto, encima de la pagina en la que estabas.
 *
 * No hay una segunda ficha: se monta el mismo FichaProducto que sirve
 * /producto/<slug>. Lo que se arregle alli aparece aqui sin tocar nada, y al
 * reves; una version reducida acabaria desincronizada a la primera semana.
 */

// La salida se desmonta por reloj y no esperando a que la animacion avise de
// que termino: cuando ese aviso no llega, el velo se queda en el arbol con
// opacidad 0 tapando la pagina entera, y deja de poderse hacer clic en nada.
// Tiene que ir acompasado con la animacion `veloSale` del CSS.
const SALIDA_MS = 190;

export default function ProductoPopup({ id, onCerrar }) {
    const [datos, setDatos] = useState(null);
    const [fallo, setFallo] = useState(false);
    const [pintado, setPintado] = useState(false);
    const panel = useRef(null);
    const abierto = id != null;

    useEffect(() => {
        if (abierto) {
            setPintado(true);
            return;
        }
        if (!pintado) return;
        const reloj = setTimeout(() => setPintado(false), SALIDA_MS);
        return () => clearTimeout(reloj);
    }, [abierto, pintado]);

    useEffect(() => {
        if (!abierto) return;
        // Si cierras y abres otra deprisa, la respuesta lenta de la primera no
        // debe pintarse encima de la segunda.
        let vigente = true;
        setDatos(null);
        setFallo(false);

        fetch(`/api/productos/${id}`)
            .then(r => r.json())
            .then(j => { if (vigente) j.success ? setDatos(j) : setFallo(true); })
            .catch(() => { if (vigente) setFallo(true); });

        return () => { vigente = false; };
    }, [abierto, id]);

    useEffect(() => {
        if (!abierto) return;
        const tecla = e => { if (e.key === 'Escape') onCerrar(); };
        document.addEventListener('keydown', tecla);

        // El fondo deja de correr: sin esto la pagina de atras se desplaza bajo
        // el popup y al cerrarlo apareces en otro punto del catalogo.
        const antes = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', tecla);
            document.body.style.overflow = antes;
        };
    }, [abierto, onCerrar]);

    // El foco entra al panel: si se queda en la tarjeta de atras, el tabulador
    // sigue recorriendo el landing por debajo del popup.
    useEffect(() => {
        if (abierto) panel.current?.focus();
    }, [abierto, datos]);

    if (!pintado) return null;

    return (
        <div
            className={`${styles.velo} ${abierto ? '' : styles.veloSale}`}
            // En mousedown y no en click: si empiezas a seleccionar texto dentro
            // y sueltas fuera, el popup no debe cerrarse.
            onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}
        >
            <div
                ref={panel}
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-label="Ficha del producto"
                tabIndex={-1}
            >
                <button
                    type="button"
                    className={styles.cerrar}
                    onClick={onCerrar}
                    aria-label="Cerrar ficha"
                >
                    <X size={18} />
                </button>

                {/* El scroll vive aqui y no en el velo: la columna de la portada
                    es sticky y necesita que su contenedor sea el que se
                    desplaza, o se queda pegada a la nada. */}
                <div className={styles.cuerpo}>
                    {datos ? (
                        <FichaProducto producto={datos.producto} similares={datos.similares} />
                    ) : fallo ? (
                        <p className={styles.aviso}>
                            No pudimos cargar esta ficha. Cierra y vuelve a intentarlo.
                        </p>
                    ) : (
                        <p className={styles.aviso} aria-live="polite">Cargando ficha…</p>
                    )}
                </div>
            </div>
        </div>
    );
}
