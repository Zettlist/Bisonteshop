import { redirect } from 'next/navigation';

// Credito de tienda dejo de ser una seccion propia: se lee dentro de Mi Cuenta.
// La ruta se conserva para no romper enlaces guardados o compartidos.
export default function CreditoRedirect() {
    redirect('/perfil/mi-cuenta');
}
