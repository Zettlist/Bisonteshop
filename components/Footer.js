import styles from './Footer.module.css';
import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
    return (
        <footer className={styles.footer}>
            {/* Borde superior tipo cinta */}
            <div className={styles.topStrip} aria-hidden="true" />

            <div className={styles.container}>
                <div className={`${styles.column} ${styles.brandColumn}`}>
                    <div className={styles.brandRow}>
                        <Image src="/logo.png" alt="Bisonte Manga" width={64} height={64} className={styles.brandLogo} />
                        <h3 className={styles.brandTitle}>BISONTE<span>MANGA</span></h3>
                    </div>
                    <p className={styles.brandTagline}>
                        manga, figuras y cultura japonesa — con cariño y burbuja 📦
                    </p>
                </div>

                <div className={styles.column}>
                    <h3 className={styles.colTitle}>EXPLORAR</h3>
                    <ul>
                        <li><Link href="/mangas">Mangas</Link></li>
                        <li><Link href="/figuras">Figuras</Link></li>
                        <li><Link href="/accesorios">Accesorios</Link></li>
                        <li><Link href="/novedades">Novedades</Link></li>
                    </ul>
                </div>

                <div className={styles.column}>
                    <h3 className={`${styles.colTitle} ${styles.colTitleAlt}`}>AYUDA</h3>
                    <ul>
                        <li><Link href="/contacto?tema=devoluciones">Devoluciones</Link></li>
                        <li><Link href="/contacto?tema=contacto">Contacto</Link></li>
                        <li><Link href="/faq">Preguntas Frecuentes</Link></li>
                    </ul>
                </div>

                <div className={styles.column}>
                    <h3 className={styles.colTitle}>SÍGUENOS</h3>
                    <ul className={styles.socialList}>
                        <li><a href="https://www.instagram.com/bisontemanga/" target="_blank" rel="noopener noreferrer" className={styles.socialPill}>Instagram</a></li>
                        <li><a href="https://www.facebook.com/profile.php?id=61564525718779" target="_blank" rel="noopener noreferrer" className={styles.socialPill}>Facebook</a></li>
                        <li><a href="#" className={styles.socialPill}>Discord</a></li>
                    </ul>
                </div>
            </div>

            <div className={styles.copyright}>
                <span className={styles.copyHand}>hecho por fans, para fans ✌️</span>
                <span>
                    &copy; {new Date().getFullYear()} Bisonte Manga. Todos los derechos reservados.
                    {' · '}
                    <Link href="/privacidad" className={styles.privacyLink}>Aviso de Privacidad</Link>
                </span>
            </div>
        </footer>
    );
}
