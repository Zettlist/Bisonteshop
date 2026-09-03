/**
 * Traduce el campo `products.dimensions` a algo que un cliente entienda.
 *
 * El POS guarda texto libre y lo normal es que sea el nombre del formato ("B5",
 * "Tankobon"), no medidas. En la ficha eso aparecia tal cual: quien no conoce la
 * nomenclatura japonesa no tiene forma de saber si le cabe en el librero. Aqui
 * el nombre se convierte a centimetros y se explica de que tamano estamos
 * hablando; lo que no se reconoce se muestra igual que antes, sin inventar.
 *
 * Los B son JIS (japoneses), no ISO: el B5 del manga mide 182x257 mm, no
 * 176x250. Usar la tabla ISO daria medidas equivocadas en todo el catalogo.
 */

const FORMATOS = {
    'a4':          { medidas: '21 × 29.7 cm',    nota: 'tamaño hoja, artbooks y revistas grandes' },
    'a5':          { medidas: '14.8 × 21 cm',    nota: 'media hoja; novelas ligeras y fanbooks' },
    'a6':          { medidas: '10.5 × 14.8 cm',  nota: 'de bolsillo' },
    'b4':          { medidas: '25.7 × 36.4 cm',  nota: 'formato póster o revista grande' },
    'b5':          { medidas: '18.2 × 25.7 cm',  nota: 'el de las revistas y los doujinshi' },
    'b6':          { medidas: '12.8 × 18.2 cm',  nota: 'el tomo japonés de toda la vida' },
    'b7':          { medidas: '9.1 × 12.8 cm',   nota: 'miniatura' },
    'tankobon':    { medidas: '12.8 × 18.2 cm',  nota: 'tomo recopilatorio estándar (B6)' },
    'shinsoban':   { medidas: '12.8 × 18.2 cm',  nota: 'reedición en tamaño tomo (B6)' },
    'bunko':       { medidas: '10.5 × 14.8 cm',  nota: 'edición económica de bolsillo (A6)' },
    'bunkoban':    { medidas: '10.5 × 14.8 cm',  nota: 'edición económica de bolsillo (A6)' },
    'shinsho':     { medidas: '10.5 × 17.3 cm',  nota: 'alargado, tipo ensayo' },
    'wideban':     { medidas: '15 × 21 cm',      nota: 'edición ampliada (A5)' },
    'kanzenban':   { medidas: '15 × 21 cm',      nota: 'edición definitiva, papel y tamaño mayores (A5)' },
    'aizoban':     { medidas: '18.2 × 25.7 cm',  nota: 'edición de coleccionista (B5)' },
};

// "B5", "b-5", "Tankōbon", "Formato B5" → "b5" / "tankobon"
function normalizar(nombre) {
    return nombre
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quita macrones y acentos
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/**
 * @param {string|object|null} raw  valor crudo de products.dimensions
 * @returns {{ medidas: string|null, etiqueta: string|null, nota: string|null } | null}
 *   `medidas` son centimetros; `etiqueta` es el nombre del formato tal como
 *   viene en la base; `nota` explica el formato. Cualquiera puede ser null.
 */
export function describirDimensiones(raw) {
    if (raw === null || raw === undefined || raw === '') return null;

    // Caso 1: el POS guardo un objeto {length, width, height} en centimetros.
    try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (obj && typeof obj === 'object') {
            const ejes = [obj.length, obj.width, obj.height]
                .filter(n => Number(n) > 0)
                .map(n => Number(n));
            if (ejes.length) {
                return { medidas: `${ejes.join(' × ')} cm`, etiqueta: null, nota: null };
            }
        }
    } catch {
        // No era JSON: sigue como nombre de formato.
    }

    const texto = String(raw).trim();
    const formato = FORMATOS[normalizar(texto)];
    if (formato) {
        return { medidas: formato.medidas, etiqueta: texto, nota: formato.nota };
    }

    // Formato desconocido: se respeta el texto original.
    return { medidas: null, etiqueta: texto, nota: null };
}

export default describirDimensiones;
