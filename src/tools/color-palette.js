import { showToast } from '../toast.js';

export function initColorPalette() {
    const drop = document.getElementById('palette-drop');
    const input = document.getElementById('palette-input');
    const resultsEl = document.getElementById('palette-results');
    const swatchesEl = document.getElementById('palette-swatches');
    const cssEl = document.getElementById('palette-css');
    const copyCssBtn = document.getElementById('palette-copy-css');
    const newImageBtn = document.getElementById('palette-new-image');
    const countSlider = document.getElementById('palette-count');
    const countLabel = document.getElementById('palette-count-label');

    if (!drop) return;

    let lastImg = null;

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('border-blue-400', 'bg-blue-50'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('border-blue-400', 'bg-blue-50'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('border-blue-400', 'bg-blue-50');
        handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', e => { handleFile(e.target.files[0]); input.value = ''; });

    if (countSlider) {
        countSlider.addEventListener('input', () => {
            if (countLabel) countLabel.textContent = countSlider.value;
            if (lastImg) displayPalette(extractPalette(lastImg, parseInt(countSlider.value)));
        });
    }

    function handleFile(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast(`Skipped ${file.name}: please choose an image file.`, 'warning');
            return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            lastImg = img;
            const count = countSlider ? parseInt(countSlider.value) : 8;
            displayPalette(extractPalette(img, count));
            drop.classList.add('hidden');
            resultsEl.classList.remove('hidden');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            showToast(`Could not read ${file.name}: the image is damaged or in an unsupported format.`, 'error');
        };
        img.src = url;
    }

    function extractPalette(img, count = 8) {
        const size = 150;
        const offscreen = document.createElement('canvas');
        offscreen.width = size;
        offscreen.height = size;
        const ctx = offscreen.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) continue; // skip transparent
            // Clamp: rounding 248-255 up gives 256, which would overflow into the next channel
            const r = Math.min(255, Math.round(data[i] / 16) * 16);
            const g = Math.min(255, Math.round(data[i + 1] / 16) * 16);
            const b = Math.min(255, Math.round(data[i + 2] / 16) * 16);
            const key = (r << 16) | (g << 8) | b;
            buckets.set(key, (buckets.get(key) || 0) + 1);
        }

        const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);

        const palette = [];
        for (const [key] of sorted) {
            if (palette.length >= count) break;
            const r = (key >> 16) & 0xff;
            const g = (key >> 8) & 0xff;
            const b = key & 0xff;
            const tooClose = palette.some(p => {
                const dr = p.r - r, dg = p.g - g, db = p.b - b;
                return Math.sqrt(dr * dr + dg * dg + db * db) < 55;
            });
            if (!tooClose) palette.push({ r, g, b, hex: toHex(r, g, b) });
        }
        return palette;
    }

    function toHex(r, g, b) {
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    function contrastColor(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#000' : '#fff';
    }

    function displayPalette(palette) {
        swatchesEl.innerHTML = '';
        palette.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'rounded-xl overflow-hidden shadow-md hover:scale-105 transition-transform cursor-default';
            swatch.innerHTML = `
                <div class="h-24 flex items-center justify-center" style="background:${color.hex}">
                    <span class="text-xs font-black font-mono px-2 py-0.5 rounded" style="color:${contrastColor(color.hex)};background:rgba(0,0,0,0.1)">${color.hex}</span>
                </div>
                <div class="bg-slate-50 p-2 text-center border-t border-slate-100">
                    <p class="text-[10px] text-slate-500 font-mono">rgb(${color.r},${color.g},${color.b})</p>
                    <button class="copy-hex-btn text-[10px] font-bold text-blue-500 hover:text-blue-700 mt-0.5 transition-colors" data-hex="${color.hex}">Copy hex</button>
                </div>
            `;
            swatchesEl.appendChild(swatch);
        });

        // Numbered, most dominant first: names like "dark" or "accent" were often wrong for the actual colour.
        const cssLines = palette.map((c, i) => `  --color-${i + 1}: ${c.hex};`);
        cssEl.textContent = `:root {\n${cssLines.join('\n')}\n}`;
    }

    swatchesEl.addEventListener('click', e => {
        const btn = e.target.closest('.copy-hex-btn');
        if (!btn) return;
        navigator.clipboard.writeText(btn.dataset.hex);
        const prev = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = prev, 1500);
    });

    copyCssBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(cssEl.textContent);
        copyCssBtn.textContent = 'Copied!';
        setTimeout(() => copyCssBtn.textContent = 'Copy CSS', 1500);
    });

    newImageBtn.addEventListener('click', () => {
        lastImg = null;
        resultsEl.classList.add('hidden');
        drop.classList.remove('hidden');
        input.value = '';
    });
}
