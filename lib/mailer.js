import { Resend } from 'resend';

export async function sendVerificationEmail({ to, nombre, token, baseUrl }) {
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — correo omitido');
        return;
    }
    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';
    const verifyUrl = `${baseUrl}/verificar?token=${token}`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verifica tu correo — Bisonte Manga</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <div style="font-size:30px;font-weight:900;letter-spacing:3px;color:#dc2626;text-transform:uppercase;">BISONTE MANGA</div>
              <div style="font-size:13px;color:#9ca3af;margin-top:4px;letter-spacing:1px;">Manga · Figuras · Coleccionables</div>
            </td>
          </tr>

          <!-- CARD -->
          <tr>
            <td style="background:#fff;border-radius:16px;padding:40px 36px;border-top:3px solid #dc2626;text-align:center;">
              <div style="width:64px;height:64px;border-radius:50%;background:#fef2f2;border:2px solid #fecaca;text-align:center;line-height:60px;font-size:28px;margin:0 auto 20px;">✉️</div>
              <div style="font-size:24px;font-weight:900;color:#111;margin-bottom:8px;">¡Bienvenido, ${nombre}!</div>
              <div style="font-size:15px;color:#6b7280;line-height:1.6;margin-bottom:28px;">
                Solo falta un paso para activar tu cuenta.<br>
                Haz clic en el botón para verificar tu correo electrónico.
              </div>
              <a href="${verifyUrl}"
                 style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;font-size:16px;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.5px;">
                Verificar mi correo
              </a>
              <div style="margin-top:24px;font-size:12px;color:#9ca3af;line-height:1.6;">
                Este enlace expira en <strong>24 horas</strong>.<br>
                Si no creaste esta cuenta, ignora este correo.
              </div>
              <div style="margin-top:20px;padding-top:20px;border-top:1px solid #f0f0f0;font-size:12px;color:#d1d5db;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <span style="color:#dc2626;word-break:break-all;">${verifyUrl}</span>
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <div style="font-size:12px;color:#9ca3af;">
                ¿Tienes dudas? <a href="mailto:contacto@bisontemanga.com" style="color:#dc2626;text-decoration:none;">contacto@bisontemanga.com</a>
              </div>
              <div style="font-size:11px;color:#d1d5db;margin-top:6px;">© 2026 Bisonte Manga · Todos los derechos reservados</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const { data, error } = await resend.emails.send({
        from: fromEmail,
        to,
        subject: `✉️ Verifica tu correo — Bisonte Manga`,
        html,
    });

    if (error) {
        throw new Error(`Resend error: ${error.message}`);
    }

    console.log(`[Mailer] Verificación enviada a ${to}, id: ${data.id}`);
}

/**
 * Envía el correo de confirmación de pedido via Resend.
 */
export async function sendOrderConfirmation({ to, nombre, saleId, items, subtotal, discount, shipping, total }) {
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — correo omitido');
        return;
    }
    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';
    const orderNum = String(saleId).padStart(6, '0');

    const itemsHtml = items.map(item => {
        const isPreventa = item.type === 'preventa';
        const badge = isPreventa
            ? `<span style="background:#f59e0b;color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;">PREVENTA</span>`
            : item.stockOk
                ? `<span style="background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;">EN STOCK</span>`
                : `<span style="background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;">SIN STOCK</span>`;

        const lineTotal = (Number(item.price) * Number(item.quantity)).toFixed(2);

        return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;">
            <div style="font-weight:700;color:#111;font-size:15px;margin-bottom:6px;">${item.title || item.name || 'Producto'}</div>
            <div style="font-size:13px;color:#6b7280;margin-bottom:6px;">Cantidad: ${item.quantity}</div>
            ${badge}
          </td>
          <td style="padding:16px 0;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:top;">
            <div style="font-weight:800;color:#111;font-size:15px;">$${lineTotal} <span style="font-size:11px;font-weight:500;color:#9ca3af;">MXN</span></div>
            ${item.quantity > 1 ? `<div style="font-size:12px;color:#9ca3af;margin-top:2px;">$${Number(item.price).toFixed(2)} c/u</div>` : ''}
          </td>
        </tr>`;
    }).join('');

    const discountRow = discount > 0
        ? `<tr>
            <td style="padding:6px 0;color:#6b7280;font-size:14px;">Descuento</td>
            <td style="text-align:right;color:#16a34a;font-weight:600;font-size:14px;">−$${Number(discount).toFixed(2)}</td>
           </tr>`
        : '';

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pedido #${orderNum} confirmado</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <div style="font-size:30px;font-weight:900;letter-spacing:3px;color:#dc2626;text-transform:uppercase;">BISONTE MANGA</div>
              <div style="font-size:13px;color:#9ca3af;margin-top:4px;letter-spacing:1px;">Manga · Figuras · Coleccionables</div>
            </td>
          </tr>

          <!-- HERO CARD -->
          <tr>
            <td style="background:#fff;border-radius:16px 16px 0 0;padding:36px 36px 28px;border-bottom:3px solid #dc2626;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;width:64px;">
                    <div style="width:56px;height:56px;border-radius:50%;background:#dcfce7;border:2px solid #16a34a;text-align:center;line-height:52px;font-size:26px;">✓</div>
                  </td>
                  <td style="vertical-align:middle;padding-left:16px;">
                    <div style="font-size:24px;font-weight:900;color:#111;line-height:1.2;">¡Pedido confirmado!</div>
                    <div style="font-size:14px;color:#6b7280;margin-top:4px;">Hola <strong>${nombre}</strong>, recibimos tu compra correctamente.</div>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 20px;">
                    <span style="font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Número de pedido</span>
                    <div style="font-size:26px;font-weight:900;color:#dc2626;letter-spacing:2px;margin-top:2px;">#${orderNum}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- PRODUCTOS -->
          <tr>
            <td style="background:#fff;padding:0 36px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;padding:24px 0 8px;">Tus artículos</div>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- TOTALES -->
          <tr>
            <td style="background:#fff;padding:0 36px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:14px;">Subtotal</td>
                  <td style="text-align:right;color:#374151;font-size:14px;">$${Number(subtotal).toFixed(2)}</td>
                </tr>
                ${discountRow}
                <tr>
                  <td style="padding:6px 0;color:#6b7280;font-size:14px;">Envío</td>
                  <td style="text-align:right;color:#374151;font-size:14px;">$${Number(shipping).toFixed(2)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:12px;border-top:2px solid #f0f0f0;"></td>
                </tr>
                <tr>
                  <td style="font-size:17px;font-weight:900;color:#111;padding-top:4px;">Total pagado</td>
                  <td style="text-align:right;font-size:17px;font-weight:900;color:#16a34a;padding-top:4px;">$${Number(total).toFixed(2)} MXN</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ESTADO DEL PEDIDO -->
          <tr>
            <td style="background:#fff;padding:0 36px 36px;border-radius:0 0 16px 16px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;padding:8px 0 20px;border-top:1px solid #f0f0f0;margin-top:8px;">Estado del pedido</div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:40px;vertical-align:top;text-align:center;">
                    <div style="width:36px;height:36px;border-radius:50%;background:#dcfce7;border:2px solid #16a34a;text-align:center;line-height:32px;font-size:16px;display:inline-block;">✓</div>
                    <div style="width:2px;height:28px;background:#e5e7eb;margin:0 auto;"></div>
                  </td>
                  <td style="padding-left:14px;padding-bottom:20px;vertical-align:top;padding-top:6px;">
                    <div style="font-weight:700;color:#111;font-size:14px;">Pago confirmado</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:2px;">Tu pago fue procesado exitosamente</div>
                  </td>
                </tr>
                <tr>
                  <td style="width:40px;vertical-align:top;text-align:center;">
                    <div style="width:36px;height:36px;border-radius:50%;background:#fef3c7;border:2px solid #f59e0b;text-align:center;line-height:32px;font-size:16px;display:inline-block;">📦</div>
                    <div style="width:2px;height:28px;background:#e5e7eb;margin:0 auto;"></div>
                  </td>
                  <td style="padding-left:14px;padding-bottom:20px;vertical-align:top;padding-top:6px;">
                    <div style="font-weight:700;color:#111;font-size:14px;">Preparando tu pedido</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:2px;">Estamos verificando y empacando tus artículos</div>
                  </td>
                </tr>
                <tr>
                  <td style="width:40px;vertical-align:top;text-align:center;">
                    <div style="width:36px;height:36px;border-radius:50%;background:#f3f4f6;border:2px solid #d1d5db;text-align:center;line-height:32px;font-size:16px;display:inline-block;opacity:0.5;">🚚</div>
                  </td>
                  <td style="padding-left:14px;vertical-align:top;padding-top:6px;opacity:0.5;">
                    <div style="font-weight:700;color:#374151;font-size:14px;">En camino</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:2px;">Recibirás el número de rastreo pronto</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding:28px 0 0;">
              <div style="font-size:12px;color:#9ca3af;line-height:1.8;">
                ¿Tienes dudas? Contáctanos en <a href="mailto:contacto@bisontemanga.com" style="color:#dc2626;text-decoration:none;">contacto@bisontemanga.com</a>
              </div>
              <div style="font-size:11px;color:#d1d5db;margin-top:8px;">© 2026 Bisonte Manga · Todos los derechos reservados</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

    const { data, error } = await resend.emails.send({
        from: fromEmail,
        to,
        subject: `✅ Pedido #${orderNum} confirmado — Bisonte Manga`,
        html,
    });

    if (error) {
        throw new Error(`Resend error: ${error.message}`);
    }

    console.log(`[Mailer] Correo enviado a ${to}, id: ${data.id}`);
}
