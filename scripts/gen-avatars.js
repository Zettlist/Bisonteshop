// Genera el set fijo de avatares de perfil como SVG estáticos (estilo zine Bisonte).
// Sin API externa: arte vectorial determinista por nombre. Salida: public/avatars/<cat>/<seed>.svg
// Uso: node scripts/gen-avatars.js
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'avatars');

// Hash determinista (FNV-1a) → entero estable por nombre.
function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
// PRNG determinista sembrado por el hash → secuencia estable de "azar".
function rng(seedInt) {
    let s = seedInt || 1;
    return () => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
        return s / 0xffffffff;
    };
}
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

const STROKE = '#0a0a0a';
const SW = 6; // grosor de contorno zine

function frame(bg, inner) {
    // marco circular con sombra dura tipo sticker
    return `
  <rect x="0" y="0" width="200" height="200" rx="34" fill="${bg}"/>
  <rect x="6" y="6" width="188" height="188" rx="28" fill="none" stroke="${STROKE}" stroke-width="4" opacity="0.35"/>
  ${inner}`;
}

// Paletas vivas (tomadas del look del picker actual)
const VIBRANT = ['#f7a01d', '#34c759', '#ff6b35', '#7b61ff', '#e63946', '#ffd60a', '#ff5da2', '#2d9cdb', '#9b8cff', '#00b894'];
const BG_DARK = ['#141414', '#1b1b1b', '#101418', '#181018'];

// ─────────────────────────────────────────── ROBOTS
function robot(seed) {
    const r = rng(hash('robot' + seed));
    const bg = pick(r, BG_DARK);
    const body = pick(r, VIBRANT);
    const eyeColor = pick(r, ['#0a0a0a', '#ffffff', '#ffd60a', '#e63946']);
    const antBulb = pick(r, ['#e63946', '#ffd60a', '#34c759']);
    const eyeType = Math.floor(r() * 4);
    const mouthType = Math.floor(r() * 4);

    let eyes;
    if (eyeType === 0) eyes = `<circle cx="78" cy="98" r="11" fill="${eyeColor}" stroke="${STROKE}" stroke-width="3"/><circle cx="122" cy="98" r="11" fill="${eyeColor}" stroke="${STROKE}" stroke-width="3"/>`;
    else if (eyeType === 1) eyes = `<rect x="66" y="90" width="68" height="18" rx="9" fill="#0a0a0a" stroke="${STROKE}" stroke-width="3"/><circle cx="82" cy="99" r="5" fill="${antBulb}"/><circle cx="118" cy="99" r="5" fill="${antBulb}"/>`;
    else if (eyeType === 2) eyes = `<path d="M70 92 l18 0 0 14 -18 0z" fill="${eyeColor}" stroke="${STROKE}" stroke-width="3"/><path d="M112 92 l18 0 0 14 -18 0z" fill="${eyeColor}" stroke="${STROKE}" stroke-width="3"/>`;
    else eyes = `<path d="M70 104 q8 -16 18 0" fill="none" stroke="${eyeColor === '#ffffff' ? '#fff' : '#ffd60a'}" stroke-width="5" stroke-linecap="round"/><path d="M112 104 q8 -16 18 0" fill="none" stroke="${eyeColor === '#ffffff' ? '#fff' : '#ffd60a'}" stroke-width="5" stroke-linecap="round"/>`;

    let mouth;
    if (mouthType === 0) mouth = `<rect x="74" y="128" width="52" height="14" rx="4" fill="#0a0a0a"/><line x1="86" y1="128" x2="86" y2="142" stroke="${body}" stroke-width="3"/><line x1="100" y1="128" x2="100" y2="142" stroke="${body}" stroke-width="3"/><line x1="114" y1="128" x2="114" y2="142" stroke="${body}" stroke-width="3"/>`;
    else if (mouthType === 1) mouth = `<path d="M78 130 q22 18 44 0" fill="none" stroke="#0a0a0a" stroke-width="5" stroke-linecap="round"/>`;
    else if (mouthType === 2) mouth = `<rect x="80" y="130" width="40" height="8" rx="4" fill="#0a0a0a"/>`;
    else mouth = `<circle cx="100" cy="134" r="9" fill="#0a0a0a"/>`;

    const inner = `
  <line x1="100" y1="46" x2="100" y2="64" stroke="${STROKE}" stroke-width="5"/>
  <circle cx="100" cy="40" r="8" fill="${antBulb}" stroke="${STROKE}" stroke-width="3"/>
  <rect x="52" y="62" width="96" height="92" rx="22" fill="${body}" stroke="${STROKE}" stroke-width="${SW}"/>
  <rect x="40" y="92" width="12" height="26" rx="5" fill="${body}" stroke="${STROKE}" stroke-width="4"/>
  <rect x="148" y="92" width="12" height="26" rx="5" fill="${body}" stroke="${STROKE}" stroke-width="4"/>
  ${eyes}
  ${mouth}`;
    return frame(bg, inner);
}

// ─────────────────────────────────────────── EMOJIS
function emoji(seed) {
    const r = rng(hash('emoji' + seed));
    const bg = pick(r, BG_DARK);
    const face = pick(r, ['#ffd60a', '#ffb612', '#ffcf4d', '#ff9f1c']);
    const expr = Math.floor(r() * 5);
    const accessory = Math.floor(r() * 3);

    let eyes = `<circle cx="80" cy="95" r="8" fill="#0a0a0a"/><circle cx="120" cy="95" r="8" fill="#0a0a0a"/>`;
    let mouth;
    if (expr === 0) mouth = `<path d="M74 120 q26 30 52 0" fill="none" stroke="#0a0a0a" stroke-width="6" stroke-linecap="round"/>`;
    else if (expr === 1) { mouth = `<path d="M74 128 q26 -22 52 0" fill="none" stroke="#0a0a0a" stroke-width="6" stroke-linecap="round"/>`; eyes = `<path d="M70 98 q10 -14 20 0" fill="none" stroke="#0a0a0a" stroke-width="5" stroke-linecap="round"/><path d="M110 98 q10 -14 20 0" fill="none" stroke="#0a0a0a" stroke-width="5" stroke-linecap="round"/>`; }
    else if (expr === 2) { mouth = `<ellipse cx="100" cy="126" rx="14" ry="18" fill="#0a0a0a"/>`; eyes = `<circle cx="80" cy="93" r="10" fill="#0a0a0a"/><circle cx="120" cy="93" r="10" fill="#0a0a0a"/>`; }
    else if (expr === 3) { mouth = `<path d="M78 126 l44 0" stroke="#0a0a0a" stroke-width="6" stroke-linecap="round"/>`; eyes = `<line x1="70" y1="95" x2="90" y2="95" stroke="#0a0a0a" stroke-width="6" stroke-linecap="round"/><line x1="110" y1="95" x2="130" y2="95" stroke="#0a0a0a" stroke-width="6" stroke-linecap="round"/>`; }
    else { mouth = `<path d="M74 118 q26 26 52 0" fill="none" stroke="#0a0a0a" stroke-width="6" stroke-linecap="round"/><path d="M84 132 q16 10 32 0" fill="#e63946"/>`; }

    let acc = '';
    if (accessory === 0) acc = `<rect x="62" y="86" width="34" height="20" rx="6" fill="none" stroke="#0a0a0a" stroke-width="4"/><rect x="104" y="86" width="34" height="20" rx="6" fill="none" stroke="#0a0a0a" stroke-width="4"/><line x1="96" y1="94" x2="104" y2="94" stroke="#0a0a0a" stroke-width="4"/>`; // lentes nerd
    else if (accessory === 1) acc = `<circle cx="64" cy="116" r="9" fill="#e63946" opacity="0.5"/><circle cx="136" cy="116" r="9" fill="#e63946" opacity="0.5"/>`; // cachetes

    const inner = `
  <circle cx="100" cy="108" r="56" fill="${face}" stroke="${STROKE}" stroke-width="${SW}"/>
  ${eyes}
  ${mouth}
  ${acc}`;
    return frame(bg, inner);
}

// ─────────────────────────────────────────── PIXEL
function pixel(seed) {
    const r = rng(hash('pixel' + seed));
    const bg = pick(r, BG_DARK);
    const skin = pick(r, VIBRANT);
    const cell = 18, ox = 28, oy = 28, grid = 8;
    let cells = '';
    // patrón simétrico (espejo vertical)
    const map = [];
    for (let y = 0; y < grid; y++) {
        map[y] = [];
        for (let x = 0; x < grid / 2; x++) {
            const on = r() > 0.42;
            map[y][x] = on;
            map[y][grid - 1 - x] = on;
        }
    }
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
        if (map[y][x]) cells += `<rect x="${ox + x * cell}" y="${oy + y * cell}" width="${cell}" height="${cell}" fill="${skin}"/>`;
    }
    // ojos pixel
    const eye = `<rect x="${ox + 2 * cell}" y="${oy + 3 * cell}" width="${cell}" height="${cell}" fill="#0a0a0a"/><rect x="${ox + 5 * cell}" y="${oy + 3 * cell}" width="${cell}" height="${cell}" fill="#0a0a0a"/>`;
    const inner = `<g>${cells}${eye}</g><rect x="${ox}" y="${oy}" width="${grid * cell}" height="${grid * cell}" fill="none" stroke="${STROKE}" stroke-width="4" rx="6"/>`;
    return frame(bg, inner);
}

// ─────────────────────────────────────────── AVENTUREROS
function adventurer(seed) {
    const r = rng(hash('adv' + seed));
    const bg = pick(r, BG_DARK);
    const skin = pick(r, ['#f2c094', '#e0a878', '#c98b5e', '#a86b43']);
    const gear = pick(r, VIBRANT);
    const helm = Math.floor(r() * 4);

    let headgear;
    if (helm === 0) headgear = `<path d="M58 90 q42 -56 84 0 l0 6 -84 0z" fill="${gear}" stroke="${STROKE}" stroke-width="${SW}"/><rect x="96" y="40" width="8" height="20" fill="${gear}" stroke="${STROKE}" stroke-width="3"/>`; // casco con cresta
    else if (helm === 1) headgear = `<path d="M52 96 q48 -70 96 0z" fill="${gear}" stroke="${STROKE}" stroke-width="${SW}"/>`; // capucha/sombrero pico
    else if (helm === 2) headgear = `<path d="M60 88 q40 -44 80 0 l0 4 -80 0z" fill="${gear}" stroke="${STROKE}" stroke-width="${SW}"/><circle cx="100" cy="50" r="7" fill="#ffd60a" stroke="${STROKE}" stroke-width="3"/>`; // diadema con joya
    else headgear = `<path d="M54 92 q46 -60 92 0 l-12 0 q-34 -34 -68 0z" fill="${gear}" stroke="${STROKE}" stroke-width="${SW}"/>`; // capucha abierta

    const eyes = `<circle cx="84" cy="104" r="6" fill="#0a0a0a"/><circle cx="116" cy="104" r="6" fill="#0a0a0a"/>`;
    const mouth = r() > 0.5
        ? `<path d="M86 124 q14 12 28 0" fill="none" stroke="#0a0a0a" stroke-width="4" stroke-linecap="round"/>`
        : `<line x1="88" y1="126" x2="112" y2="126" stroke="#0a0a0a" stroke-width="4" stroke-linecap="round"/>`;
    const inner = `
  <rect x="64" y="150" width="72" height="30" rx="10" fill="${gear}" stroke="${STROKE}" stroke-width="${SW}"/>
  <circle cx="100" cy="108" r="40" fill="${skin}" stroke="${STROKE}" stroke-width="${SW}"/>
  ${eyes}${mouth}
  ${headgear}`;
    return frame(bg, inner);
}

const CATS = {
    robots: { fn: robot, seeds: ['Voltron', 'Mecha', 'Cyborg', 'Gundam', 'R2D2', 'Wall-E', 'Bender', 'Optimus', 'Megatron', 'Gipsy', 'Jaegers', 'Terminator'] },
    pixel: { fn: pixel, seeds: ['Mario', 'Link', 'Samus', 'Kirby', 'Pikachu', 'Goku', 'Naruto', 'Luffy', 'Ichigo', 'Vegeta', 'Tanjiro', 'Itachi'] },
    aventureros: { fn: adventurer, seeds: ['Wizard', 'Knight', 'Rogue', 'Paladin', 'Ranger', 'Bard', 'Druid', 'Warlock', 'Monk', 'Cleric', 'Shaman', 'Necro'] },
    emojis: { fn: emoji, seeds: ['Loco', 'Friki', 'Otaku', 'Nerd', 'Gamer', 'Weeabo', 'Sensei', 'Shogun', 'Daimyo', 'Ronin', 'Oni', 'Kitsune'] },
};

let count = 0;
for (const [cat, { fn, seeds }] of Object.entries(CATS)) {
    const dir = path.join(OUT, cat);
    fs.mkdirSync(dir, { recursive: true });
    for (const seed of seeds) {
        const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${seed}">${fn(seed)}\n</svg>`;
        fs.writeFileSync(path.join(dir, `${seed}.svg`), svg);
        count++;
    }
}
console.log(`Generados ${count} avatares en public/avatars/`);
