// Qué puede recorrer Google. Antes no existia y el buscador pedia /robots.txt
// y recibia un 404: no rompia nada, pero tampoco le decia donde estaba el mapa
// del sitio ni que las paginas de cuenta y de pago no son para indexar.
//
// Fuera quedan las paginas que dependen de una sesion (perfil, pago), la API y
// la seccion de adultos: el buscador no pasa por la puerta de edad.
export default function robots() {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/api/', '/perfil', '/checkout', '/adultos'],
        },
        sitemap: 'https://bisontemanga.com/sitemap.xml',
    };
}
