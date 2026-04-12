import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Envía el correo de confirmación de pedido via Resend.
 */
export async function sendOrderConfirmation({ to, nombre, saleId, items, subtotal, discount, shipping, total }) {
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Mailer] RESEND_API_KEY no configurado — correo omitido');
        return;
    }

    const fromEmail = process.env.EMAIL_FROM || 'Bisonte Manga <noreply@bisontemanga.com>';

    const itemsHtml = items.map(item => {
        const isPreventa = item.type === 'preventa';
        const stockBadge = isPreventa
            ? `<span style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">PREVENTA</span>`
            : item.stockOk
                ? `<span style="background:#10b981;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">EN STOCK</span>`
                : `<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">SIN STOCK</span>`;

        return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #2a2a2a;">
            <div style="font-weight:700;color:#f1f1f1;margin-bottom:4px;">${item.title || item.name || 'Producto'}</div>
            <div style="font-size:13px;color:#888;">Cant: ${item.quantity} &nbsp;·&nbsp; ${stockBadge}</div>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #2a2a2a;text-align:right;font-weight:800;color:#10b981;white-space:nowrap;">
            $${(Number(item.price) * Number(item.quantity)).toFixed(2)} MXN
          </td>
        </tr>`;
    }).join('');

    const discountRow = discount > 0
        ? `<tr><td style="color:#888;padding:4px 0;">Descuento</td><td style="text-align:right;color:#10b981;">−$${Number(discount).toFixed(2)}</td></tr>`
        : '';

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:28px;font-weight:900;letter-spacing:2px;color:#e63946;">BISONTE MANGA</div>
      <div style="font-size:13px;color:#666;margin-top:4px;">Manga · Figuras · Coleccionables</div>
    </div>

    <div style="background:#161616;border:1px solid #2a2a2a;border-radius:16px;padding:28px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
        <div style="width:52px;height:52px;border-radius:50%;border:2px solid #10b981;background:rgba(16,185,129,0.1);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">✓</div>
        <div>
          <div style="font-size:22px;font-weight:900;color:#f1f1f1;">¡Pedido confirmado!</div>
          <div style="font-size:13px;color:#888;margin-top:2px;">Hola ${nombre}, recibimos tu compra correctamente.</div>
        </div>
      </div>
      <div style="background:#1e1e1e;border-radius:8px;padding:12px 16px;display:inline-block;">
        <span style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Pedido #</span>
        <span style="font-size:18px;font-weight:900;color:#e63946;margin-left:8px;">${String(saleId).padStart(6, '0')}</span>
      </div>
    </div>

    <div style="background:#161616;border:1px solid #2a2a2a;border-radius:16px;padding:24px;margin-bottom:24px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#666;margin-bottom:16px;">Tus artículos</div>
      <table style="width:100%;border-collapse:collapse;">
        ${itemsHtml}
        <tr><td colspan="2" style="padding:16px 0 4px;"></td></tr>
        <tr><td style="color:#888;padding:4px 0;">Subtotal</td><td style="text-align:right;color:#f1f1f1;">$${Number(subtotal).toFixed(2)}</td></tr>
        ${discountRow}
        <tr><td style="color:#888;padding:4px 0;">Envío</td><td style="text-align:right;color:#f1f1f1;">$${Number(shipping).toFixed(2)}</td></tr>
        <tr>
          <td style="padding-top:12px;font-size:18px;font-weight:900;color:#f1f1f1;border-top:1px solid #2a2a2a;">Total pagado</td>
          <td style="padding-top:12px;text-align:right;font-size:18px;font-weight:900;color:#10b981;border-top:1px solid #2a2a2a;">$${Number(total).toFixed(2)} MXN</td>
        </tr>
      </table>
    </div>

    <div style="background:#161616;border:1px solid #2a2a2a;border-radius:16px;padding:24px;margin-bottom:24px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#666;margin-bottom:16px;">Estado del pedido</div>
      <div style="display:flex;gap:16px;align-items:center;padding:8px 0;">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(16,185,129,0.12);border:2px solid #10b981;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">✓</div>
        <div><div style="font-weight:700;color:#f1f1f1;">Pago confirmado</div><div style="font-size:12px;color:#888;">Tu pago fue procesado exitosamente</div></div>
      </div>
      <div style="width:2px;height:20px;background:#10b981;margin-left:17px;"></div>
      <div style="display:flex;gap:16px;align-items:center;padding:8px 0;">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(230,57,70,0.1);border:2px solid #e63946;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">🔍</div>
        <div><div style="font-weight:700;color:#f1f1f1;">Confirmación de existencias</div><div style="font-size:12px;color:#888;">Verificando stock en almacén</div></div>
      </div>
      <div style="width:2px;height:20px;background:#2a2a2a;margin-left:17px;"></div>
      <div style="display:flex;gap:16px;align-items:center;padding:8px 0;opacity:0.4;">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.03);border:2px solid #333;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">📦</div>
        <div><div style="font-weight:700;color:#888;">Preparando tu pedido</div><div style="font-size:12px;color:#666;">Empacando tus artículos</div></div>
      </div>
      <div style="width:2px;height:20px;background:#2a2a2a;margin-left:17px;"></div>
      <div style="display:flex;gap:16px;align-items:center;padding:8px 0;opacity:0.4;">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.03);border:2px solid #333;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">🚚</div>
        <div><div style="font-weight:700;color:#888;">En camino</div><div style="font-size:12px;color:#666;">Recibirás el número de rastreo pronto</div></div>
      </div>
    </div>

    <div style="text-align:center;color:#555;font-size:12px;line-height:1.8;">
      <div>© 2026 Bisonte Manga · Todos los derechos reservados</div>
    </div>
  </div>
</body>
</html>`;

    const { data, error } = await resend.emails.send({
        from: fromEmail,
        to,
        subject: `✅ Pedido #${String(saleId).padStart(6, '0')} confirmado — Bisonte Manga`,
        html,
    });

    if (error) {
        throw new Error(`Resend error: ${error.message}`);
    }

    console.log(`[Mailer] Correo enviado a ${to}, id: ${data.id}`);
}
