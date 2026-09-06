'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, BookmarkPlus, CalendarClock, Wallet } from 'lucide-react';
import styles from './ApartarDialogo.module.css';
import { useCurrency } from '@/context/CurrencyContext';
import { calcularApartado, fechaLimite, tipoDeApartado } from '@/lib/apartado';

export default function ApartarDialogo({ producto, onCerrar }) {
    const { formatPrice, currency } = useCurrency();
    // El tipo sale del catalogo, no de un prop: el mismo dialogo se abre
    // desde la ficha de un articulo en tienda y desde el de importacion, y
    // el anticipo no es el mismo.
    const tipo = tipoDeApartado(producto);
    const { total, anticipo, saldo, porcentaje } = calcularApartado(producto.price, tipo);
    const limite = fechaLimite(new Date(), tipo);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const alPulsar = (e) => { if (e.key === 'Escape') onCerrar(); };
        window.addEventListener('keydown', alPulsar);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', alPulsar);
        };
    }, [onCerrar]);

    if (typeof document === 'undefined') return null;

    const contenido = (
        <motion.div
            className={styles.telon}
            onClick={onCerrar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
        >
            <motion.div
                className={styles.tarjeta}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="apartar-titulo"
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
                <button className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
                    <X size={18} />
                </button>

                <h2 id="apartar-titulo" className={styles.titulo}>
                    {tipo === 'preventa' ? 'Apartar esta preventa' : 'Apartar este artículo'}
                </h2>
                <p className={styles.producto}>{producto.title}</p>

                <dl className={styles.cuentas}>
                    <div className={styles.renglon}>
                        <dt>Precio total</dt>
                        <dd>{formatPrice(total)} {currency}</dd>
                    </div>
                    <div className={`${styles.renglon} ${styles.renglonFuerte}`}>
                        <dt>Anticipo hoy</dt>
                        <dd>{formatPrice(anticipo)} {currency}</dd>
                    </div>
                    <div className={styles.renglon}>
                        <dt>Saldo restante</dt>
                        <dd>{formatPrice(saldo)} {currency}</dd>
                    </div>
                </dl>

                <ul className={styles.condiciones}>
                    <li>
                        <Wallet size={15} />
                        <span>
                            Pagas el {porcentaje}% ahora y el resto
                            cuando pases a recogerlo o antes de que te lo enviemos.
                        </span>
                    </li>
                    <li>
                        <CalendarClock size={15} />
                        <span>
                            Te lo guardamos hasta el{' '}
                            <strong>
                                {limite.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </strong>
                            . Pasada esa fecha vuelve al catálogo.
                        </span>
                    </li>
                </ul>

                {/* Este boton se enciende cuando la ruta de cobro del apartado
                    tenga el visto bueno: mueve dinero y escribe en pre_orders,
                    que es la tabla que el POS lee en Preventas. */}
                <button className={styles.confirmar} disabled>
                    <BookmarkPlus size={17} />
                    Pagar anticipo y apartar
                </button>
                <p className={styles.aviso}>
                    El cobro del anticipo todavía no está habilitado. Escríbenos y lo
                    apartamos a mano mientras tanto.
                </p>
            </motion.div>
        </motion.div>
    );

    return createPortal(contenido, document.body);
}
