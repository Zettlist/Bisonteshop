// El titulo de la pestaña y de Google. La pagina es de cliente y no puede
// exportar metadata; este layout se la pone sin tocarla.
export const metadata = {
    title: 'Contacto',
    description: 'Escríbenos: dudas, devoluciones o quejas. Te leemos y te contestamos.',
};

export default function Layout({ children }) {
    return children;
}
