import styles from '../CommonProfile.module.css';
import ApartadosPanel from '@/components/perfil/ApartadosPanel';

export const metadata = { title: 'Mis apartados | Bisonte Manga' };

export default function Apartados() {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Mis apartados</h1>
                <p className={styles.subtitle}>lo que te estamos guardando</p>
            </header>

            <ApartadosPanel />
        </div>
    );
}
