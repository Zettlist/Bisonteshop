// El titulo de la pestaña y de Google. La pagina es de cliente y no puede
// exportar metadata; este layout se la pone sin tocarla.
export const metadata = {
    title: 'Crear cuenta',
    description: 'Crea tu cuenta en Bisonte Manga para comprar, apartar y seguir tus pedidos.',
};

export default function Layout({ children }) {
    return children;
}
