// Fuera de Google: el buscador no pasa por la puerta de edad, asi que una
// miniatura del catalogo adulto acabaria en resultados sin aviso. Mismo
// criterio que las fichas +18.
export const metadata = {
    title: 'Adultos +18',
    robots: { index: false, follow: false },
};

export default function Layout({ children }) {
    return children;
}
