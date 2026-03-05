const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const publicDir = path.join(__dirname, '../public');

const images = [
    'graffiti-bg.png',
    'bisonte-mural.png',
    'login-mural.png',
    'nosotros-mural.png',
    'mural-adultos.png',
    'logo-hentai.png',
];

async function compress() {
    for (const file of images) {
        const input = path.join(publicDir, file);
        if (!fs.existsSync(input)) {
            console.log(`SKIP (not found): ${file}`);
            continue;
        }
        const outName = file.replace('.png', '.webp');
        const output = path.join(publicDir, outName);
        const statBefore = fs.statSync(input).size;
        await sharp(input)
            .webp({ quality: 82 })
            .toFile(output);
        const statAfter = fs.statSync(output).size;
        console.log(`${file} → ${outName}  |  ${(statBefore / 1024 / 1024).toFixed(1)} MB → ${(statAfter / 1024 / 1024).toFixed(1)} MB`);
    }
    console.log('\nDone!');
}

compress().catch(console.error);
