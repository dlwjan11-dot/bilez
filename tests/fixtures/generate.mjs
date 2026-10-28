// Generates every fixture the e2e suite needs. Safe to re-run; it overwrites.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const DIR = path.dirname(fileURLToPath(import.meta.url));

function gradientSvg(w, h, label) {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#f59e0b"/>
        </linearGradient></defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
        <text x="50%" y="50%" font-size="${Math.round(Math.min(w, h) / 6)}" text-anchor="middle" fill="white">${label}</text>
    </svg>`);
}

async function image(name, w, h, format) {
    let img = sharp(gradientSvg(w, h, `${w}x${h}`));
    if (format === 'jpeg') img = img.jpeg({ quality: 95 });
    if (format === 'png') img = img.png();
    if (format === 'webp') img = img.webp({ quality: 95 });
    await img.toFile(path.join(DIR, name));
}

// Minimal multi-page PDF with correct xref offsets (no extra dependency needed).
function makePdf(pageCount) {
    const objs = [];
    const pageIds = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    let next = 4;
    for (let p = 1; p <= pageCount; p++) {
        const contentId = next++;
        const pageId = next++;
        const stream = `BT /F1 48 Tf 72 680 Td (Page ${p} of ${pageCount}) Tj ET\n0.2 0.4 0.9 rg 72 200 300 300 re f`;
        objs[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
        objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
        pageIds.push(pageId);
    }
    objs[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`;

    let out = '%PDF-1.4\n';
    const offsets = [];
    for (let i = 1; i < objs.length; i++) {
        offsets[i] = Buffer.byteLength(out);
        out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(out);
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
}

const SVG_BLOATED = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Generator: Adobe Illustrator 27.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" version="1.1" id="Layer_1" x="0px" y="0px" width="256px" height="256px" viewBox="0 0 256 256" style="enable-background:new 0 0 256 256;" xml:space="preserve">
  <metadata>
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description about="editor junk"/></rdf:RDF>
  </metadata>
  <sodipodi:namedview id="base" pagecolor="#ffffff" bordercolor="#666666" inkscape:zoom="1.0000000"/>
  <g id="Group_1">
    <g id="Group_2">
      <rect x="16.000000" y="16.000000" width="224.000000" height="224.000000" rx="32.000000" fill="#3B82F6"/>
      <circle cx="128.000000" cy="128.000000" r="64.000000" fill="#FFFFFF" fill-opacity="1.000000"/>
      <path d="M 128.000000 80.000000 L 160.000000 160.000000 L 96.000000 160.000000 Z" fill="#F59E0B"/>
    </g>
  </g>
</svg>
`;

async function main() {
    fs.mkdirSync(DIR, { recursive: true });

    // Raster images: small / large / portrait / landscape across formats
    await image('small.jpg', 200, 150, 'jpeg');
    await image('large.jpg', 4000, 3000, 'jpeg');
    await image('portrait.png', 1080, 1920, 'png');
    await image('landscape.webp', 2560, 1440, 'webp');
    await image('wide-banner.png', 800, 400, 'png');
    await image('صورة تجربة.jpg', 640, 480, 'jpeg');
    await image('my photo-min.jpg', 300, 300, 'jpeg');
    fs.copyFileSync(path.join(DIR, 'small.jpg'), path.join(DIR, 'small-min.jpg'));

    // Square logo with transparency for the favicon generator
    await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="220" fill="#2563eb"/></svg>') }])
        .png().toFile(path.join(DIR, 'logo-square.png'));

    // Four flat colour blocks (incl. pure white + pure red) for the palette extractor
    const blocks = ['#ffffff', '#ff0000', '#0000ff', '#00a000'];
    const blockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">${blocks.map((c, i) =>
        `<rect x="${(i % 2) * 200}" y="${Math.floor(i / 2) * 200}" width="200" height="200" fill="${c}"/>`).join('')}</svg>`;
    await sharp(Buffer.from(blockSvg)).png().toFile(path.join(DIR, 'palette-blocks.png'));

    // PDFs
    fs.writeFileSync(path.join(DIR, 'three-pages.pdf'), makePdf(3));
    fs.writeFileSync(path.join(DIR, 'ملف عربي.pdf'), makePdf(2));
    fs.writeFileSync(path.join(DIR, 'UPPER CASE.PDF'), makePdf(1));
    fs.writeFileSync(path.join(DIR, 'corrupt.pdf'), 'this is not really a pdf');

    // SVGs
    fs.writeFileSync(path.join(DIR, 'icon-bloated.svg'), SVG_BLOATED);
    fs.writeFileSync(path.join(DIR, 'شعار.svg'), SVG_BLOATED.replace('#3B82F6', '#10B981'));
    fs.writeFileSync(path.join(DIR, 'broken.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect></svg');

    // Error-case files
    fs.writeFileSync(path.join(DIR, 'empty.png'), '');
    fs.writeFileSync(path.join(DIR, 'fake-image.jpg'), 'definitely not a jpeg');
    fs.writeFileSync(path.join(DIR, 'notes.txt'), 'plain text file\nسطر عربي\n');
}

main().then(() => console.log('Fixtures written to', DIR));
