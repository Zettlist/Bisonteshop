'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import styles from './CalificarProducto.module.css';

/**
 * Las estrellas que el cliente puede tocar.
 *
 * `RatingStars` pinta el promedio y no se toca; esto es lo otro, el sitio donde
 * una nota entra. Hasta ahora no existia ninguno: las columnas de la base
 * estaban listas desde hacia meses y no habia forma humana de escribirlas.
 *
 * Tocar la estrella que ya esta marcada quita la opinion. Es la unica salida
 * para quien se equivoco de estrella y no quiere dejar una nota que no piensa:
 * sin eso, un resbalon en la primera estrella se queda para siempre.
 */
export default function CalificarProducto({ productoId, onResumen }) {
    const setIsLoginOpen = useCartStore(state => state.setIsLoginOpen);
    const [nota, setNota] = useState(null);
    const [encima, setEncima] = useState(0);
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState(null);
    // Un producto de prueba no esta en la tabla y la nota no tiene donde caer:
    // el endpoint contesta 404 y aqui el bloque simplemente se retira.
    const [sinSitio, setSinSitio] = useState(false);

    useEffect(() => {
        let vivo = true;
        setNota(null);
        setAviso(null);
        setSinSitio(false);
        fetch(`/api/productos/${productoId}/opinion`)
            .then(r => r.json())
            .then(d => { if (vivo && d?.success) setNota(d.nota); })
            .catch(() => {});
        return () => { vivo = false; };
    }, [productoId]);

    const calificar = async (valor) => {
        if (guardando) return;
        const quitar = valor === nota;

        setGuardando(true);
        setAviso(null);
        try {
            const res = await fetch(`/api/productos/${productoId}/opinion`, {
                method: quitar ? 'DELETE' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: quitar ? undefined : JSON.stringify({ nota: valor }),
            });

            // Sin sesion no se pierde el gesto: se abre el acceso y, una vez
            // dentro, la estrella sigue donde el dedo la dejo.
            if (res.status === 401) {
                setIsLoginOpen(true);
                return;
            }
            if (res.status === 404) {
                setSinSitio(true);
                return;
            }

            const d = await res.json();
            if (!res.ok || !d.success) {
                setAviso(d?.error || 'No se pudo guardar tu calificación');
                return;
            }

            setNota(d.nota);
            // El promedio cambia con la nota que se acaba de dejar: la ficha lo
            // repinta al momento en vez de esperar a que caduque el cache de
            // /api/productos, que son cinco minutos.
            onResumen?.({ rating: d.rating, rating_count: d.rating_count });
            setAviso(quitar ? 'Quitaste tu calificación' : '¡Gracias por calificar!');
        } catch {
            setAviso('No se pudo guardar tu calificación');
        } finally {
            setGuardando(false);
        }
    };

    if (sinSitio) return null;

    const marcadas = encima || nota || 0;

    return (
        <div className={styles.bloque}>
            <span className={styles.titulo}>
                {nota ? 'Tu calificación' : 'Califica este producto'}
            </span>

            <div
                className={styles.estrellas}
                onMouseLeave={() => setEncima(0)}
                role="group"
                aria-label="Tu calificación"
            >
                {[1, 2, 3, 4, 5].map(i => (
                    <button
                        key={i}
                        type="button"
                        className={`${styles.estrella} ${i <= marcadas ? styles.marcada : ''}`}
                        onMouseEnter={() => setEncima(i)}
                        onFocus={() => setEncima(i)}
                        onBlur={() => setEncima(0)}
                        onClick={() => calificar(i)}
                        disabled={guardando}
                        aria-pressed={nota === i}
                        aria-label={i === nota
                            ? `Quitar tu calificación de ${i} ${i === 1 ? 'estrella' : 'estrellas'}`
                            : `${i} ${i === 1 ? 'estrella' : 'estrellas'}`}
                    >
                        <Star size={22} strokeWidth={1.5} fill={i <= marcadas ? 'currentColor' : 'none'} />
                    </button>
                ))}
            </div>

            {/* El hueco del aviso esta siempre: sin el, la primera calificacion
                empujaba hacia abajo el boton de agregar al carrito. */}
            <span className={`${styles.aviso} ${aviso ? styles.avisoVisible : ''}`} role="status">
                {aviso || (nota ? 'Toca la misma estrella para quitarla' : '')}
            </span>
        </div>
    );
}
