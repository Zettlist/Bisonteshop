import styles from './Footer.module.css';
import Link from 'next/link';

export default function Footer() {
    return (
        <footer className={styles.footer}>
            <div className={styles.container}>
                <div className={styles.column}>
                    <h3>Bisonte Manga</h3>
                    <p style={{ color: '#888', lineHeight: '1.6' }}>
                        Tu destino número uno para mangas, figuras y cultura japonesa. Calidad y pasión en cada envío.
                    </p>
                </div>
                <div className={styles.column}>
                    <h3>Explorar</h3>
                    <ul>
                        <li><Link href="/mangas">Mangas</Link></li>
                        <li><Link href="/figuras">Figuras</Link></li>
                        <li><Link href="/accesorios">Accesorios</Link></li>
                        <li><Link href="/novedades">Novedades</Link></li>
                    </ul>
                </div>
                <div className={styles.column}>
                    <h3>Ayuda</h3>
                    <ul>
                        <li><Link href="/envios">Envíos</Link></li>
                        <li><Link href="/devoluciones">Devoluciones</Link></li>
                        <li><Link href="/contacto">Contacto</Link></li>
                        <li><Link href="/faq">Preguntas Frecuentes</Link></li>
                    </ul>
                </div>
                <div className={styles.column}>
                    <h3>Síguenos</h3>
                    <ul>
                        <li><a href="#">Instagram</a></li>
                        <li><a href="#">Twitter</a></li>
                        <li><a href="#">Facebook</a></li>
                        <li><a href="#">Discord</a></li>
                    </ul>
                </div>
            </div>
            <div className={styles.copyright}>
                &copy; {new Date().getFullYear()} Bisonte Manga. Todos los derechos reservados.
            </div>
        </footer>
    );
}
