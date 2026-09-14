import { NextResponse } from 'next/server';
import crypto from 'crypto';
import pool from '@/lib/db';
import { sendPasswordReset } from '@/lib/mailer';
import { rateLimit } from '@/lib/rateLimit';
import { isValidEmail } from '@/lib/validate';
import { ipCliente } from '@/lib/ipCliente';

export const dynamic = 'force-dynamic';

/** Una hora. Lo bastante para ir al correo y volver, lo bastante poco para que
 *  un enlace olvidado en la bandeja no siga siendo una llave manana. */
const VIGENCIA_MINUTOS = 60;

/** El token viaja en el correo; en la base solo queda su huella. */
const huella = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Pide el enlace para poner una contrasena nueva.
 *
 * La respuesta es SIEMPRE la misma, exista el correo o no. No es por pereza: si
 * contestara distinto, cualquiera podria ir probando direcciones para averiguar
 * quien tiene cuenta en la tienda. Eso es una lista de clientes, y sale gratis.
 * El precio de no filtrarla es que quien se equivoque de correo no reciba nada
 * y no sepa por que; por eso el texto de la pantalla dice «si ese correo tiene
 * cuenta», y no «te lo enviamos».
 *
 * Por el mismo motivo no se cuenta si la cuenta es de Google. Y a esa si se le
 * deja recuperar: le pone una contrasena de verdad encima de la que se genero
 * al vuelo, y a partir de ahi tiene dos formas de entrar en vez de una.
 */
export async function POST(request) {
    // Dos limites, y cada uno tapa un agujero distinto. Por IP, para que nadie
    // recorra una lista de correos desde una maquina. Y por correo, para que no
    // se pueda inundar el buzon de una persona pidiendo el enlace mil veces
    // desde mil sitios.
    // La IP sale de lib/ipCliente y no del primer elemento de x-forwarded-for:
    // ese lo escribe quien llama, y con el, el limite de abajo se saltaba
    // mandando una cabecera distinta en cada peticion. El de por correo nunca
    // dependio de esto — es la clave que de verdad protege un buzon concreto.
    const ip = ipCliente(request);
    const porIp = rateLimit(`recuperar-ip:${ip}`, 10, 15 * 60_000);
    if (!porIp.allowed) {
        return NextResponse.json(
            { success: false, error: 'Demasiados intentos. Prueba en un rato.' },
            { status: 429 }
        );
    }

    let email;
    try {
        ({ email } = await request.json());
    } catch {
        return NextResponse.json({ success: false, error: 'Datos incompletos.' }, { status: 400 });
    }

    if (!email || !isValidEmail(email)) {
        return NextResponse.json({ success: false, error: 'Escribe un correo válido.' }, { status: 400 });
    }

    const correo = email.toLowerCase().trim();
    const porCorreo = rateLimit(`recuperar-mail:${correo}`, 3, 15 * 60_000);

    // La respuesta que se devuelve pase lo que pase de aqui en adelante.
    const siempre = NextResponse.json({ success: true });

    try {
        if (!porCorreo.allowed) return siempre;

        const [filas] = await pool.query(
            'SELECT id, nombre, email FROM clientes WHERE email = ? LIMIT 1',
            [correo]
        );
        if (!filas.length) return siempre;

        const cliente = filas[0];
        const token = crypto.randomBytes(32).toString('hex');

        // Pedir un enlace nuevo invalida el anterior: solo hay sitio para un
        // hash. Si no fuera asi, cada peticion dejaria otra llave viva.
        await pool.query(
            `UPDATE clientes
                SET reset_token_hash = ?, reset_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
              WHERE id = ?`,
            [huella(token), VIGENCIA_MINUTOS, cliente.id]
        );

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://bisontemanga.com';
        await sendPasswordReset({ to: cliente.email, nombre: cliente.nombre, token, baseUrl });

        // En desarrollo no hay Resend configurado y el correo no sale: sin esto
        // no habria forma de seguir el enlace en local ni de probar el flujo.
        //
        // La condicion es NODE_ENV y no «si falta la llave de Resend», que seria
        // lo comodo: un despliegue al que se le olvide la variable escribiria
        // tokens vivos en los logs de Cloud Run, y un token en un log es una
        // llave en un log.
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Recuperar] enlace de desarrollo: ${baseUrl}/recuperar?token=${token}`);
        }
    } catch (error) {
        // Tampoco un fallo de envio cambia la respuesta: un 500 aqui volveria a
        // distinguir el correo que existe del que no. Queda en el log.
        console.error('[Recuperar]', error);
    }

    return siempre;
}
