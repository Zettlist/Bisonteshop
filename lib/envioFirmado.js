import { SignJWT, jwtVerify } from 'jose';

// ─────────────────────────────────────────────────────────────────────────────
// El costo de envio, firmado por quien lo cotizo.
//
// La tienda le pregunta a Envia cuanto cuesta mandar el paquete, enseña las
// opciones, y el cliente elige una. Hasta aqui todo lo decide el servidor. Lo
// que no: el precio elegido volvia a /api/checkout como un numero en el cuerpo
// de la peticion, y alli solo se comprobaba que estuviera entre $10 y $2,000.
//
// Mandar `10` donde la cotizacion decia `220` costaba un pedido con $210 de
// envio que la tienda le paga igual a la paqueteria. Es el mismo descuido que
// tenian los renglones del carrito: un dato que decide dinero, viniendo del
// navegador sin nada que lo avale.
//
// El vale es la cotizacion firmada. Va atado al carrito porque el precio
// depende del tamaño del paquete: sin eso, el vale barato de un solo manga
// serviria para mandar una caja de veinte.
// ─────────────────────────────────────────────────────────────────────────────

const clave = () => new TextEncoder().encode(process.env.JWT_SECRET);

// Una cotizacion de paqueteria envejece: las tarifas cambian y el paquete
// puede tardar en salir. Una hora da de sobra para terminar un checkout sin
// que un vale de anteayer siga valiendo.
const VIGENCIA = '60m';

/**
 * Firma una opcion de envio cotizada.
 * @param {{precio:number, carrier:string, service:string, itemsHash:string}} o
 * @returns {Promise<string>} el vale
 */
export async function firmarEnvio({ precio, carrier, service, itemsHash }) {
    return new SignJWT({
        precio: Number(precio).toFixed(2),
        carrier: String(carrier || ''),
        service: String(service || ''),
        itemsHash: String(itemsHash || ''),
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(VIGENCIA)
        .sign(clave());
}

/**
 * Devuelve la cotizacion firmada, o null si el vale no vale (firma mala,
 * caducado, manipulado). Quien llama tiene que tratar el null como "no hay
 * cotizacion": es lo unico que separa el precio real del que ponga el
 * navegador.
 */
export async function leerEnvio(token) {
    if (typeof token !== 'string' || !token) return null;
    try {
        const { payload } = await jwtVerify(token, clave());
        const precio = Number(payload.precio);
        if (!Number.isFinite(precio) || precio < 0) return null;
        return { ...payload, precio };
    } catch {
        return null;
    }
}
