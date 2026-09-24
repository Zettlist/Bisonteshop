/**
 * Los estados de Mexico, con UN solo nombre para cada uno.
 *
 * Antes habia tres listas y no coincidian. El pago decia "Estado de México",
 * Ajustes decia "México", y el dialogo de envio de apartados dejaba escribirlo
 * a mano. La cotizacion solo reconocia los nombres exactos del pago: cualquier
 * otro -- "México" desde Ajustes, "Nuevo Leon" sin acento -- caia a su valor por
 * defecto, CDMX. El envio se cotizaba al estado equivocado y la guia salia con
 * el estado equivocado. El Estado de Mexico es el mas poblado del pais.
 *
 * Este archivo es la lista para las pantallas y la traduccion para todo lo
 * demas: lo que escriba la persona se convierte aqui al nombre de la lista, y
 * es ese nombre el que se cotiza, se firma y se guarda.
 */

export const ESTADOS_MX = [
    'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
    'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
    'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
    'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
    'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

/** Sin acentos, sin puntos, en minusculas y con un espacio entre palabras. */
const plano = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

// Como se escribe en la practica, ademas del nombre oficial.
const ALIAS = {
    'mexico': 'Estado de México', 'edo mex': 'Estado de México', 'edomex': 'Estado de México',
    'edo de mexico': 'Estado de México', 'estado de mexico': 'Estado de México',
    'cdmx': 'Ciudad de México', 'df': 'Ciudad de México', 'd f': 'Ciudad de México',
    'distrito federal': 'Ciudad de México', 'ciudad de mexico': 'Ciudad de México',
    'coahuila de zaragoza': 'Coahuila', 'michoacan de ocampo': 'Michoacán',
    'veracruz de ignacio de la llave': 'Veracruz', 'nl': 'Nuevo León', 'bc': 'Baja California',
    'bcs': 'Baja California Sur', 'qroo': 'Quintana Roo', 'q roo': 'Quintana Roo', 'slp': 'San Luis Potosí',
};

const PORNOMBRE = new Map(ESTADOS_MX.map((e) => [plano(e), e]));

/**
 * El nombre de la lista para lo que haya escrito la persona, o null si no se
 * reconoce. Quien llama decide que hacer con el null: nunca se adivina un
 * estado, porque un estado adivinado es un envio al lugar equivocado.
 */
export function estadoCanonico(texto) {
    const p = plano(texto);
    if (!p) return null;
    return PORNOMBRE.get(p) || ALIAS[p] || null;
}
