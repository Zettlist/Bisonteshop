import { redirect } from 'next/navigation';

// Notificaciones dejo de ser una seccion propia: se lee dentro de Mi Cuenta.
// La ruta se conserva para no romper enlaces guardados o compartidos.
export default function NotificacionesRedirect() {
    redirect('/perfil/mi-cuenta');
}
