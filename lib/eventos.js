// Configuración de eventos por tiempo limitado.
// Para borrar un evento definitivamente: eliminar su entrada aquí,
// su carpeta en components/eventos/ y su línea de render en layout.js.

export const EVENTOS = {
    // Mundial 2026 — fase de grupos México vs Corea del Sur
    mundial2026: {
        id: 'mundial2026-mex-kor',
        // Offset -06:00 explícito (CDMX): sin él, el servidor (UTC) y el navegador interpretan horas distintas
        inicio: '2026-06-10T00:00:00-06:00',
        cierreVotacion: '2026-06-18T19:00:00-06:00', // 7:00 pm CDMX 18 jun → cierra la votación
        fin: '2026-06-22T23:59:59-06:00', // el widget desaparece (deja días para reclamar código)
        opciones: {
            mexico: { nombre: 'México', iso: 'MX', color: '#006847' },
            corea: { nombre: 'Corea del Sur', iso: 'KR', color: '#0047A0' },
        },
    },
};

export function eventoActivo(nombre) {
    const e = EVENTOS[nombre];
    if (!e) return false;
    const ahora = new Date();
    return ahora >= new Date(e.inicio) && ahora <= new Date(e.fin);
}

export function votacionAbierta(nombre) {
    const e = EVENTOS[nombre];
    if (!e) return false;
    const ahora = new Date();
    return ahora >= new Date(e.inicio) && ahora < new Date(e.cierreVotacion);
}
