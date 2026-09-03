import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Pedidos de muestra para revisar la vista con todos los estados encima.
//
// Existe porque sembrar pedidos de prueba en torlan_pos ensucia la base que
// comparten la tienda y el POS: estas ventas falsas aparecerian en los cortes.
// Aqui no se toca la base — es una respuesta fija con la misma forma que
// devuelve /api/orders.
//
// Solo responde en desarrollo. En produccion es un 404, como si no existiera.
//
// Se ve en /perfil/mis-pedidos?demo=1
// ─────────────────────────────────────────────────────────────────────────────

const IMG = '/bisonte-mural.webp';

let secuencia = 9000;

function pedido({ titulo, status, claimStatus = null, tipo = 'Pedido Normal', dias, ...resto }) {
    const id = String(++secuencia);
    const fecha = new Date(Date.now() - dias * 86400000).toISOString();
    const precio = resto.precio ?? 249;
    const cantidad = resto.cantidad ?? 2;
    const subtotal = precio * cantidad;
    const envio = resto.envio ?? 149;
    const descuento = resto.descuento ?? 0;
    const total = subtotal + envio - descuento;

    return {
        id,
        date: fecha,
        status,
        claimStatus,
        itemName: titulo,
        itemsCount: cantidad,
        type: tipo,
        image: IMG,
        subtotal,
        discount: descuento,
        shipping: envio,
        total,
        trackingNumber: resto.tracking ?? null,
        carrier: resto.carrier ?? null,
        payments: [{ id: `pay_${id}`, amount: resto.pagado ?? total, date: fecha }],
        items: [
            { name: titulo, quantity: cantidad, price: precio, image: IMG },
            ...(resto.extra ? [resto.extra] : []),
        ],
    };
}

function demoOrders() {
    secuencia = 9000;
    return [
        // ── En curso, pedido normal ──
        pedido({ titulo: 'Chainsaw Man Vol. 1', status: 'verificando', dias: 0 }),
        pedido({ titulo: 'Berserk Deluxe Vol. 3', status: 'preparando', dias: 2, precio: 890, cantidad: 1 }),
        pedido({
            titulo: 'Jujutsu Kaisen Vol. 12', status: 'transito', dias: 5,
            tracking: '7712345678901', carrier: 'fedex',
        }),

        // ── En curso, preventa: mismo recorrido, otras etiquetas ──
        pedido({ titulo: 'One Piece Vol. 108 (preventa)', status: 'verificando', tipo: 'Preventa', dias: 8, precio: 199, cantidad: 3 }),
        pedido({
            titulo: 'Figura Nendoroid Gojo (preventa)', status: 'preparando', tipo: 'Preventa', dias: 14,
            precio: 1450, cantidad: 1, pagado: 500,
        }),

        // ── Pago parcial: la tarjeta muestra saldo pendiente ──
        pedido({
            titulo: 'Vagabond Box Set', status: 'preparando', dias: 3,
            precio: 2400, cantidad: 1, pagado: 1200,
        }),

        // ── Finalizados ──
        pedido({ titulo: 'Monster Kanzenban Vol. 2', status: 'entregado', dias: 21, descuento: 100 }),
        pedido({ titulo: 'Death Note Black Edition', status: 'cancelado', dias: 30, precio: 420, cantidad: 1 }),

        // ── Reclamos ──
        pedido({ titulo: 'Blame! Master Edition Vol. 1', status: 'reclamo', claimStatus: 'abierto', dias: 12 }),
        pedido({ titulo: 'Akira Vol. 6', status: 'reclamo', claimStatus: 'disputa', dias: 18, precio: 560, cantidad: 1 }),
        pedido({ titulo: 'Nausicaä Box Set', status: 'reclamo', claimStatus: 'resolucion', dias: 40, precio: 1890, cantidad: 1 }),
    ];
}

export async function GET() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'No disponible' }, { status: 404 });
    }
    return NextResponse.json({ orders: demoOrders() });
}
