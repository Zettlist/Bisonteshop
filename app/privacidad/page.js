import styles from './privacidad.module.css';

export const metadata = {
    title: 'Aviso de Privacidad | Bisonte Manga',
    description: 'Aviso de privacidad de Bisonte Manga conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.',
};

export default function PrivacidadPage() {
    return (
        <div className={styles.wrapper}>
            <div className={styles.container}>
                <h1 className={styles.title}>Aviso de Privacidad</h1>
                <p className={styles.updated}>Última actualización: {new Date().getFullYear()}</p>

                <section className={styles.section}>
                    <h2>Responsable del tratamiento de datos</h2>
                    <p>
                        <strong>Bisonte Manga</strong> (en adelante "nosotros") es responsable del tratamiento
                        de sus datos personales, de conformidad con la Ley Federal de Protección de Datos
                        Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>Datos personales que recabamos</h2>
                    <ul>
                        <li>Nombre completo</li>
                        <li>Correo electrónico</li>
                        <li>Dirección de envío</li>
                        <li>Número de teléfono</li>
                        <li>Datos de pago (procesados por terceros seguros; no los almacenamos directamente)</li>
                    </ul>
                </section>

                <section className={styles.section}>
                    <h2>Finalidades del tratamiento</h2>
                    <p>Sus datos se utilizan para:</p>
                    <ul>
                        <li>Procesar y entregar sus pedidos</li>
                        <li>Gestionar su cuenta de usuario</li>
                        <li>Enviar confirmaciones y actualizaciones de pedidos</li>
                        <li>Atender solicitudes de soporte o devoluciones</li>
                        <li>Cumplir obligaciones legales</li>
                    </ul>
                    <p>
                        De manera secundaria, podemos utilizar su correo para enviarle información sobre
                        promociones o novedades. Puede oponerse a este uso en cualquier momento.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>Uso de cookies</h2>
                    <p>
                        Este sitio utiliza únicamente cookies de sesión (<code>bisonte_session</code>)
                        necesarias para mantener su inicio de sesión. No utilizamos cookies de rastreo,
                        análisis de comportamiento ni publicidad de terceros.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>Transferencia de datos</h2>
                    <p>
                        Sus datos no serán vendidos ni cedidos a terceros, salvo cuando sea estrictamente
                        necesario para completar su pedido (por ejemplo, empresas de paquetería o
                        procesadores de pago) o cuando lo exija la ley.
                    </p>
                </section>

                <section className={styles.section}>
                    <h2>Derechos ARCO</h2>
                    <p>
                        Usted tiene derecho a <strong>Acceder</strong>, <strong>Rectificar</strong>,{' '}
                        <strong>Cancelar</strong> u <strong>Oponerse</strong> al tratamiento de sus datos
                        personales. Para ejercer estos derechos, contáctenos en:
                    </p>
                    <p>
                        <strong>Correo:</strong>{' '}
                        <a href="mailto:Soporte@bisontemanga.com">Soporte@bisontemanga.com</a>
                    </p>
                    <p>Responderemos su solicitud en un plazo máximo de 20 días hábiles.</p>
                </section>

                <section className={styles.section}>
                    <h2>Cambios a este aviso</h2>
                    <p>
                        Podemos actualizar este aviso en cualquier momento. Los cambios serán publicados
                        en esta misma página con la fecha de actualización correspondiente.
                    </p>
                </section>
            </div>
        </div>
    );
}
