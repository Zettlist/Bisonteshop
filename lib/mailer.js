import { Resend } from 'resend';

/**
 * Direcciones que no existen por definicion: .test e .invalid son dominios
 * reservados (RFC 2606) y ningun correo les llega nunca. Las usan las cuentas de
 * prueba (@bisonte.test) y las cuentas borradas (@bisontemanga.invalid).
 *
 * Mandarles correo no sirve de nada y SI gasta la cuota diaria del servicio,
 * que es la misma de los clientes de verdad: el 23/09 las pruebas automaticas
 * la agotaron y la tienda se quedo sin poder mandar ni un correo el resto del
 * dia. Por eso nada sale hacia ellas, y los avisos a la tienda sobre pedidos de
 * esas cuentas tampoco.
 */
export const esCorreoDePrueba = (correo) => /\.(test|invalid)$/i.test(String(correo || '').trim());

export async function sendVerificationEmail({ to, nombre, token, baseUrl }) {
    if (esCorreoDePrueba(to)) return;
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
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="display:inline-block;background:linear-gradient(135deg,#1a0000,#2d0000);border:1px solid rgba(220,38,38,0.3);border-radius:12px;padding:16px 32px;">
                <div style="font-size:28px;font-weight:900;letter-spacing:4px;color:#dc2626;text-transform:uppercase;line-height:1;">BISONTE MANGA</div>
                <div style="font-size:11px;color:#6b7280;margin-top:5px;letter-spacing:2px;text-transform:uppercase;">Manga · Figuras · Coleccionables</div>
              </div>
            </td>
          </tr>

          <!-- MAIN CARD -->
          <tr>
            <td style="background:linear-gradient(160deg,#111111 0%,#1a0000 100%);border-radius:20px;border:1px solid rgba(220,38,38,0.2);overflow:hidden;">

              <!-- RED TOP BAR -->
              <div style="height:3px;background:linear-gradient(90deg,#dc2626,#7f1d1d,transparent);"></div>

              <!-- ICON AREA -->
              <div style="text-align:center;padding:40px 36px 0;">
                <div style="display:inline-block;width:72px;height:72px;border-radius:50%;background:rgba(220,38,38,0.1);border:2px solid rgba(220,38,38,0.3);line-height:68px;font-size:30px;margin-bottom:24px;">
                  ✉️
                </div>

                <!-- BADGE -->
                <div style="display:inline-block;background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.35);border-radius:20px;padding:4px 14px;margin-bottom:20px;">
                  <span style="font-size:11px;font-weight:700;letter-spacing:2px;color:#dc2626;text-transform:uppercase;">Nueva cuenta</span>
                </div>

                <div style="font-size:26px;font-weight:900;color:#ffffff;margin-bottom:10px;letter-spacing:0.5px;">¡Bienvenido, ${nombre}!</div>
                <div style="font-size:15px;color:#9ca3af;line-height:1.7;margin-bottom:32px;max-width:400px;margin-left:auto;margin-right:auto;">
                  Solo falta un paso para activar tu cuenta y acceder a todo el catálogo de Bisonte Manga.
                </div>

                <!-- CTA BUTTON -->
                <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;font-weight:800;font-size:15px;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:1px;text-transform:uppercase;box-shadow:0 8px 24px rgba(220,38,38,0.35);">
                  Verificar mi correo →
                </a>
              </div>

              <!-- DIVIDER -->
              <div style="margin:36px 36px 0;height:1px;background:rgba(255,255,255,0.06);"></div>

              <!-- INFO ROW -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 36px;">
                <tr>
                  <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;">
                      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Expira en</div>
                      <div style="font-size:15px;font-weight:800;color:#ffffff;">24 horas</div>
                    </div>
                  </td>
                  <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;">
                      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Plataforma</div>
                      <div style="font-size:15px;font-weight:800;color:#ffffff;">bisontemanga.com</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- FALLBACK LINK -->
              <div style="padding:0 36px 32px;text-align:center;">
                <div style="font-size:12px;color:#4b5563;line-height:1.7;">
                  Si el botón no funciona, copia este enlace:<br>
                  <a href="${verifyUrl}" style="color:#dc2626;word-break:break-all;font-size:11px;text-decoration:none;">${verifyUrl}</a>
                </div>
                <div style="margin-top:16px;font-size:12px;color:#374151;">
                  Si no creaste esta cuenta, ignora este correo.
                </div>
              </div>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding:28px 0 0;">
              <div style="font-size:12px;color:#4b5563;line-height:1.8;">
                ¿Tienes dudas? <a href="mailto:contacto@bisontemanga.com" style="color:#dc2626;text-decoration:none;">contacto@bisontemanga.com</a>
              </div>
              <div style="font-size:11px;color:#374151;margin-top:6px;">© 2026 Bisonte Manga · Todos los derechos reservados</div>
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
    if (esCorreoDePrueba(to)) return;
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — correo omitido');
        return;
    }
    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';
    const orderNum = String(saleId);

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
                    <div style="font-size:24px;font-weight:900;color:#111;line-height:1.2;">Confirmación de pago</div>
                    <div style="font-size:14px;color:#6b7280;margin-top:4px;">Hola <strong>${nombre}</strong>, recibimos tu pago correctamente. Verificaremos el stock y te notificaremos.</div>
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

/**
 * Enlace para poner una contrasena nueva.
 *
 * El texto avisa de que el enlace caduca en una hora y de que, si no lo pidio,
 * no tiene que hacer nada. Eso segundo importa: quien reciba este correo sin
 * haberlo pedido tiene que saber que su cuenta sigue intacta mientras no abra
 * el enlace, y que no hay ningun paso que dar para «cancelar».
 *
 * No se menciona el nombre de la cuenta ni nada mas del perfil: el correo puede
 * acabar en una bandeja compartida, y con el enlace ya va bastante.
 */
export async function sendPasswordReset({ to, nombre, token, baseUrl }) {
    if (esCorreoDePrueba(to)) return;
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — correo omitido');
        return;
    }
    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';
    const resetUrl = `${baseUrl}/recuperar?token=${token}`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Recupera tu contraseña — Bisonte Manga</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="display:inline-block;background:linear-gradient(135deg,#1a0000,#2d0000);border:1px solid rgba(220,38,38,0.3);border-radius:12px;padding:16px 32px;">
                <div style="font-size:28px;font-weight:900;letter-spacing:4px;color:#dc2626;text-transform:uppercase;line-height:1;">BISONTE MANGA</div>
                <div style="font-size:11px;color:#6b7280;margin-top:5px;letter-spacing:2px;text-transform:uppercase;">Manga · Figuras · Coleccionables</div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:linear-gradient(160deg,#111111 0%,#1a0000 100%);border-radius:20px;border:1px solid rgba(220,38,38,0.2);overflow:hidden;">
              <div style="height:3px;background:linear-gradient(90deg,#dc2626,#7f1d1d,transparent);"></div>

              <div style="text-align:center;padding:40px 36px 0;">
                <div style="display:inline-block;width:72px;height:72px;border-radius:50%;background:rgba(220,38,38,0.1);border:2px solid rgba(220,38,38,0.3);line-height:68px;font-size:30px;margin-bottom:24px;">
                  🔑
                </div>

                <div style="display:inline-block;background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.35);border-radius:20px;padding:4px 14px;margin-bottom:20px;">
                  <span style="font-size:11px;font-weight:700;letter-spacing:2px;color:#dc2626;text-transform:uppercase;">Recuperar acceso</span>
                </div>

                <div style="font-size:26px;font-weight:900;color:#ffffff;margin-bottom:10px;letter-spacing:0.5px;">Hola, ${nombre}</div>
                <div style="font-size:15px;color:#9ca3af;line-height:1.7;margin-bottom:32px;max-width:400px;margin-left:auto;margin-right:auto;">
                  Alguien pidió una contraseña nueva para tu cuenta. Si fuiste tú, entra aquí y elige una.
                </div>

                <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;font-weight:800;font-size:15px;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:1px;text-transform:uppercase;box-shadow:0 8px 24px rgba(220,38,38,0.35);">
                  Poner contraseña nueva →
                </a>
              </div>

              <div style="margin:36px 36px 0;height:1px;background:rgba(255,255,255,0.06);"></div>

              <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 36px;">
                <tr>
                  <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;">
                      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Expira en</div>
                      <div style="font-size:15px;font-weight:800;color:#ffffff;">1 hora</div>
                    </div>
                  </td>
                  <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 16px;">
                      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Se usa</div>
                      <div style="font-size:15px;font-weight:800;color:#ffffff;">Una sola vez</div>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="padding:0 36px 32px;text-align:center;">
                <div style="font-size:12px;color:#4b5563;line-height:1.7;">
                  Si el botón no funciona, copia este enlace:<br>
                  <a href="${resetUrl}" style="color:#dc2626;word-break:break-all;font-size:11px;text-decoration:none;">${resetUrl}</a>
                </div>
                <div style="margin-top:16px;font-size:12px;color:#374151;">
                  ¿No lo pediste? No hagas nada. Tu contraseña actual sigue funcionando
                  y este enlace caduca solo.
                </div>
              </div>

            </td>
          </tr>

          <tr>
            <td align="center" style="padding:28px 0 0;">
              <div style="font-size:12px;color:#4b5563;line-height:1.8;">
                ¿Tienes dudas? <a href="mailto:contacto@bisontemanga.com" style="color:#dc2626;text-decoration:none;">contacto@bisontemanga.com</a>
              </div>
              <div style="font-size:11px;color:#374151;margin-top:6px;">© 2026 Bisonte Manga · Todos los derechos reservados</div>
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
        subject: '🔑 Recupera tu contraseña — Bisonte Manga',
        html,
    });

    if (error) {
        throw new Error(`Resend error: ${error.message}`);
    }

    console.log(`[Mailer] Recuperación enviada a ${to}, id: ${data.id}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// Aviso al mostrador: entro un pedido.
//
// No lo lee un cliente, lo lee quien tiene que surtirlo, asi que esta escrito
// para eso: lo primero que se ve es el numero de pedido y lo que hay que
// empacar. Sin florituras.
//
// El destinatario sale de AVISO_PEDIDOS_EMAIL y no esta escrito aqui: cambiar
// a quien le llega no deberia costar un despliegue. Acepta varias direcciones
// separadas por coma. Si la variable no esta puesta, no se manda nada y no
// falla nada -- el pedido ya quedo registrado, que es lo que importa.
//
// Todo lo que viene de fuera se escapa. El nombre de quien compra y su
// direccion los escribe el cliente, y aqui acaban dentro de un HTML.
// ─────────────────────────────────────────────────────────────────────────────

const escaparHtml = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
));

export async function sendNewOrderAlert({ saleId, cliente, email, items, subtotal, discount, shipping, credit, total, direccion, pagoCon }) {
    if (esCorreoDePrueba(email)) return;
    const destinos = (process.env.AVISO_PEDIDOS_EMAIL || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
    if (!destinos.length) return;
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — aviso de pedido omitido');
        return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';
    const dinero = (n) => '$' + Number(n || 0).toFixed(2);

    const renglones = (items || []).map((i) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">
            <strong style="color:#111;">${escaparHtml(i.title)}</strong>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;color:#444;">
            x${Number(i.quantity) || 1}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#444;">
            ${dinero(Number(i.price) * (Number(i.quantity) || 1))}
          </td>
        </tr>`).join('');

    const d = direccion || {};
    const lineaDireccion = [
        [d.calle, d.numero_ext].filter(Boolean).join(' '),
        d.numero_int ? 'int. ' + d.numero_int : '',
        d.colonia, d.municipio, d.estado, d.cp ? 'CP ' + d.cp : '',
    ].filter(Boolean).map(escaparHtml).join(', ');

    const filaCredito = Number(credit) > 0
        ? `<tr><td colspan="2" style="padding:4px 0;color:#666;">Pagado con saldo</td>
             <td style="padding:4px 0;text-align:right;color:#16a34a;">−${dinero(credit)}</td></tr>`
        : '';
    const filaDescuento = Number(discount) > 0
        ? `<tr><td colspan="2" style="padding:4px 0;color:#666;">Descuento</td>
             <td style="padding:4px 0;text-align:right;color:#16a34a;">−${dinero(discount)}</td></tr>`
        : '';

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#fafafa;">
      <div style="background:#111;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
        <div style="font-size:12px;letter-spacing:3px;color:#dc2626;font-weight:700;">NUEVO PEDIDO</div>
        <div style="font-size:30px;font-weight:900;margin-top:4px;">#${escaparHtml(saleId)}</div>
      </div>

      <div style="background:#fff;padding:22px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;">

        <p style="margin:0 0 4px;color:#111;font-size:15px;">
          <strong>${escaparHtml(cliente)}</strong>
        </p>
        <p style="margin:0 0 18px;color:#666;font-size:13px;">${escaparHtml(email)}</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">${renglones}</table>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px;">
          <tr><td colspan="2" style="padding:4px 0;color:#666;">Subtotal</td>
              <td style="padding:4px 0;text-align:right;color:#444;">${dinero(subtotal)}</td></tr>
          ${filaDescuento}
          <tr><td colspan="2" style="padding:4px 0;color:#666;">Envío</td>
              <td style="padding:4px 0;text-align:right;color:#444;">${dinero(shipping)}</td></tr>
          ${filaCredito}
          <tr><td colspan="2" style="padding:10px 0 0;font-size:16px;font-weight:800;color:#111;">Cobrado a la tarjeta</td>
              <td style="padding:10px 0 0;text-align:right;font-size:18px;font-weight:900;color:#111;">${dinero(total)}</td></tr>
        </table>

        <div style="margin-top:20px;padding:14px;background:#f6f6f6;border-radius:8px;font-size:13px;color:#333;line-height:1.6;">
          <strong style="color:#111;">Enviar a</strong><br>${lineaDireccion || '(sin dirección)'}
        </div>

        <div style="margin-top:16px;padding:12px 14px;background:#fff7ed;border-left:4px solid #f59e0b;border-radius:6px;font-size:13px;color:#7c2d12;line-height:1.6;">
          ${pagoCon === 'saldo'
            ? 'Pagado <strong>entero con saldo de tienda</strong>. No hay cargo que capturar en Stripe.'
            : 'El dinero está <strong>retenido, no cobrado</strong>. Se cobra al confirmar existencias en el POS.'}
        </div>

      </div>
      <p style="text-align:center;font-size:11px;color:#999;margin-top:16px;">
        Aviso automático de la tienda · llega a AVISO_PEDIDOS_EMAIL
      </p>
    </div>`;

    const { error } = await resend.emails.send({
        from: fromEmail,
        to: destinos,
        replyTo: email || undefined,
        subject: `Pedido #${saleId} — ${dinero(total)} — ${cliente}`,
        html,
    });

    if (error) {
        // No se lanza hacia arriba: el pedido ya esta registrado y un fallo de
        // correo no puede tumbarlo. Queda en el log.
        console.error('[Mailer] Aviso de pedido falló:', error.message);
        return;
    }
    console.log(`[Mailer] Aviso del pedido #${saleId} enviado a ${destinos.length} destino(s)`);
}

/**
 * Aviso a la tienda de que un apartado se pago por internet.
 *
 * Sin esto nadie se entera: el abono entra por Stripe de madrugada, el panel de
 * apartados lo refleja en silencio y la mercancia se queda esperando a que
 * alguien abra esa pantalla. Va al mismo buzon que los pedidos
 * (AVISO_PEDIDOS_EMAIL) para no tener dos listas de destinatarios que
 * mantener.
 *
 * `saldo` viene del mismo calculo que la respuesta al cliente. Cuando queda en
 * cero el apartado esta listo para entregarse; se dice en el asunto porque es
 * lo unico que cambia lo que hay que hacer al leerlo.
 */
export async function sendApartadoPagadoAlert({ folio, apartadoId, cliente, email, items, total, pagado, saldo }) {
    if (esCorreoDePrueba(email)) return;
    const destinos = (process.env.AVISO_PEDIDOS_EMAIL || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
    if (!destinos.length) return;
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — aviso de apartado omitido');
        return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';
    const dinero = (n) => '$' + Number(n || 0).toFixed(2);

    const liquidado = Number(saldo) <= 0;
    const referencia = folio || `#${apartadoId}`;

    const renglones = (items || []).map((i) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">
            <strong style="color:#111;">${escaparHtml(i.title)}</strong>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#444;">
            x${Number(i.quantity) || 1}
          </td>
        </tr>`).join('');

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#fafafa;">
      <div style="background:#111;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
        <div style="font-size:12px;letter-spacing:3px;color:#dc2626;font-weight:700;">
          ${liquidado ? 'APARTADO LIQUIDADO' : 'ABONO A UN APARTADO'}
        </div>
        <div style="font-size:30px;font-weight:900;margin-top:4px;">${escaparHtml(referencia)}</div>
      </div>

      <div style="background:#fff;padding:22px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;">

        <p style="margin:0 0 4px;color:#111;font-size:15px;"><strong>${escaparHtml(cliente)}</strong></p>
        <p style="margin:0 0 18px;color:#666;font-size:13px;">${escaparHtml(email)}</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">${renglones}</table>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px;">
          <tr><td style="padding:4px 0;color:#666;">Total del apartado</td>
              <td style="padding:4px 0;text-align:right;color:#444;">${dinero(total)}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Pagó ahora</td>
              <td style="padding:4px 0;text-align:right;color:#444;">${dinero(pagado)}</td></tr>
          <tr><td style="padding:10px 0 0;font-size:16px;font-weight:800;color:#111;">Le queda por pagar</td>
              <td style="padding:10px 0 0;text-align:right;font-size:18px;font-weight:900;color:${liquidado ? '#16a34a' : '#111'};">
                ${dinero(Math.max(0, Number(saldo) || 0))}
              </td></tr>
        </table>

        <div style="margin-top:16px;padding:12px 14px;background:${liquidado ? '#ecfdf5' : '#f6f6f6'};border-left:4px solid ${liquidado ? '#16a34a' : '#9ca3af'};border-radius:6px;font-size:13px;color:#333;line-height:1.6;">
          ${liquidado
            ? 'Ya no debe nada. Prepara la mercancía y ciérralo desde <strong>Apartados</strong>.'
            : 'Sigue abierto hasta su fecha de vencimiento.'}
          <br>El dinero se cobró con tarjeta por internet: <strong>no entra al corte de caja</strong>, se concilia por el reporte de abonos.
        </div>

      </div>

      <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">
        Aviso automático de la tienda · llega a AVISO_PEDIDOS_EMAIL
      </p>
    </div>`;

    const { error } = await resend.emails.send({
        from: fromEmail,
        to: destinos,
        replyTo: email || undefined,
        subject: liquidado
            ? `Apartado ${referencia} liquidado — ${cliente}`
            : `Abono de ${dinero(pagado)} al apartado ${referencia} — ${cliente}`,
        html,
    });

    if (error) {
        // El abono ya esta cobrado y registrado; un fallo de correo no puede
        // tumbarlo. Queda en el log.
        console.error('[Mailer] Aviso de apartado falló:', error.message);
        return;
    }
    console.log(`[Mailer] Aviso del apartado ${referencia} enviado a ${destinos.length} destino(s)`);
}

/**
 * Confirmacion para quien acaba de apartar desde la tienda.
 *
 * Es el unico papel que tiene: el folio con el que va a preguntar, la fecha
 * limite y lo que debe. La fecha va en grande y la regla de perder el anticipo
 * va escrita, no enterrada en los terminos, porque es la que duele.
 */
export async function sendApartadoCreado({ to, nombre, folio, articulo, cantidad, total, pagado, saldo, vence }) {
    if (esCorreoDePrueba(to)) return;
    if (!to) return;
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — confirmación de apartado omitida');
        return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';
    const dinero = (n) => '$' + Number(n || 0).toFixed(2);
    const dia = new Date(vence).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fafafa;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:26px;font-weight:900;letter-spacing:3px;color:#dc2626;">BISONTE MANGA</div>
      </div>

      <div style="background:#fff;border-radius:14px;padding:26px;border:1px solid #e5e5e5;">
        <p style="margin:0 0 6px;color:#666;font-size:12px;letter-spacing:2px;font-weight:700;">APARTADO</p>
        <div style="font-size:30px;font-weight:900;color:#111;margin-bottom:16px;">${escaparHtml(folio)}</div>

        <p style="color:#374151;margin:0 0 16px;">
          Hola <strong>${escaparHtml(nombre || 'y gracias')}</strong>, ya te guardamos
          <strong>${escaparHtml(articulo)}</strong>${Number(cantidad) > 1 ? ` (x${Number(cantidad)})` : ''}.
        </p>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:4px 0;color:#666;">Precio total</td>
              <td style="padding:4px 0;text-align:right;color:#444;">${dinero(total)}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Pagaste hoy</td>
              <td style="padding:4px 0;text-align:right;color:#16a34a;font-weight:700;">${dinero(pagado)}</td></tr>
          <tr><td style="padding:10px 0 0;font-size:16px;font-weight:800;color:#111;">Te queda por pagar</td>
              <td style="padding:10px 0 0;text-align:right;font-size:18px;font-weight:900;color:#111;">${dinero(saldo)}</td></tr>
        </table>

        ${Number(saldo) > 0 ? `
        <div style="margin-top:18px;padding:14px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;font-size:14px;color:#7f1d1d;line-height:1.6;">
          Tienes hasta el <strong>${dia}</strong> para pagar los ${dinero(saldo)} que faltan.
          Si no, el artículo vuelve al catálogo y el anticipo no se devuelve.
        </div>
        <p style="color:#374151;font-size:14px;margin:16px 0 0;">
          Puedes pagarlo cuando quieras desde <strong>Mi cuenta &rsaquo; Mis apartados</strong>.
        </p>` : `
        <div style="margin-top:18px;padding:14px;background:#ecfdf5;border-left:4px solid #16a34a;border-radius:6px;font-size:14px;color:#065f46;line-height:1.6;">
          Ya está pagado por completo. Te escribimos para coordinar la entrega.
        </div>`}
      </div>

      <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:18px;">
        &copy; 2026 Bisonte Manga &middot; Este es un correo automático
      </p>
    </div>`;

    const { error } = await resend.emails.send({
        from: fromEmail,
        to,
        subject: `Apartado ${folio} confirmado — Bisonte Manga`,
        html,
    });

    if (error) {
        console.error('[Mailer] Confirmación de apartado falló:', error.message);
        return;
    }
    console.log(`[Mailer] Confirmación del apartado ${folio} enviada`);
}

/**
 * Aviso a la tienda de que entro un apartado por internet.
 *
 * Sin esto el apartado aparece en el panel del POS en silencio y la pieza se
 * queda separada sin que nadie lo sepa hasta que alguien abra esa pantalla.
 * Mismo buzon que los pedidos (AVISO_PEDIDOS_EMAIL).
 */
export async function sendNuevoApartadoAlert({ folio, apartadoId, cliente, email, articulo, cantidad, total, pagado, saldo, vence }) {
    if (esCorreoDePrueba(email)) return;
    const destinos = (process.env.AVISO_PEDIDOS_EMAIL || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
    if (!destinos.length) return;
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — aviso de apartado nuevo omitido');
        return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';
    const dinero = (n) => '$' + Number(n || 0).toFixed(2);
    const dia = new Date(vence).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#fafafa;">
      <div style="background:#111;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
        <div style="font-size:12px;letter-spacing:3px;color:#dc2626;font-weight:700;">APARTADO NUEVO POR INTERNET</div>
        <div style="font-size:30px;font-weight:900;margin-top:4px;">${escaparHtml(folio)}</div>
      </div>

      <div style="background:#fff;padding:22px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;">

        <p style="margin:0 0 4px;color:#111;font-size:15px;"><strong>${escaparHtml(cliente)}</strong></p>
        <p style="margin:0 0 18px;color:#666;font-size:13px;">${escaparHtml(email)}</p>

        <p style="margin:0 0 14px;color:#111;font-size:15px;">
          ${escaparHtml(articulo)} <span style="color:#666;">x${Number(cantidad) || 1}</span>
        </p>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:4px 0;color:#666;">Total del apartado</td>
              <td style="padding:4px 0;text-align:right;color:#444;">${dinero(total)}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Anticipo cobrado</td>
              <td style="padding:4px 0;text-align:right;color:#16a34a;font-weight:700;">${dinero(pagado)}</td></tr>
          <tr><td style="padding:10px 0 0;font-size:16px;font-weight:800;color:#111;">Le queda por pagar</td>
              <td style="padding:10px 0 0;text-align:right;font-size:18px;font-weight:900;color:#111;">${dinero(saldo)}</td></tr>
        </table>

        <div style="margin-top:16px;padding:12px 14px;background:#f6f6f6;border-left:4px solid #9ca3af;border-radius:6px;font-size:13px;color:#333;line-height:1.6;">
          La pieza ya está separada del catálogo y aparece en <strong>Apartados</strong> del POS.
          Vence el <strong>${dia}</strong>.<br>
          El anticipo entró por tarjeta: <strong>no va al corte de caja</strong>, se concilia por el reporte de abonos.
        </div>

      </div>

      <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">
        Aviso automático de la tienda &middot; llega a AVISO_PEDIDOS_EMAIL
      </p>
    </div>`;

    const { error } = await resend.emails.send({
        from: fromEmail,
        to: destinos,
        replyTo: email || undefined,
        subject: `Apartado ${folio} — ${dinero(pagado)} de anticipo — ${cliente}`,
        html,
    });

    if (error) {
        console.error('[Mailer] Aviso de apartado nuevo falló:', error.message);
        return;
    }
    console.log(`[Mailer] Aviso del apartado ${folio} enviado a ${destinos.length} destino(s)`);
}

/**
 * El cliente pidio que le mandaran sus apartados, y ya pago el envio.
 *
 * La tienda no tiene mostrador: un apartado liquidado no se recoge, se manda.
 * Este es el correo que cierra ese paso -- lo que va en la caja, a donde va y
 * con quien. El numero de guia no esta todavia: se genera cuando alguien
 * confirma el pedido en el POS, y va en el correo de confirmacion de siempre.
 */
export async function sendApartadoEnvioCliente({ to, nombre, saleId, folios, items, envio, direccion, paqueteria }) {
    if (esCorreoDePrueba(to)) return;
    if (!to) return;
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — correo de envío omitido');
        return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';
    const dinero = (n) => '$' + Number(n || 0).toFixed(2);

    const renglones = (items || []).map((i) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#111;">${escaparHtml(i.title)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#666;">x${Number(i.quantity) || 1}</td>
        </tr>`).join('');

    const d = direccion || {};
    const lineaDireccion = [
        [d.calle, d.numero_exterior || d.numero_ext].filter(Boolean).join(' '),
        (d.numero_interior || d.numero_int) ? 'int. ' + (d.numero_interior || d.numero_int) : '',
        d.colonia, d.municipio, d.estado, d.cp ? 'CP ' + d.cp : '',
    ].filter(Boolean).map(escaparHtml).join(', ');

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#fafafa;">
      <div style="background:#111;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
        <div style="font-size:12px;letter-spacing:3px;color:#ffd60a;font-weight:700;">TU APARTADO YA VA EN CAMINO</div>
        <div style="font-size:30px;font-weight:900;margin-top:4px;">Pedido #${escaparHtml(saleId)}</div>
      </div>

      <div style="background:#fff;padding:22px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;">

        <p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.6;">
          Hola ${escaparHtml(nombre)}: ya pagaste el envío de
          <strong>${escaparHtml((folios || []).join(', '))}</strong>.
          Lo empacamos y te mandamos el número de guía en cuanto salga.
        </p>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">${renglones}</table>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px;">
          <tr><td style="padding:4px 0;color:#666;">Mercancía</td>
              <td style="padding:4px 0;text-align:right;color:#16a34a;font-weight:700;">Ya pagada</td></tr>
          <tr><td style="padding:10px 0 0;font-size:16px;font-weight:800;color:#111;">Envío${paqueteria ? ' · ' + escaparHtml(paqueteria) : ''}</td>
              <td style="padding:10px 0 0;text-align:right;font-size:18px;font-weight:900;color:#111;">${dinero(envio)}</td></tr>
        </table>

        <div style="margin-top:20px;padding:14px;background:#f6f6f6;border-radius:8px;font-size:13px;color:#333;line-height:1.6;">
          <strong style="color:#111;">Va a</strong><br>${lineaDireccion || '(sin dirección)'}
        </div>

      </div>
      <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">
        Bisonte Manga &middot; bisontemanga.com
      </p>
    </div>`;

    const { error } = await resend.emails.send({
        from: fromEmail,
        to,
        subject: `Tu apartado va en camino — pedido #${saleId}`,
        html,
    });

    if (error) {
        console.error('[Mailer] Correo de envío de apartado falló:', error.message);
        return;
    }
    console.log(`[Mailer] Envío del pedido #${saleId} avisado al cliente`);
}

/**
 * Aviso a la tienda: hay que empacar y mandar un apartado.
 *
 * Va al mismo buzon que los pedidos (AVISO_PEDIDOS_EMAIL) y dice lo unico que
 * lo distingue de un pedido normal: la mercancia ya estaba pagada y lo que
 * queda por cobrar es solo el envio. Sin esa linea, el total de la venta que
 * aparece en el POS parece dinero por cobrar.
 */
export async function sendApartadoEnvioAlert({ saleId, folios, cliente, email, items, mercancia, envio, direccion, paqueteria, servicio }) {
    if (esCorreoDePrueba(email)) return;
    const destinos = (process.env.AVISO_PEDIDOS_EMAIL || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
    if (!destinos.length) return;
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — aviso de envío omitido');
        return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';
    const dinero = (n) => '$' + Number(n || 0).toFixed(2);

    const renglones = (items || []).map((i) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;"><strong style="color:#111;">${escaparHtml(i.title)}</strong></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;color:#444;">x${Number(i.quantity) || 1}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#444;">${dinero(Number(i.price) * (Number(i.quantity) || 1))}</td>
        </tr>`).join('');

    const d = direccion || {};
    const lineaDireccion = [
        [d.calle, d.numero_exterior || d.numero_ext].filter(Boolean).join(' '),
        (d.numero_interior || d.numero_int) ? 'int. ' + (d.numero_interior || d.numero_int) : '',
        d.colonia, d.municipio, d.estado, d.cp ? 'CP ' + d.cp : '',
    ].filter(Boolean).map(escaparHtml).join(', ');

    const lista = escaparHtml((folios || []).join(', '));

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#fafafa;">
      <div style="background:#111;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
        <div style="font-size:12px;letter-spacing:3px;color:#dc2626;font-weight:700;">APARTADO PARA ENVIAR</div>
        <div style="font-size:30px;font-weight:900;margin-top:4px;">#${escaparHtml(saleId)}</div>
        <div style="font-size:14px;color:#9ca3af;margin-top:4px;">${lista}</div>
      </div>

      <div style="background:#fff;padding:22px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;">

        <p style="margin:0 0 4px;color:#111;font-size:15px;"><strong>${escaparHtml(cliente)}</strong></p>
        <p style="margin:0 0 18px;color:#666;font-size:13px;">${escaparHtml(email || '')}</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">${renglones}</table>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px;">
          <tr><td colspan="2" style="padding:4px 0;color:#666;">Mercancía (ya cobrada en el apartado)</td>
              <td style="padding:4px 0;text-align:right;color:#444;">${dinero(mercancia)}</td></tr>
          <tr><td colspan="2" style="padding:10px 0 0;font-size:16px;font-weight:800;color:#111;">Envío por cobrar${paqueteria ? ' · ' + escaparHtml(paqueteria) : ''}${servicio ? ' ' + escaparHtml(servicio) : ''}</td>
              <td style="padding:10px 0 0;text-align:right;font-size:18px;font-weight:900;color:#111;">${dinero(envio)}</td></tr>
        </table>

        <div style="margin-top:20px;padding:14px;background:#f6f6f6;border-radius:8px;font-size:13px;color:#333;line-height:1.6;">
          <strong style="color:#111;">Enviar a</strong><br>${lineaDireccion || '(sin dirección)'}
        </div>

        <div style="margin-top:16px;padding:12px 14px;background:#fff7ed;border-left:4px solid #f59e0b;border-radius:6px;font-size:13px;color:#7c2d12;line-height:1.6;">
          Está en <strong>Pedidos Página Web</strong> como cualquier pedido: al confirmarlo se genera la guía.
          Lo único retenido en la tarjeta es <strong>el envío</strong>; la mercancía se pagó en el apartado.
          Las piezas ya estaban separadas, así que el inventario no cambia hasta que confirmes.
        </div>

      </div>
      <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">
        Aviso automático de la tienda &middot; llega a AVISO_PEDIDOS_EMAIL
      </p>
    </div>`;

    const { error } = await resend.emails.send({
        from: fromEmail,
        to: destinos,
        replyTo: email || undefined,
        subject: `Enviar ${lista} — pedido #${saleId} — ${cliente}`,
        html,
    });

    if (error) {
        console.error('[Mailer] Aviso de envío de apartado falló:', error.message);
        return;
    }
    console.log(`[Mailer] Aviso de envío del pedido #${saleId} enviado a ${destinos.length} destino(s)`);
}
