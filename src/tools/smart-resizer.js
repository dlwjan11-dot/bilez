import { showToast } from '../toast.js';
import { downloadBlob, downloadZip } from '../download.js';

function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

export function initSmartResizer() {
    const input = document.getElementById('smart-input');
    const drop = document.getElementById('smart-drop');
    const counter = document.getElementById('smart-counter');
    const results = document.getElementById('smart-results');
    const emptyState = document.getElementById('smart-empty-state');
    const actionBar = document.getElementById('smart-actions');
    const resetBtn = document.getElementById('smart-reset');
    const dlAllBtn = document.getElementById('smart-download-all');

    const modeBtns = document.querySelectorAll('.smart-mode-btn');
    const manualInputs = document.getElementById('smart-manual-inputs');
    const widthInp = document.getElementById('smart-w');
    const heightInp = document.getElementById('smart-h');
    const presetBtns = document.querySelectorAll('.smart-preset-btn');
    const presetRow = document.getElementById('smart-preset-row');
    const toggleManual = document.getElementById('smart-toggle-manual');
    const qualitySlider = document.getElementById('smart-quality');
    const qualityVal = document.getElementById('smart-q-val');

    const limitCheckbox = document.getElementById('smart-limit-25');
    const suffixCheckbox = document.getElementById('smart-suffix-min');
    const bypassCheckbox = document.getElementById('smart-bypass');
    const upscaleCheckbox = document.getElementById('smart-upscale');
    const multiSizeCheckbox = document.getElementById('smart-multi-size');
    const multiSizesInput = document.getElementById('smart-sizes');
    const multiSizesRow = document.getElementById('smart-sizes-row');

    let files = [];
    let processedFiles = [];
    let resizeMode = 'auto';

    // Per-image stale-result guard: maps index -> current generation number
    const processGens = {};

    let ipcRenderer = null;
    if (window.require) {
        ipcRenderer = window.require('electron').ipcRenderer;
    }

    // Declared early — used as direct addEventListener argument below (TDZ if declared later)
    const debouncedReprocessAll = debounce(function () {
        const globalQ = parseFloat(qualitySlider.value);
        processedFiles.forEach((item, idx) => {
            if (item.removed) return; // card is gone; indices stay stable so skip, don't splice
            const itemSlider = document.getElementById(`smart-item-q-${idx}`);
            const itemQVal = document.getElementById(`smart-item-q-val-${idx}`);
            if (itemSlider && itemQVal) {
                itemSlider.value = globalQ;
                itemQVal.textContent = Math.round(globalQ * 100) + "%";
            }
            const loader = document.getElementById(`smart-loader-${idx}`);
            const dl = document.getElementById(`smart-dl-${idx}`);
            if (loader) loader.classList.remove('hidden');
            if (dl) dl.classList.add('pointer-events-none', 'opacity-50');
            processSingleImage(idx, globalQ);
        });
    }, 200);

    if (!drop) return;

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('border-blue-400', 'bg-blue-50'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('border-blue-400', 'bg-blue-50'));
    drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('border-blue-400', 'bg-blue-50');
        handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', (e) => handleFiles(e.target.files));

    modeBtns.forEach(btn => btn.addEventListener('click', () => {
        resizeMode = btn.dataset.mode;
        updateModeUI();
        debouncedReprocessAll();
    }));

    toggleManual.addEventListener('click', () => {
        resizeMode = 'manual';
        manualInputs.classList.remove('opacity-50', 'pointer-events-none');
        presetRow.classList.remove('opacity-50', 'pointer-events-none');
        updateModeUI();
        debouncedReprocessAll();
    });

    if (presetBtns) {
        presetBtns.forEach(btn => btn.addEventListener('click', () => {
            const width = parseInt(btn.dataset.width, 10);
            const height = parseInt(btn.dataset.height, 10);
            if (Number.isFinite(width)) widthInp.value = width;
            if (Number.isFinite(height)) heightInp.value = height;
            resizeMode = 'manual';
            manualInputs.classList.remove('opacity-50', 'pointer-events-none');
            presetRow.classList.remove('opacity-50', 'pointer-events-none');
            updateModeUI();
            debouncedReprocessAll();
        }));
    }

    [widthInp, heightInp].forEach(inp => inp.addEventListener('change', debouncedReprocessAll));

    qualitySlider.addEventListener('input', () => {
        qualityVal.textContent = Math.round(qualitySlider.value * 100) + "%";
    });
    qualitySlider.addEventListener('change', debouncedReprocessAll);

    document.querySelectorAll('input[name="smart-fmt"]').forEach(r => r.addEventListener('change', debouncedReprocessAll));

    if (suffixCheckbox) suffixCheckbox.addEventListener('change', debouncedReprocessAll);
    if (bypassCheckbox) bypassCheckbox.addEventListener('change', debouncedReprocessAll);
    if (upscaleCheckbox) upscaleCheckbox.addEventListener('change', debouncedReprocessAll);

    resetBtn.addEventListener('click', () => {
        processedFiles.forEach((item) => {
            if (item.compUrl) URL.revokeObjectURL(item.compUrl);
        });
        files = [];
        processedFiles = [];
        results.innerHTML = '';
        results.appendChild(emptyState);
        emptyState.classList.remove('hidden');
        actionBar.classList.add('hidden');
        counter.classList.add('hidden');
        input.value = '';
    });

    dlAllBtn.addEventListener('click', async () => {
        const useMultiSize = multiSizeCheckbox && multiSizeCheckbox.checked && ipcRenderer;

        if (useMultiSize) {
            const sizesText = multiSizesInput ? multiSizesInput.value : '';
            const sizes = sizesText.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
            if (!sizes.length) {
                showToast('Enter at least one width in the multi-size field.', 'warning');
                return;
            }

            dlAllBtn.disabled = true;
            const fmt = document.querySelector('input[name="smart-fmt"]:checked').value;
            const quality = parseFloat(qualitySlider.value);
            const zipFiles = [];
            const total = processedFiles.filter(i => i.file && !i.removed).length * sizes.length;
            let done = 0;

            for (const item of processedFiles) {
                if (!item.file || item.removed) continue;
                const fileBuffer = await item.file.arrayBuffer();
                const baseName = item.file.name.replace(/\.[^/.]+$/, '');
                const sourceFormat = (item.file.type || '').split('/')[1] || 'jpeg';
                const sharpFmt = fmt === 'keep'
                    ? (sourceFormat === 'png' ? 'png' : sourceFormat === 'webp' ? 'webp' : 'jpeg')
                    : fmt;
                const ext = sharpFmt === 'png' ? '.png' : sharpFmt === 'webp' ? '.webp' : '.jpg';

                for (const size of sizes) {
                    dlAllBtn.textContent = `${Math.round((done / total) * 100)}%`;
                    try {
                        const result = await ipcRenderer.invoke('process-image-sharp', {
                            fileData: fileBuffer, targetW: size, targetH: null,
                            quality, format: sharpFmt,
                            allowUpscale: upscaleCheckbox ? upscaleCheckbox.checked : false,
                        });
                        zipFiles.push({ name: `${baseName}_${size}w${ext}`, data: result });
                    } catch (e) {
                        console.error(`Multi-size error for ${item.file.name} @ ${size}w:`, e);
                    }
                    done++;
                }
            }

            dlAllBtn.textContent = 'Zipping…';
            try {
                await downloadZip(zipFiles, 'processed_images_multi.zip');
            } catch (e) {
                console.error('Multi-size ZIP failed:', e);
                showToast('ZIP download failed: ' + e.message, 'error');
            } finally {
                dlAllBtn.textContent = 'Download All as ZIP';
                dlAllBtn.disabled = false;
            }
        } else {
            dlAllBtn.disabled = true;
            dlAllBtn.textContent = 'Zipping…';
            try {
                const zipFiles = [];
                for (const item of processedFiles) {
                    if (!item.compressedBlob || item.removed) continue;
                    zipFiles.push({ name: item.name, data: await item.compressedBlob.arrayBuffer() });
                }
                await downloadZip(zipFiles, 'processed_images.zip');
            } catch (e) {
                console.error('ZIP download failed:', e);
                showToast('ZIP download failed: ' + e.message, 'error');
            } finally {
                dlAllBtn.textContent = 'Download All as ZIP';
                dlAllBtn.disabled = false;
            }
        }
    });

    function updateModeUI() {
        modeBtns.forEach(btn => {
            if (btn.dataset.mode === resizeMode) {
                btn.classList.remove('bg-slate-50', 'text-slate-600', 'border-slate-200');
                btn.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            } else {
                btn.classList.add('bg-slate-50', 'text-slate-600', 'border-slate-200');
                btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            }
        });

        if (resizeMode !== 'manual') {
            manualInputs.classList.add('opacity-50', 'pointer-events-none');
            if (presetRow) presetRow.classList.add('opacity-50', 'pointer-events-none');
        } else {
            manualInputs.classList.remove('opacity-50', 'pointer-events-none');
            if (presetRow) presetRow.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    function isRasterImage(file) {
        const name = (file && file.name || '').toLowerCase();
        const type = (file && file.type || '').toLowerCase();
        const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/jxl'];
        const extensions = /\.(jpe?g|png|webp|avif|heic|heif|bmp|jxl)$/i;

        return !!file && !/\.svg$/i.test(name) && (supportedTypes.includes(type) || extensions.test(name));
    }

    function handleFiles(fileList) {
        if (!fileList.length) return;

        let newFiles = Array.from(fileList).filter(file => {
            if (!isRasterImage(file)) {
                showToast(`Skipped ${file.name || 'file'}: only raster image formats are supported for resizing.`, 'warning');
                return false;
            }
            return true;
        });

        if (!newFiles.length) return;

        if (limitCheckbox && limitCheckbox.checked) {
            if (files.length >= 25) {
                showToast("Maximum limit of 25 images reached.", 'warning');
                return;
            }
            if (files.length + newFiles.length > 25) {
                const allowed = 25 - files.length;
                showToast(`Limit is 25 images. Only adding the first ${allowed}.`, 'warning');
                newFiles = newFiles.slice(0, allowed);
            }
        }

        files = [...files, ...newFiles];

        emptyState.classList.add('hidden');
        actionBar.classList.remove('hidden');
        counter.textContent = `${files.length} images loaded`;
        counter.classList.remove('hidden');

        newFiles.forEach((file) => {
            const idx = processedFiles.length;
            processedFiles.push({ file: file, status: 'pending' });
            createCard(idx, file);
            processSingleImage(idx, parseFloat(qualitySlider.value));
        });
    }

    function createCard(idx, file) {
        const card = document.createElement('div');
        card.id = `smart-card-${idx}`;
        card.className = "bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200 flex flex-col relative transition-all duration-200 hover:shadow-md";

        const currentGlobalQuality = parseFloat(qualitySlider.value);
        const origUrl = URL.createObjectURL(file);

        card.innerHTML = `
            <div class="h-32 bg-slate-100 relative overflow-hidden group/thumb">
                <div id="smart-loader-${idx}" class="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                    <span class="text-xs font-bold text-blue-600 animate-pulse">Processing...</span>
                </div>
                <img id="smart-img-${idx}" class="w-full h-full object-cover opacity-50 transition-opacity duration-300 z-10">
                <img id="smart-orig-${idx}" src="${origUrl}" class="w-full h-full object-cover absolute inset-0 z-10 opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-150 pointer-events-none">
                <span class="absolute top-1 left-1 text-[9px] font-black px-1.5 py-0.5 rounded z-30 bg-blue-600 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-none">BEFORE</span>
                <button id="smart-remove-${idx}" class="absolute top-1 right-1 z-30 w-5 h-5 rounded-full bg-slate-800/70 text-white text-xs font-bold flex items-center justify-center hover:bg-red-600 transition-colors leading-none">×</button>
            </div>
            <div class="p-3 flex flex-col flex-grow">
                <div class="flex justify-between items-start mb-1">
                    <h3 class="text-xs font-bold text-slate-700 truncate w-2/3" title="${file.name}">${file.name}</h3>
                    <span id="smart-size-${idx}" class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">${(file.size / 1024).toFixed(0)}KB</span>
                </div>
                <div class="text-[10px] text-slate-400 mb-2" id="smart-dims-${idx}">Calculating...</div>
                <div class="mt-1 pt-2 border-t border-slate-50">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Quality Adjust</span>
                        <span id="smart-item-q-val-${idx}" class="text-[10px] font-bold text-blue-500">${Math.round(currentGlobalQuality * 100)}%</span>
                    </div>
                    <input type="range" id="smart-item-q-${idx}" min="0.1" max="1.0" step="0.05" value="${currentGlobalQuality}" class="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer">
                </div>
                <div class="mt-auto pt-3 flex justify-between items-center">
                    <span id="smart-savings-${idx}" class="text-xs font-bold text-slate-300">--</span>
                    <button id="smart-dl-${idx}" class="text-[10px] font-bold text-blue-600 hover:text-white border border-blue-200 hover:bg-blue-600 hover:border-blue-600 px-3 py-1 rounded transition-colors pointer-events-none opacity-50">Save</button>
                </div>
            </div>
        `;
        results.appendChild(card);

        document.getElementById(`smart-remove-${idx}`).addEventListener('click', () => {
            const item = processedFiles[idx];
            if (!item) return;
            if (item.compUrl) URL.revokeObjectURL(item.compUrl);
            URL.revokeObjectURL(origUrl);
            item.removed = true;
            card.remove();
            const remaining = processedFiles.filter(i => !i.removed).length;
            if (remaining === 0) {
                files = [];
                processedFiles = [];
                results.innerHTML = '';
                results.appendChild(emptyState);
                emptyState.classList.remove('hidden');
                actionBar.classList.add('hidden');
                counter.classList.add('hidden');
            } else {
                counter.textContent = `${remaining} images loaded`;
                const countEl = document.getElementById('smart-processed-count');
                if (countEl) countEl.textContent = processedFiles.filter(i => !i.removed && i.compressedBlob).length;
            }
        });

        document.getElementById(`smart-dl-${idx}`).addEventListener('click', async () => {
            const item = processedFiles[idx];
            if (!item || !item.compressedBlob || item.removed) return;
            await downloadBlob(item.compressedBlob, item.name);
        });

        const itemSlider = document.getElementById(`smart-item-q-${idx}`);
        const itemQVal = document.getElementById(`smart-item-q-val-${idx}`);

        itemSlider.addEventListener('input', (e) => { itemQVal.textContent = Math.round(e.target.value * 100) + "%"; });

        const debouncedItemProcess = debounce((quality) => {
            document.getElementById(`smart-loader-${idx}`).classList.remove('hidden');
            document.getElementById(`smart-dl-${idx}`).classList.add('pointer-events-none', 'opacity-50');
            processSingleImage(idx, quality);
        }, 300);

        itemSlider.addEventListener('change', (e) => debouncedItemProcess(parseFloat(e.target.value)));
    }


    async function processSingleImage(idx, targetQuality) {
        const item = processedFiles[idx];
        if (!item || item.removed) return;
        const file = item.file;

        const gen = (processGens[idx] || 0) + 1;
        processGens[idx] = gen;

        try {
            if (bypassCheckbox && bypassCheckbox.checked) {
                if (item.compUrl) URL.revokeObjectURL(item.compUrl);

                item.compressedBlob = file;
                item.compUrl = URL.createObjectURL(file);
                item.name = file.name;

                if (processGens[idx] !== gen) return;

                const imgEl = document.getElementById(`smart-img-${idx}`);
                imgEl.src = item.compUrl;
                imgEl.classList.remove('opacity-50');
                document.getElementById(`smart-loader-${idx}`).classList.add('hidden');

                const sizeBadge = document.getElementById(`smart-size-${idx}`);
                if (sizeBadge) {
                    sizeBadge.textContent = `${(file.size / 1024).toFixed(0)}KB`;
                    sizeBadge.classList.remove('bg-slate-100', 'text-slate-500');
                    sizeBadge.classList.add('bg-orange-50', 'text-orange-600', 'font-bold');
                }

                document.getElementById(`smart-dims-${idx}`).textContent = "Original Size (Bypassed)";

                const saveEl = document.getElementById(`smart-savings-${idx}`);
                saveEl.textContent = "Unchanged";
                saveEl.className = "text-xs font-bold text-slate-400";

                const dlBtn = document.getElementById(`smart-dl-${idx}`);
                dlBtn.classList.remove('pointer-events-none', 'opacity-50');

                const countEl = document.getElementById('smart-processed-count');
                if (countEl) countEl.textContent = processedFiles.filter(i => i.compressedBlob && !i.removed).length;

                return;
            }

            const tempOrigUrl = URL.createObjectURL(file);
            const img = new Image();
            img.src = tempOrigUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Could not read image file'));
            });
            URL.revokeObjectURL(tempOrigUrl);

            if (processGens[idx] !== gen) return;

            let w = img.naturalWidth; let h = img.naturalHeight;
            const ratio = w / h;
            let targetW = w; let targetH = h;

            if (resizeMode === 'auto') {
                if (w > h) { targetW = 1920; targetH = targetW / ratio; } else { targetH = 1920; targetW = targetH * ratio; }
            } else if (resizeMode === 'landscape') { targetW = 1920; targetH = targetW / ratio;
            } else if (resizeMode === 'portrait') { targetH = 1920; targetW = targetH * ratio;
            } else if (resizeMode === 'manual') {
                const cw = parseInt(widthInp.value); const ch = parseInt(heightInp.value);
                if (cw && ch) { targetW = cw; targetH = ch;
                } else if (cw) { targetW = cw; targetH = cw / ratio;
                } else if (ch) { targetH = ch; targetW = ch * ratio; }
            } else if (resizeMode === 'none') {
                targetW = w; targetH = h;
            }

            const fmt = document.querySelector('input[name="smart-fmt"]:checked').value;

            let mime = 'image/jpeg';
            let ext = '.jpg';

            if (fmt === 'webp') {
                mime = 'image/webp'; ext = '.webp';
            } else if (fmt === 'jpeg') {
                mime = 'image/jpeg'; ext = '.jpg';
            } else if (fmt === 'keep') {
                const allowedMime = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
                mime = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'image/bmp'].includes(allowedMime)
                    ? allowedMime
                    : 'image/jpeg';
                ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
            }

            const fileBuffer = await file.arrayBuffer();
            if (processGens[idx] !== gen) return;

            const formatName = fmt === 'keep'
                ? mime.split('/')[1].replace('jpeg', 'jpg')
                : fmt;

            let bufferArray;
            if (ipcRenderer) {
                bufferArray = await ipcRenderer.invoke('process-image-sharp', {
                    fileData: fileBuffer,
                    targetW: targetW !== w ? targetW : null,
                    targetH: targetH !== h ? targetH : null,
                    quality: targetQuality,
                    format: formatName,
                    allowUpscale: upscaleCheckbox ? upscaleCheckbox.checked : false
                });
            } else {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    throw new Error('Canvas is not available in this browser context');
                }

                canvas.width = Math.max(1, Math.round(targetW || w));
                canvas.height = Math.max(1, Math.round(targetH || h));
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const outputType = formatName === 'webp' ? 'image/webp' : formatName === 'png' ? 'image/png' : 'image/jpeg';
                if (outputType !== mime) {
                    mime = outputType;
                    ext = outputType === 'image/png' ? '.png' : outputType === 'image/webp' ? '.webp' : '.jpg';
                }

                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob(resolve, outputType, Math.min(1, Math.max(0.1, targetQuality)));
                });

                if (!blob) {
                    throw new Error('Canvas export failed');
                }

                bufferArray = await blob.arrayBuffer();
            }

            if (processGens[idx] !== gen) return;

            const compressedBlob = new Blob([bufferArray], { type: mime });

            if (item.compUrl) URL.revokeObjectURL(item.compUrl);
            item.compressedBlob = compressedBlob;
            item.compUrl = URL.createObjectURL(compressedBlob);

            let baseName = file.name.replace(/\.[^/.]+$/, "").replace(/-min$/, "");
            if (suffixCheckbox && suffixCheckbox.checked) baseName += '-min';
            item.name = baseName + ext;

            const imgEl = document.getElementById(`smart-img-${idx}`);
            imgEl.src = item.compUrl;
            imgEl.classList.remove('opacity-50');

            document.getElementById(`smart-loader-${idx}`).classList.add('hidden');

            const sizeBadge = document.getElementById(`smart-size-${idx}`);
            if (sizeBadge) {
                sizeBadge.textContent = `${(compressedBlob.size / 1024).toFixed(0)}KB`;
                sizeBadge.classList.remove('bg-slate-100', 'text-slate-500');
                sizeBadge.classList.add('bg-blue-50', 'text-blue-600', 'font-bold');
            }

            const finalImg = new Image();
            finalImg.src = item.compUrl;
            await new Promise(resolve => finalImg.onload = resolve);

            if (processGens[idx] !== gen) return;

            document.getElementById(`smart-dims-${idx}`).textContent = `${img.naturalWidth}x${img.naturalHeight} → ${finalImg.naturalWidth}x${finalImg.naturalHeight}`;

            const saving = 100 - ((compressedBlob.size / file.size) * 100);
            const saveEl = document.getElementById(`smart-savings-${idx}`);

            if (compressedBlob.size >= file.size) {
                saveEl.textContent = "+0%";
                saveEl.className = "text-xs font-bold text-orange-400";
            } else {
                saveEl.textContent = `-${saving.toFixed(0)}%`;
                saveEl.className = saving > 50 ? "text-sm font-black text-green-500" : "text-xs font-bold text-green-500";
            }

            const dlBtn = document.getElementById(`smart-dl-${idx}`);
            dlBtn.classList.remove('pointer-events-none', 'opacity-50');

            const countEl = document.getElementById('smart-processed-count');
            if (countEl) countEl.textContent = processedFiles.filter(i => i.compressedBlob && !i.removed).length;

        } catch (e) {
            if (processGens[idx] !== gen) return;
            console.error("Processing Error:", e);
            const dimsEl = document.getElementById(`smart-dims-${idx}`);
            if (dimsEl) { dimsEl.textContent = "Error"; dimsEl.classList.add('text-red-500'); }
            const loaderEl = document.getElementById(`smart-loader-${idx}`);
            if (loaderEl) loaderEl.classList.add('hidden');
        }
    }
}
