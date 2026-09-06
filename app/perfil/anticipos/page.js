import { redirect } from 'next/navigation';

// La seccion se llama «Mis apartados». Esta ruta se conserva para no romper
// enlaces guardados: el correo de vencimiento y el menu apuntan a la nueva.
export default function AnticiposRedirect() {
    redirect('/perfil/apartados');
}
