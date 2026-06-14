import { redirect } from 'next/navigation';

// "Nosotros" se fusionó con la landing — redirige a home.
export default function NosotrosPage() {
    redirect('/');
}
