'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion } from 'framer-motion';
import s from './TerminosModal.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Terminos y Condiciones.
//
// El texto vivia copiado dentro de app/registro/page.js, y el popup de login
// resolvia lo mismo mandando a /privacidad en una pestana nueva: era otro
// documento (el aviso de privacidad) y ademas sacaba al usuario del registro a
// medio llenar. Ahora los dos abren este mismo modal encima del formulario.
//
// `onAceptar` es opcional: cuando viene, el pie muestra el boton que marca la
// casilla y cierra. Sin el, el modal es solo de lectura.
// ─────────────────────────────────────────────────────────────────────────────

export default function TerminosModal({ abierto, onCerrar, onAceptar }) {
    // Se monta por portal en <body>. Tanto la pagina de registro como el popup
    // de login viven dentro de motion.div animados, y un ancestro con
    // `transform` vuelve al `position: fixed` relativo a ese ancestro: el
    // overlay salia recortado a media pantalla en vez de cubrirla.
    const [montado, setMontado] = useState(false);
    useEffect(() => { setMontado(true); }, []);
    // Escape cierra, y mientras esta abierto el fondo no scrollea: si no, el
    // formulario de atras se mueve bajo el modal.
    useEffect(() => {
        if (!abierto) return;
        const alTeclear = (e) => { if (e.key === 'Escape') onCerrar?.(); };
        const overflowPrevio = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', alTeclear);
        return () => {
            document.body.style.overflow = overflowPrevio;
            window.removeEventListener('keydown', alTeclear);
        };
    }, [abierto, onCerrar]);

    if (!montado) return null;

    if (!abierto) return null;

    // Sin AnimatePresence: este modal se monta dentro del AnimatePresence del
    // popup de login, y anidados la animacion de salida se quedaba a medias —
    // el overlay permanecia en el DOM casi invisible pero con pointer-events,
    // tapando el formulario. Cierra de golpe; solo la entrada se anima.
    return createPortal(
        <motion.div
            className={s.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            onClick={onCerrar}
        >
            <motion.div
                className={s.modal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="terminos-titulo"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={s.header}>
                    <h2 id="terminos-titulo">Términos y Condiciones</h2>
                    <button className={s.closeBtn} onClick={onCerrar} aria-label="Cerrar">×</button>
                </div>

                <div className={s.content}>
                    <div className={s.body}>
                        <h3 className={s.mainTitle}>TÉRMINOS Y CONDICIONES BISONTE MANGA</h3>
                        <p className={s.date}>Última actualización: Marzo 2026</p>

                        <h4 className={s.heading}>1. ACEPTACIÓN DE LOS TÉRMINOS</h4>
                        <p>Al acceder y utilizar el sitio web de BISONTE MANGA, el usuario acepta quedar vinculado por los presentes Términos y Condiciones, así como por la Política de Privacidad y demás disposiciones aplicables. Si el usuario no está de acuerdo con alguno de estos términos, deberá abstenerse de utilizar el sitio.</p>

                        <h4 className={s.heading}>2. IDENTIFICACIÓN DE LA EMPRESA</h4>
                        <p>BISONTE MANGA es una tienda en línea dedicada a la comercialización de manga, artículos de colección y productos relacionados, incluyendo mercancía de importación adquirida de distribuidores nacionales e internacionales. Los productos ofrecidos son artículos originales obtenidos mediante canales de compra legítimos.</p>

                        <h4 className={s.heading}>3. PRODUCTOS Y DISPONIBILIDAD</h4>
                        <p>3.1 Los productos publicados en el sitio están sujetos a disponibilidad de inventario. BISONTE MANGA se reserva el derecho de modificar el catálogo sin previo aviso.</p>
                        <p>3.2 Algunos productos son ediciones de importación, lo que implica que el contenido puede estar en idioma original (japonés u otro) o en ediciones publicadas para otros mercados. Esto se indica en la descripción de cada producto.</p>
                        <p>3.3 Las imágenes de portada utilizadas en las fichas de producto tienen únicamente fines descriptivos e identificativos del artículo que se comercializa.</p>

                        <h4 className={s.heading}>4. PRECIOS Y PAGOS</h4>
                        <p>4.1 Todos los precios publicados incluyen IVA conforme a la legislación fiscal mexicana vigente.</p>
                        <p>4.2 BISONTE MANGA se reserva el derecho de modificar los precios en cualquier momento. El precio aplicable será el vigente al momento de confirmar la orden de compra.</p>
                        <p>4.3 Los métodos de pago aceptados se especifican en el proceso de compra. BISONTE MANGA no almacena datos bancarios del usuario.</p>

                        <h4 className={s.heading}>5. ENVÍOS Y ENTREGAS</h4>
                        <p>5.1 Los envíos se realizan a la dirección proporcionada por el usuario al momento de la compra. BISONTE MANGA no se hace responsable por errores en la dirección indicada.</p>
                        <p>5.2 Los tiempos de entrega son estimados y pueden variar por causas ajenas a BISONTE MANGA, incluyendo demoras de la paquetería o situaciones de fuerza mayor.</p>
                        <p>5.3 El costo de envío se calcula y muestra antes de confirmar la compra.</p>

                        <h4 className={s.heading}>6. DEVOLUCIONES Y GARANTÍAS</h4>
                        <p>6.1 Se aceptan devoluciones dentro de los 30 días naturales siguientes a la recepción del producto, siempre que:</p>
                        <ul>
                            <li>El producto presente defecto de fábrica o daño en el envío.</li>
                            <li>El producto recibido no corresponda al artículo pedido.</li>
                            <li>El producto se encuentre sin abrir y en su empaque original (para casos de arrepentimiento de compra).</li>
                        </ul>
                        <p>6.2 Para iniciar una devolución, el usuario debe contactar a BISONTE MANGA a través de los canales de atención indicados en el sitio, adjuntando evidencia fotográfica en caso de daño.</p>
                        <p>6.3 Los gastos de envío por devolución corren a cargo del comprador, salvo en caso de error o defecto imputable a BISONTE MANGA.</p>

                        <h4 className={s.heading}>7. PROPIEDAD INTELECTUAL</h4>
                        <p>Todo el contenido publicado en el sitio web (logotipos, código fuente, diseño gráfico, textos, catálogo de productos y precios) es propiedad exclusiva de BISONTE MANGA o de sus licenciantes, y está protegido por la Ley Federal del Derecho de Autor y demás legislación aplicable. Queda estrictamente prohibido:</p>
                        <ul>
                            <li>La extracción automatizada o manual de datos, imágenes o contenido con fines comerciales.</li>
                            <li>La reproducción, copia o distribución no autorizada del diseño o contenido del sitio.</li>
                            <li>El uso de técnicas de scraping, crawling o cualquier método de extracción masiva de datos.</li>
                        </ul>
                        <p>Cualquier uso autorizado requerirá autorización expresa y por escrito del titular de los derechos.</p>

                        <h4 className={s.heading}>8. PROTECCIÓN DE DATOS PERSONALES</h4>
                        <p>El tratamiento de los datos personales del usuario se realiza conforme a lo establecido en la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento. El{' '}
                            <Link href="/privacidad" target="_blank" className={s.avisoLink}>Aviso de Privacidad completo</Link>{' '}
                            está disponible en el sitio web. Los datos recabados se utilizan exclusivamente para la gestión de pedidos, atención al cliente y mejora del servicio.</p>

                        <h4 className={s.heading}>9. LIMITACIÓN DE RESPONSABILIDAD</h4>
                        <p>BISONTE MANGA no será responsable por:</p>
                        <ul>
                            <li>Daños derivados del mal uso de los productos adquiridos.</li>
                            <li>Interrupciones del servicio por mantenimiento, causas técnicas o fuerza mayor.</li>
                            <li>Diferencias de percepción de color entre la imagen del sitio y el producto físico, inherentes a la reproducción digital.</li>
                        </ul>
                        <p>En ningún caso la responsabilidad de BISONTE MANGA excederá el monto pagado por el usuario en la transacción que originó el reclamo.</p>

                        <h4 className={s.heading}>10. MODIFICACIONES A LOS TÉRMINOS</h4>
                        <p>BISONTE MANGA se reserva el derecho de actualizar los presentes Términos y Condiciones en cualquier momento. Los cambios entrarán en vigor a partir de su publicación en el sitio. El uso continuado del sitio tras la publicación de modificaciones implica la aceptación de los nuevos términos.</p>

                        <h4 className={s.heading}>11. LEGISLACIÓN APLICABLE Y JURISDICCIÓN</h4>
                        <p>Los presentes Términos y Condiciones se rigen por las leyes vigentes en los Estados Unidos Mexicanos. Para la resolución de cualquier controversia derivada del uso del sitio o de las transacciones realizadas, las partes se someten a la jurisdicción de los tribunales competentes, renunciando a cualquier otro fuero que pudiera corresponderles.</p>

                        <h4 className={s.heading}>12. CONTACTO</h4>
                        <p>Para cualquier duda, aclaración o ejercicio de derechos relacionados con estos Términos y Condiciones, el usuario puede comunicarse a través de los canales de atención disponibles en el sitio web de BISONTE MANGA.</p>

                        <div className={s.copyright}>© 2026 BISONTE MANGA – Todos los derechos reservados</div>
                    </div>
                </div>

                <div className={s.footer}>
                    {onAceptar ? (
                        <>
                            <button type="button" className={s.btnCerrar} onClick={onCerrar}>Cerrar</button>
                            <button
                                type="button"
                                className={s.btnAceptar}
                                onClick={() => { onAceptar(); onCerrar?.(); }}
                            >
                                Aceptar Términos
                            </button>
                        </>
                    ) : (
                        <button type="button" className={s.btnAceptar} onClick={onCerrar}>Cerrar</button>
                    )}
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
}
