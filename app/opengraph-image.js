import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// La tarjeta que sale al compartir un enlace de la tienda en WhatsApp,
// Facebook o X. Antes no habia ninguna: el enlace salia como texto suelto, sin
// imagen, y en un chat eso se salta. Las fichas de producto ponen su propia
// portada encima de esta; esta es la de todo lo demas.
//
// Se dibuja con los colores de la tienda en vez de recortar el mural: el mural
// es 3168x1344 y en la proporcion que piden las redes (1.91:1) se pierde lo de
// los lados.
export const alt = 'Bisonte Manga — manga japonés, revistas y figuras originales';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
    const logo = await readFile(join(process.cwd(), 'public', 'logo.png'));
    const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#0a0a0a',
                    color: '#ffffff',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        background: '#e63946',
                        color: '#ffffff',
                        fontSize: 30,
                        fontWeight: 800,
                        letterSpacing: 6,
                        padding: '18px 0',
                        justifyContent: 'center',
                        borderBottom: '6px solid #000000',
                    }}
                >
                    DIRECTO DE JAPÓN · CERO RELLENO · PURO MANGA
                </div>

                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 80px',
                        gap: 56,
                    }}
                >
                    <img src={logoSrc} width={250} height={250} alt="" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', fontSize: 108, fontWeight: 900, lineHeight: 1 }}>
                            BISONTE
                        </div>
                        <div style={{ display: 'flex', fontSize: 108, fontWeight: 900, lineHeight: 1, color: '#e63946' }}>
                            MANGA
                        </div>
                        <div style={{ display: 'flex', fontSize: 36, color: '#ffd60a', marginTop: 28 }}>
                            Manga japonés, revistas y figuras originales
                        </div>
                        <div style={{ display: 'flex', fontSize: 28, color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>
                            Envíos a todo México · bisontemanga.com
                        </div>
                    </div>
                </div>
            </div>
        ),
        size
    );
}
