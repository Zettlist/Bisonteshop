// El titulo de la pestaña y de Google. La pagina es de cliente y no puede
// exportar metadata; este layout se la pone sin tocarla.
export const metadata = {
    title: 'Mangas',
    description: 'Manga japonés original: tomos, revistas como Shonen Jump y novelas ligeras. Envíos a todo México.',
};

export default function Layout({ children }) {
    return children;
}
