import { showToast } from '../toast.js';
import { downloadBlob } from '../download.js';

const HANDLE_R = 5; // corner handle hit radius in canvas px

export function initImageCropper() {
    const drop = document.getElementById('crop-drop');
    const input = document.getElementById('crop-input');
    const editorEl = document.getElementById('crop-editor');
    const canvas = document.getElementById('crop-canvas');
    const dimsEl = document.getElementById('crop-dims');
    const downloadBtn = document.getElementById('crop-download');
    const newImageBtn = document.getElementById('crop-new-image');
    const resetBtn = document.getElementById('crop-reset-selection');
    const ratioBtns = document.querySelectorAll('.crop-ratio-btn');

    if (!drop) return;

    let ipcRenderer = null;
    if (window.require) ipcRenderer = window.require('electron').ipcRenderer;

    const ctx = canvas.getContext('2d');
    let sourceFile = null;
    let sourceImg = null;
    let displayScale = 1;

    // Crop rect in canvas (display) coordinates
    let crop = { x: 0, y: 0, w: 0, h: 0 };
    let cropAtDragStart = null;

    let isDragging = false;
    let dragMode = 'new'; // 'new' | 'move' | 'tl' | 'tr' | 'bl' | 'br'
    let dragStart = { x: 0, y: 0 };
    let aspectRatio = null;

    // ── File handling ─────────────────────────────────────────────────
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('border-blue-400', 'bg-blue-50'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('border-blue-400', 'bg-blue-50'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('border-blue-400', 'bg-blue-50');
        handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', e => { handleFile(e.target.files[0]); input.value = ''; });

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
            sourceFile = file;
            sourceImg = img;
            setupCanvas();
            drop.classList.add('hidden');
            editorEl.classList.remove('hidden');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            showToast(`Could not read ${file.name}: the image is damaged or in an unsupported format.`, 'error');
        };
        img.src = url;
    }

    function setupCanvas() {
        const maxW = 780;
        const maxH = 520;
        displayScale = Math.min(maxW / sourceImg.naturalWidth, maxH / sourceImg.naturalHeight);
        canvas.width = Math.round(sourceImg.naturalWidth * displayScale);
        canvas.height = Math.round(sourceImg.naturalHeight * displayScale);
        crop = { x: 0, y: 0, w: canvas.width, h: canvas.height };
        draw();
        updateDims();
    }

    // ── Canvas drawing ────────────────────────────────────────────────
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);

        if (crop.w > 1 && crop.h > 1) {
            // Dark overlay outside crop
            ctx.fillStyle = 'rgba(0,0,0,0.52)';
            ctx.fillRect(0, 0, canvas.width, crop.y);
            ctx.fillRect(0, crop.y + crop.h, canvas.width, canvas.height - crop.y - crop.h);
            ctx.fillRect(0, crop.y, crop.x, crop.h);
            ctx.fillRect(crop.x + crop.w, crop.y, canvas.width - crop.x - crop.w, crop.h);

            // Border
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            ctx.strokeRect(crop.x + 0.5, crop.y + 0.5, crop.w - 1, crop.h - 1);

            // Rule-of-thirds
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1;
            for (let i = 1; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(crop.x + (crop.w / 3) * i, crop.y);
                ctx.lineTo(crop.x + (crop.w / 3) * i, crop.y + crop.h);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(crop.x, crop.y + (crop.h / 3) * i);
                ctx.lineTo(crop.x + crop.w, crop.y + (crop.h / 3) * i);
                ctx.stroke();
            }

            // Corner handles
            ctx.fillStyle = '#3b82f6';
            corners().forEach(([hx, hy]) => {
                ctx.beginPath();
                ctx.arc(hx, hy, HANDLE_R, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    function corners() {
        return [
            [crop.x, crop.y],
            [crop.x + crop.w, crop.y],
            [crop.x, crop.y + crop.h],
            [crop.x + crop.w, crop.y + crop.h],
        ];
    }

    // Map the display-space crop to source pixels. Edges are converted (not x + width)
    // with a per-axis scale, so a full-canvas selection is exactly the full image and
    // rounding can never step outside it.
    function toImageRect() {
        const natW = sourceImg.naturalWidth;
        const natH = sourceImg.naturalHeight;
        const sx = natW / canvas.width;
        const sy = natH / canvas.height;
        const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(v)));
        const left = clamp(crop.x * sx, natW);
        const top = clamp(crop.y * sy, natH);
        const right = clamp((crop.x + crop.w) * sx, natW);
        const bottom = clamp((crop.y + crop.h) * sy, natH);
        let width = right - left;
        let height = bottom - top;
        // sx and sy differ slightly (the canvas size is rounded), so with a locked ratio
        // derive the height from the width in source pixels to keep e.g. 1:1 exactly square
        if (aspectRatio) {
            height = Math.min(Math.round(width / aspectRatio), natH - top);
            width = Math.min(width, Math.round(height * aspectRatio));
        }
        return { left, top, width, height };
    }

    function updateDims() {
        if (crop.w > 0 && crop.h > 0) {
            const { width, height } = toImageRect();
            dimsEl.textContent = `${width} × ${height} px`;
        } else {
            dimsEl.textContent = '';
        }
    }

    // ── Coordinate helpers ────────────────────────────────────────────
    function canvasXY(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    }

    function hitMode(x, y) {
        if (!crop.w || !crop.h) return 'new';
        const hit = (px, py) => Math.hypot(x - px, y - py) <= HANDLE_R * 2.5;
        if (hit(crop.x, crop.y)) return 'tl';
        if (hit(crop.x + crop.w, crop.y)) return 'tr';
        if (hit(crop.x, crop.y + crop.h)) return 'bl';
        if (hit(crop.x + crop.w, crop.y + crop.h)) return 'br';
        // A selection covering the whole image cannot move, so dragging inside it draws a new one
        const isFull = crop.x <= 0 && crop.y <= 0 && crop.w >= canvas.width && crop.h >= canvas.height;
        if (!isFull && x >= crop.x && x <= crop.x + crop.w && y >= crop.y && y <= crop.y + crop.h) return 'move';
        return 'new';
    }

    const CURSORS = { new: 'crosshair', move: 'move', tl: 'nw-resize', tr: 'ne-resize', bl: 'sw-resize', br: 'se-resize' };

    // ── Mouse events ──────────────────────────────────────────────────
    canvas.addEventListener('mousemove', e => {
        const { x, y } = canvasXY(e);
        if (!isDragging) {
            canvas.style.cursor = CURSORS[hitMode(x, y)] || 'crosshair';
            return;
        }

        if (dragMode === 'new') {
            if (aspectRatio) {
                crop = ratioRect(dragStart.x, dragStart.y, x, y);
            } else {
                const dx = x - dragStart.x;
                const dy = y - dragStart.y;
                crop = {
                    x: dx >= 0 ? dragStart.x : dragStart.x + dx,
                    y: dy >= 0 ? dragStart.y : dragStart.y + dy,
                    w: Math.abs(dx),
                    h: Math.abs(dy),
                };
                clampCrop();
            }
        } else if (dragMode === 'move') {
            const dx = x - dragStart.x;
            const dy = y - dragStart.y;
            crop.x = Math.max(0, Math.min(canvas.width - crop.w, cropAtDragStart.x + dx));
            crop.y = Math.max(0, Math.min(canvas.height - crop.h, cropAtDragStart.y + dy));
        } else if (aspectRatio) {
            // Resize from a corner with the ratio locked, anchored on the opposite corner
            const s = cropAtDragStart;
            const ax = dragMode === 'tl' || dragMode === 'bl' ? s.x + s.w : s.x;
            const ay = dragMode === 'tl' || dragMode === 'tr' ? s.y + s.h : s.y;
            crop = ratioRect(ax, ay, x, y, 10);
        } else {
            const c = { ...cropAtDragStart };
            if (dragMode === 'br') {
                c.w = Math.max(10, Math.min(canvas.width - c.x, x - c.x));
                c.h = Math.max(10, Math.min(canvas.height - c.y, y - c.y));
            } else if (dragMode === 'tl') {
                const nx = Math.min(x, c.x + c.w - 10);
                const ny = Math.min(y, c.y + c.h - 10);
                c.w = c.x + c.w - Math.max(0, nx);
                c.h = c.y + c.h - Math.max(0, ny);
                c.x = Math.max(0, nx);
                c.y = Math.max(0, ny);
            } else if (dragMode === 'tr') {
                const ny = Math.min(y, c.y + c.h - 10);
                c.h = c.y + c.h - Math.max(0, ny);
                c.y = Math.max(0, ny);
                c.w = Math.max(10, Math.min(canvas.width - c.x, x - c.x));
            } else if (dragMode === 'bl') {
                const nx = Math.min(x, c.x + c.w - 10);
                c.w = c.x + c.w - Math.max(0, nx);
                c.x = Math.max(0, nx);
                c.h = Math.max(10, Math.min(canvas.height - c.y, y - c.y));
            }
            crop = c;
        }

        draw();
        updateDims();
    });

    canvas.addEventListener('mousedown', e => {
        const { x, y } = canvasXY(e);
        dragMode = hitMode(x, y);
        dragStart = { x, y };
        cropAtDragStart = { ...crop };
        isDragging = true;
        if (dragMode === 'new') {
            crop = { x, y, w: 0, h: 0 };
        }
    });

    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; });

    document.addEventListener('keydown', e => {
        // Only while the cropper is on screen, and never steal arrows from text fields
        if (editorEl.classList.contains('hidden') || editorEl.offsetParent === null) return;
        if (e.target.closest('input, textarea, select, [contenteditable]')) return;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft')  crop.x = Math.max(0, crop.x - step);
        if (e.key === 'ArrowRight') crop.x = Math.min(canvas.width - crop.w, crop.x + step);
        if (e.key === 'ArrowUp')    crop.y = Math.max(0, crop.y - step);
        if (e.key === 'ArrowDown')  crop.y = Math.min(canvas.height - crop.h, crop.y + step);
        draw();
        updateDims();
    });

    // Largest rect with the locked ratio from anchor (ax, ay) towards the pointer that still
    // fits inside the canvas. Shrinks both sides together, so the ratio survives the edges.
    function ratioRect(ax, ay, px, py, minW = 0) {
        const sx = px >= ax ? 1 : -1;
        const sy = py >= ay ? 1 : -1;
        const maxW = Math.min(sx > 0 ? canvas.width - ax : ax, (sy > 0 ? canvas.height - ay : ay) * aspectRatio);
        let w = Math.max(Math.abs(px - ax), Math.abs(py - ay) * aspectRatio, minW);
        w = Math.min(w, maxW);
        const h = w / aspectRatio;
        return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h };
    }

    function clampCrop() {
        crop.x = Math.max(0, crop.x);
        crop.y = Math.max(0, crop.y);
        crop.w = Math.min(crop.w, canvas.width - crop.x);
        crop.h = Math.min(crop.h, canvas.height - crop.y);
    }

    // ── Ratio buttons ─────────────────────────────────────────────────
    ratioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            ratioBtns.forEach(b => {
                b.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
                b.classList.add('bg-slate-50', 'text-slate-600', 'border-slate-200');
            });
            btn.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            btn.classList.remove('bg-slate-50', 'text-slate-600', 'border-slate-200');
            const r = btn.dataset.ratio;
            if (r === 'free') {
                aspectRatio = null;
            } else {
                const [w, h] = r.split(':').map(Number);
                aspectRatio = w / h;
                // Largest rect of the new ratio that fits inside the current crop, centred in it
                if (crop.w > 0 && crop.h > 0) {
                    const w = Math.min(crop.w, crop.h * aspectRatio);
                    const h = w / aspectRatio;
                    crop = { x: crop.x + (crop.w - w) / 2, y: crop.y + (crop.h - h) / 2, w, h };
                    draw();
                    updateDims();
                }
            }
        });
    });

    resetBtn.addEventListener('click', () => {
        crop = { x: 0, y: 0, w: canvas.width, h: canvas.height };
        draw();
        updateDims();
    });

    newImageBtn.addEventListener('click', () => {
        sourceFile = null;
        sourceImg = null;
        crop = { x: 0, y: 0, w: 0, h: 0 };
        editorEl.classList.add('hidden');
        drop.classList.remove('hidden');
        input.value = '';
    });

    // ── Download ──────────────────────────────────────────────────────
    downloadBtn.addEventListener('click', async () => {
        if (!sourceFile) return;
        const { left: imgX, top: imgY, width: imgW, height: imgH } = toImageRect();
        if (crop.w < 1 || crop.h < 1 || imgW < 1 || imgH < 1) {
            showToast('Select an area to crop first (drag on the image), or use Select All.', 'warning');
            return;
        }

        const outName = sourceFile.name.replace(/(\.[^.]+)$/, '_cropped$1');

        if (!ipcRenderer) {
            const out = document.createElement('canvas');
            out.width = imgW; out.height = imgH;
            out.getContext('2d').drawImage(sourceImg, imgX, imgY, imgW, imgH, 0, 0, imgW, imgH);
            // keep the source format where the browser can encode it, PNG otherwise
            const type = ['image/jpeg', 'image/webp'].includes(sourceFile.type) ? sourceFile.type : 'image/png';
            out.toBlob(blob => {
                if (!blob) { showToast('Crop failed: the browser could not export the image.', 'error'); return; }
                const ext = blob.type === 'image/jpeg' ? '.jpg' : blob.type === 'image/webp' ? '.webp' : '.png';
                downloadBlob(blob, outName.replace(/(\.[^.]+)?$/, ext));
            }, type, 0.92);
            return;
        }

        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Cropping…';
        try {
            const fileBuffer = await sourceFile.arrayBuffer();
            const result = await ipcRenderer.invoke('crop-image', { fileData: fileBuffer, left: imgX, top: imgY, width: imgW, height: imgH });
            await downloadBlob(new Blob([result]), outName);
        } catch (err) {
            console.error('Crop failed:', err);
            showToast('Crop failed: ' + (err.message || err), 'error');
        } finally {
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download Crop';
        }
    });
}
