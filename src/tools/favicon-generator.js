import { showToast } from '../toast.js';
import { downloadZip } from '../download.js';

async function pngBlobToIco(pngBlob, size) {
    const pngData = new Uint8Array(await pngBlob.arrayBuffer());
    const imageOffset = 6 + 16;
    const buffer = new ArrayBuffer(imageOffset + pngData.length);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, 1, true);

    bytes[6] = size === 256 ? 0 : size;
    bytes[7] = size === 256 ? 0 : size;
    bytes[8] = 0;
    bytes[9] = 0;
    bytes[10] = 1;
    bytes[11] = 0;
    bytes[12] = 32;
    bytes[13] = 0;
    view.setUint32(14, pngData.length, true);
    view.setUint32(18, imageOffset, true);
    bytes.set(pngData, imageOffset);

    return new Blob([bytes], { type: 'image/x-icon' });
}

export function initFaviconGenerator() {
    const drop = document.getElementById('fav-drop');
    const input = document.getElementById('fav-input');
    const ui = document.getElementById('fav-ui');
    const preview = document.getElementById('fav-preview');
    const btn = document.getElementById('fav-generate-btn');
    const status = document.getElementById('fav-status');
    const appNameInput = document.getElementById('fav-app-name');

    let sourceImage = null;

    if (!drop) return;

    const iconSpecs = [
        { name: 'favicon-16x16.png', size: 16 },
        { name: 'favicon-32x32.png', size: 32 },
        { name: 'apple-touch-icon-57x57-precomposed.png', size: 57 },
        { name: 'apple-touch-icon-72x72-precomposed.png', size: 72 },
        { name: 'apple-touch-icon-114x114-precomposed.png', size: 114 },
        { name: 'apple-touch-icon-144x144-precomposed.png', size: 144 },
        { name: 'icon-192x192.png', size: 192 },
        { name: 'icon-512x512.png', size: 512 },
    ];

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-active'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-active'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('drag-active');
        handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', e => handleFile(e.target.files[0]));

    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            showToast('Please upload a valid image file.', 'warning');
            return;
        }

        const url = URL.createObjectURL(file);
        preview.src = url;

        sourceImage = new Image();
        sourceImage.src = url;

        drop.classList.add('hidden');
        ui.classList.remove('hidden');
        status.textContent = "Ready to generate!";
    }

    btn.addEventListener('click', async () => {
        if (!sourceImage) return;

        btn.disabled = true;
        status.textContent = "Cutting icons...";
        status.className = "text-sm mt-3 font-bold text-blue-500";

        const zipFiles = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        await new Promise(resolve => {
            if (sourceImage.complete) resolve();
            else sourceImage.onload = resolve;
        });

        let favicon32Blob = null;

        for (const spec of iconSpecs) {
            canvas.width = spec.size;
            canvas.height = spec.size;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const minDim = Math.min(sourceImage.width, sourceImage.height);
            const sx = (sourceImage.width - minDim) / 2;
            const sy = (sourceImage.height - minDim) / 2;

            if (spec.name.includes('apple')) {
                const drawRadius = spec.size / 4.5;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(drawRadius, 0);
                ctx.arcTo(spec.size, 0, spec.size, spec.size, drawRadius);
                ctx.arcTo(spec.size, spec.size, 0, spec.size, drawRadius);
                ctx.arcTo(0, spec.size, 0, 0, drawRadius);
                ctx.arcTo(0, 0, spec.size, 0, drawRadius);
                ctx.closePath();

                ctx.clip();
                ctx.drawImage(sourceImage, sx, sy, minDim, minDim, 0, 0, spec.size, spec.size);
                ctx.restore();
            } else {
                ctx.drawImage(sourceImage, sx, sy, minDim, minDim, 0, 0, spec.size, spec.size);
            }

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            zipFiles.push({ name: spec.name, data: await blob.arrayBuffer() });
            if (spec.size === 32) favicon32Blob = blob;
        }

        // Generate favicon.ico from the 32×32 PNG
        if (favicon32Blob) {
            const icoBlob = await pngBlobToIco(favicon32Blob, 32);
            zipFiles.push({ name: 'favicon.ico', data: await icoBlob.arrayBuffer() });
        }

        // Generate site.webmanifest
        const appName = appNameInput ? appNameInput.value.trim() || 'My App' : 'My App';
        const manifest = JSON.stringify({
            name: appName,
            short_name: appName,
            icons: [
                { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
                { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
            ],
            theme_color: '#ffffff',
            background_color: '#ffffff',
            display: 'standalone',
        }, null, 2);
        zipFiles.push({ name: 'site.webmanifest', data: manifest });

        status.textContent = "Zipping files...";

        await downloadZip(zipFiles, 'website_icons.zip');

        status.textContent = "Done! Check your downloads.";
        status.className = "text-sm mt-3 font-bold text-green-600";

        setTimeout(() => { btn.disabled = false; }, 1500);
    });
}
