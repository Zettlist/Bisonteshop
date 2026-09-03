'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './PuertaAdultos.module.css';

// La misma llave que usa la portada de /adultos: quien ya confirmo la edad
// alli no vuelve a ver la puerta al abrir una ficha, y al reves. Es de sesion
// a proposito — cerrar el navegador la olvida.
const LLAVE = 'adultos_accepted';

export default function PuertaAdultos({ titulo, children }) {
    // `null` es "todavia no se": el servidor no puede leer sessionStorage, asi
    // que el primer render tiene que ser identico en ambos lados o React marca
    // desajuste de hidratacion. Mientras tanto no se pinta nada del producto.
    const [permitido, setPermitido] = useState(null);

    useEffect(() => {
        try {
            setPermitido(sessionStorage.getItem(LLAVE) === 'true');
        } catch {
            // Navegador con almacenamiento bloqueado: se pregunta cada vez.
            setPermitido(false);
        }
    }, []);

    function aceptar() {
        try { sessionStorage.setItem(LLAVE, 'true'); } catch { /* se pregunta de nuevo */ }
        setPermitido(true);
    }

    if (permitido === null) return <div className={styles.espera} aria-hidden="true" />;
    if (permitido) return children;

    return (
        <main className={styles.puerta}>
            <div className={styles.tarjeta}>
                <span className={styles.sello}>🔞 Zona exclusiva +18</span>
                <h1 className={styles.titulo}>Contenido para adultos</h1>
                <p className={styles.texto}>
                    <strong>{titulo}</strong> pertenece al catálogo para mayores de edad.
                    Al continuar confirmas que tienes <strong>18 años o más</strong> y que
                    quieres ver material explícito.
                </p>
                <div className={styles.botones}>
                    <button className={styles.aceptar} onClick={aceptar}>
                        Sí, soy mayor de 18 años
                    </button>
                    <Link href="/" className={styles.salir}>Salir</Link>
                </div>
            </div>
        </main>
    );
}
