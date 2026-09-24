// El titulo de la pestaña y de Google. La pagina es de cliente y no puede
// exportar metadata; este layout se la pone sin tocarla.
export const metadata = {
    title: 'Figuras',
    description: 'Figuras y coleccionables originales de anime y manga. Envíos a todo México.',
};

export default function Layout({ children }) {
    return children;
}
