import Sidebar from '@/components/perfil/Sidebar';
import styles from './Layout.module.css';

export const metadata = {
    title: 'Mi Perfil | Bisonte Manga',
    description: 'Gestiona tu cuenta, pedidos, anticipos y configuración en Bisonte Manga.',
};

export default function PerfilLayout({ children }) {
    return (
        <div className={styles.perfilContainer}>
            <Sidebar />
            <main className={styles.perfilContent}>
                {children}
            </main>
        </div>
    );
}
