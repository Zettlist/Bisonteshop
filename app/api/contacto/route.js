import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { Resend } from 'resend';
import { rateLimit } from '@/lib/rateLimit';
import { isValidEmail } from '@/lib/validate';

// ─── Destinatario por tema ───────────────────────────────────────────
const DESTINOS = {
    devoluciones: { email: 'soporte@bisontemanga.com', etiqueta: 'Devoluciones' },
    contacto: { email: 'contacto@bisontemanga.com', etiqueta: 'Contacto general' },
};

export async function POST(req) {
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || req.headers.get('x-real-ip')
            || 'unknown';
        const { allowed, retryAfter } = rateLimit(`contacto:${ip}`, 3, 60_000);
        if (!allowed) {
            return NextResponse.json(
                { success: false, error: `Demasiados mensajes. Espera ${retryAfter} segundos.` },
                { status: 429 }
            );
        }

        const { tema, nombre, email, pedido, mensaje } = await req.json();

        const destino = DESTINOS[tema];
        if (!destino) {
            return NextResponse.json({ success: false, error: 'Tema inválido.' }, { status: 400 });
        }
        if (!nombre?.trim() || !mensaje?.trim()) {
            return NextResponse.json({ success: false, error: 'Nombre y mensaje son obligatorios.' }, { status: 400 });
        }
        if (!email || !isValidEmail(email.toLowerCase())) {
            return NextResponse.json({ success: false, error: 'Correo inválido.' }, { status: 400 });
        }
        if (mensaje.length > 4000) {
            return NextResponse.json({ success: false, error: 'Mensaje demasiado largo.' }, { status: 400 });
        }

        if (!process.env.RESEND_API_KEY) {
            console.warn('[Contacto] RESEND_API_KEY no configurado — correo omitido');
            return NextResponse.json({ success: false, error: 'Servicio de correo no disponible.' }, { status: 503 });
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';

        const esc = (s) => String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

        // El SDK de Resend no lanza excepciones: devuelve { data, error }.
        const { error: sendError } = await resend.emails.send({
            from: fromEmail,
            to: destino.email,
            replyTo: email,
            subject: `[${destino.etiqueta}] Mensaje de ${nombre}${pedido ? ` — pedido ${pedido}` : ''}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
                    <h2 style="color:#e63946;">Nuevo mensaje — ${destino.etiqueta}</h2>
                    <p><strong>De:</strong> ${esc(nombre)} &lt;${esc(email)}&gt;</p>
                    ${pedido ? `<p><strong>Pedido:</strong> ${esc(pedido)}</p>` : ''}
                    <hr style="border:none;border-top:1px solid #ddd;">
                    <p style="white-space:pre-wrap;line-height:1.6;">${esc(mensaje)}</p>
                </div>
            `,
        });

        if (sendError) {
            console.error('[Contacto] Resend error:', sendError.message);
            return NextResponse.json({ success: false, error: 'No se pudo enviar el mensaje. Intenta más tarde.' }, { status: 502 });
        }

        // Confirmación automática al cliente (no bloquea: si falla, su mensaje ya llegó)
        // Diseño zine de la landing en versión email-safe (inline styles, fuentes con fallback)
        // Siempre dominio público: en local NEXT_PUBLIC_BASE_URL es localhost y Gmail no puede cargar el logo
        const BASE = 'https://bisontemanga.xyz';
        const tituloFont = "'Arial Black', Impact, Arial, sans-serif";
        const { error: confirmError } = await resend.emails.send(
            {
                from: fromEmail,
                to: email.toLowerCase(),
                replyTo: destino.email,
                subject: 'Recibimos tu mensaje 🤘 — Bisonte Manga',
                html: `
                <div style="background-color:#0a0a0a;padding:28px 12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

                        <!-- cinta roja tipo marquee -->
                        <tr><td style="background-color:#e63946;border:2px solid #000000;border-radius:6px;padding:8px 6px;text-align:center;">
                            <span style="font-family:${tituloFont};font-size:11px;letter-spacing:3px;color:#ffffff;">★ BISONTE MANGA ★ DIRECTO DE JAPÓN ★ PURO MANGA ★</span>
                        </td></tr>
                        <tr><td style="height:18px;line-height:18px;">&nbsp;</td></tr>

                        <!-- tarjeta principal -->
                        <tr><td style="background-color:#141414;border:2px solid #000000;border-radius:18px;padding:30px 28px;box-shadow:7px 7px 0 rgba(230,57,70,0.55);">

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr><td align="center" style="padding-bottom:14px;">
                                    <img src="${BASE}/logo.png" width="74" height="74" alt="Bisonte Manga" style="display:block;" />
                                </td></tr>
                                <tr><td align="center" style="padding-bottom:6px;">
                                    <span style="display:inline-block;background-color:#ffd60a;color:#000000;border:2px solid #000000;border-radius:6px;padding:7px 16px;font-family:${tituloFont};font-size:19px;letter-spacing:2px;box-shadow:4px 4px 0 #000000;">¡MENSAJE RECIBIDO!</span>
                                </td></tr>
                                <tr><td align="center" style="padding:10px 0 18px;">
                                    <span style="font-family:'Comic Sans MS','Segoe Script',cursive;font-size:15px;color:#ffd60a;">tranqui, ya lo tenemos ✌️</span>
                                </td></tr>
                                <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#f2f2f2;">
                                    <p style="margin:0 0 12px;">Hola <strong>${esc(nombre)}</strong>,</p>
                                    <p style="margin:0 0 12px;">Tu mensaje de <strong style="color:#ffd60a;">${esc(destino.etiqueta.toLowerCase())}</strong> ya está en manos del equipo. Te respondemos lo antes posible${pedido ? ` (pedido <strong style="color:#e63946;">${esc(pedido)}</strong>)` : ''}.</p>
                                </td></tr>

                                <!-- tu mensaje: nota tipo polaroid -->
                                <tr><td style="padding:10px 0 4px;">
                                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                        <tr><td style="background-color:#1d1d1d;border:2px dashed #e63946;border-radius:12px;padding:14px 16px;">
                                            <span style="font-family:'Comic Sans MS','Segoe Script',cursive;font-size:14px;color:#ffd60a;">tu mensaje:</span>
                                            <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#cccccc;white-space:pre-wrap;">${esc(mensaje)}</p>
                                        </td></tr>
                                    </table>
                                </td></tr>

                                <tr><td align="center" style="padding-top:22px;">
                                    <a href="${BASE}/mangas" style="display:inline-block;background-color:#e63946;color:#ffffff;text-decoration:none;border:2px solid #000000;border-radius:10px;padding:11px 26px;font-family:${tituloFont};font-size:14px;letter-spacing:2px;box-shadow:4px 4px 0 #000000;">VER EL CATÁLOGO →</a>
                                </td></tr>
                            </table>

                        </td></tr>

                        <!-- pie -->
                        <tr><td align="center" style="padding-top:18px;">
                            <span style="font-family:'Comic Sans MS','Segoe Script',cursive;font-size:14px;color:#9a9a9a;">— hecho por fans, para fans ✌️</span><br/>
                            <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#666666;">este correo es automático, pero si respondes te leemos.</span>
                        </td></tr>

                    </table>
                    </td></tr></table>
                </div>
                `,
            },
            // Dedup solo de reintentos del MISMO mensaje (hash de contenido), no de mensajes nuevos
            { idempotencyKey: `contacto-confirm/${crypto.createHash('sha256').update(`${email.toLowerCase()}|${tema}|${pedido || ''}|${mensaje}`).digest('hex').slice(0, 32)}` }
        );
        if (confirmError) {
            console.warn('[Contacto] Confirmación al cliente falló:', confirmError.message);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Contacto] error:', error);
        return NextResponse.json({ success: false, error: 'Error del servidor. Intenta más tarde.' }, { status: 500 });
    }
}
