import styles from './privacidad.module.css';

export const metadata = {
    title: 'Aviso de Privacidad',
    description: 'Qué datos personales recaba Bisonte Manga, para qué los usa, con quién los comparte y cómo ejercer tus derechos sobre ellos.',
};

// La fecha va escrita a mano y no con new Date(): antes decia el año en curso,
// asi que el aviso "se actualizaba" solo cada enero sin que nadie lo tocara. La
// fecha tiene que ser la del ultimo cambio de verdad.
const ACTUALIZADO = '23 de septiembre de 2026';

// Este texto describe lo que la tienda hace HOY, revisado contra el codigo:
// que datos pide el registro, que se guarda de la tarjeta, a que servicios se
// mandan y cuando se cargan las estadisticas. Si cambia alguna de esas cosas,
// este aviso cambia con ella. El anterior decia que no habia cookies de
// analisis, y Google Analytics ya estaba puesto.
export default function PrivacidadPage() {
    return (
        <div className={styles.wrapper}>
            <div className={styles.container}>
                <h1 className={styles.title}>Aviso de Privacidad</h1>
                <p className={styles.updated}>Última actualización: {ACTUALIZADO}</p>

                <section className={styles.section}>
                    <h2>Quién es responsable de tus datos</h2>
                    <p>
                        <strong>Bisonte Manga</strong>, tienda en línea en bisontemanga.com, es responsable del
                        tratamiento de tus datos personales conforme a la Ley Federal de Protección de Datos
                        Personales en Posesión de los Particulares y demás normativa aplicable.
                    </p>
                    <p>
                        Para cualquier asunto relacionado con tus datos puedes escribirnos a{' '}
                        <a href="mailto:soporte@bisontemanga.com">soporte@bisontemanga.com</a> o desde la
                        sección <a href="/contacto?tema=contacto">Contacto</a>.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>Qué datos recabamos</h2>
                    <ul>
                        <li>
                            <strong>Identificación y contacto:</strong> nombre, apellido, correo electrónico,
                            teléfono, nacionalidad y fecha de nacimiento. La fecha de nacimiento se pide porque la
                            tienda vende únicamente a mayores de 18 años.
                        </li>
                        <li>
                            <strong>Entrega:</strong> las direcciones de envío que registres y el nombre y teléfono
                            de quien recibe.
                        </li>
                        <li>
                            <strong>Cuenta:</strong> tu contraseña, que se guarda cifrada y nadie puede leer. Si
                            entras con Google, recibimos tu nombre, tu correo y tu foto de perfil.
                        </li>
                        <li>
                            <strong>Compras:</strong> tus pedidos, apartados, saldo de tienda, reclamos y los
                            mensajes que nos envíes. De tu tarjeta solo conservamos la marca, los últimos cuatro
                            dígitos y si es de crédito o débito. El número completo lo recibe y guarda nuestro
                            procesador de pagos; nosotros nunca lo vemos.
                        </li>
                        <li>
                            <strong>Opiniones:</strong> las calificaciones que publiques sobre los productos.
                        </li>
                        <li>
                            <strong>Navegación:</strong> tu dirección IP, que se usa en el momento para proteger la
                            tienda contra abusos y no se guarda. Estadísticas de uso del sitio, solo si aceptas las
                            cookies (ver más abajo).
                        </li>
                    </ul>
                    <p>No recabamos datos personales sensibles.</p>
                </section>

                <section className={styles.section}>
                    <h2>Para qué los usamos</h2>
                    <p>Finalidades necesarias para darte el servicio:</p>
                    <ul>
                        <li>Crear y administrar tu cuenta, y verificar que eres mayor de edad.</li>
                        <li>Cobrar y registrar tus pedidos, apartados y saldo de tienda.</li>
                        <li>Preparar y enviar tus paquetes, y avisarte cómo van.</li>
                        <li>Atender dudas, devoluciones, reclamos y quejas.</li>
                        <li>Prevenir fraudes y proteger la seguridad de la tienda y de tu cuenta.</li>
                        <li>Cumplir obligaciones legales y fiscales.</li>
                    </ul>
                    <p>Finalidades opcionales, que no son necesarias para comprar:</p>
                    <ul>
                        <li>Medir cómo se usa el sitio para mejorarlo (estadísticas).</li>
                        <li>Enviarte promociones y novedades.</li>
                    </ul>
                    <p>
                        Puedes negarte a las opcionales cuando quieras: rechazando las cookies en el aviso que
                        aparece al entrar, o escribiéndonos para dejar de recibir promociones. Negarte no afecta
                        en nada tus compras.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>Con quién los compartimos</h2>
                    <p>
                        No vendemos tus datos. Solo los compartimos con los servicios que necesitamos para
                        operar, y únicamente lo que cada uno necesita:
                    </p>
                    <ul>
                        <li>
                            <strong>Stripe</strong>, que procesa los pagos con tarjeta.
                        </li>
                        <li>
                            <strong>Envía.com y las paqueterías</strong> (FedEx, Estafeta, DHL, Paquetexpress):
                            nombre de quien recibe, dirección y teléfono, para generar la guía y entregar tu
                            pedido.
                        </li>
                        <li>
                            <strong>Nuestro servicio de correo</strong>, que envía las confirmaciones y avisos de
                            tus pedidos.
                        </li>
                        <li>
                            <strong>Google</strong>, si inicias sesión con tu cuenta de Google, y para las
                            estadísticas del sitio solo si aceptaste las cookies.
                        </li>
                        <li>
                            <strong>Google Cloud</strong>, donde está alojada la tienda y su base de datos.
                        </li>
                        <li>Autoridades, cuando una ley o una orden lo exija.</li>
                    </ul>
                    <p>
                        Algunos de estos proveedores guardan la información fuera de México, principalmente en
                        Estados Unidos, con medidas de seguridad propias.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>Cookies y datos en tu navegador</h2>
                    <ul>
                        <li>
                            <strong>Sesión</strong> (necesaria): mantiene tu cuenta abierta mientras navegas.
                        </li>
                        <li>
                            <strong>Preferencias</strong> (necesarias): tu carrito, la moneda, el tema de color y
                            si aceptaste o no las cookies. Se guardan en tu propio navegador.
                        </li>
                        <li>
                            <strong>Estadísticas</strong> (opcionales): Google Analytics. Solo se activan si
                            pulsas «Aceptar»; si las rechazas, ni siquiera se cargan.
                        </li>
                    </ul>
                    <p>
                        Para cambiar tu decisión, borra los datos de este sitio en tu navegador y el aviso de
                        cookies volverá a aparecer.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>Tus derechos</h2>
                    <p>
                        Puedes <strong>acceder</strong> a tus datos, <strong>rectificarlos</strong>,{' '}
                        <strong>cancelarlos</strong> u <strong>oponerte</strong> a su uso, y también revocar el
                        consentimiento que nos diste. Escríbenos a{' '}
                        <a href="mailto:soporte@bisontemanga.com">soporte@bisontemanga.com</a> con:
                    </p>
                    <ul>
                        <li>Tu nombre y el correo de tu cuenta.</li>
                        <li>Qué quieres hacer y sobre qué datos.</li>
                        <li>Algo que nos permita confirmar que eres tú, para no entregar tus datos a otra persona.</li>
                    </ul>
                    <p>
                        Te respondemos en un máximo de 20 días hábiles. Si pides cancelar tu cuenta, conservaremos
                        solo lo que la ley nos obligue a guardar (por ejemplo, registros de ventas con fines
                        fiscales) y durante el plazo que marque.
                    </p>
                    <p>
                        Si consideras que no atendimos tu solicitud como corresponde, puedes acudir a la
                        autoridad competente en materia de protección de datos personales.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>Menores de edad</h2>
                    <p>
                        La tienda es solo para mayores de 18 años. No recabamos a propósito datos de menores; si
                        detectamos una cuenta de un menor, la damos de baja.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>Cambios a este aviso</h2>
                    <p>
                        Si cambia lo que hacemos con tus datos, actualizaremos este aviso y la fecha de arriba. Los
                        cambios importantes también te los avisaremos por correo.
                    </p>
                </section>
            </div>
        </div>
    );
}
