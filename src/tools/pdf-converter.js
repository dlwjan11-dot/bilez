import { showToast } from '../toast.js';
import { downloadZip } from '../download.js';

export function initPdfConverter() {
    const drop = document.getElementById('pdf-drop');
    const input = document.getElementById('pdf-input');
    const ui = document.getElementById('pdf-ui-container');
    const list = document.getElementById('pdf-list');
    const btn = document.getElementById('pdf-action-btn');
    const status = document.getElementById('pdf-status');
    const countBadge = document.getElementById('pdf-count');
    const progressEl = document.getElementById('pdf-progress');
    const progressBar = document.getElementById('pdf-progress-bar');
    const progressLabel = document.getElementById('pdf-progress-label');
    const progressPct = document.getElementById('pdf-progress-pct');
    const clearBtn = document.getElementById('pdf-clear');
    let pdfFiles = [];
    const failedFiles = [];
    let session = 0; // bumped by Clear so PDFs still parsing don't reappear afterwards

    if(!drop) return; // Guard clause

    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', e => { handlePdfs(e.target.files); input.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-active'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-active'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag-active'); handlePdfs(e.dataTransfer.files); });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            session++;
            pdfFiles = [];
            failedFiles.length = 0;
            list.innerHTML = '';
            countBadge.textContent = '0';
            status.textContent = '';
            ui.classList.add('hidden');
        });
    }

    async function handlePdfs(fileList) {
        const all = Array.from(fileList);
        const files = all.filter(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
        all.filter(file => !files.includes(file))
            .forEach(file => showToast(`Skipped ${file.name}: only PDF files can be converted.`, 'warning'));
        if (!files.length) return;
        // The drop zone stays visible so more PDFs can be added to the list
        ui.classList.remove('hidden');
        const mySession = session;

        for(const file of files) {
            const id = Math.random().toString(36).substr(2,9);
            const reader = new FileReader();

            reader.onload = async (e) => {
                if (mySession !== session) return;
                const typedarray = new Uint8Array(e.target.result);
                let pdf;
                try {
                    pdf = await window.pdfjsLib.getDocument(typedarray).promise;
                } catch (err) {
                    if (mySession !== session) return;
                    console.error(`Could not open ${file.name}:`, err);
                    failedFiles.push({ file, message: err.message || String(err) });
                    showToast(`Could not open ${file.name}: it is not a valid PDF.`, 'error');
                    updatePdfUi();
                    return;
                }
                if (mySession !== session) return;

                pdfFiles.push({ file, pdf, id });
                
                // 1. Rebuild the UI to create the canvas element
                updatePdfUi(); 
                
                // 2. Safely render the preview into the newly created canvas
                try {
                    const page = await pdf.getPage(1);
                    const vp = page.getViewport({scale: 0.2});
                    const canvas = document.getElementById(`canv-${id}`);
                    
                    if (canvas) {
                        canvas.width = vp.width; 
                        canvas.height = vp.height;
                        await page.render({canvasContext: canvas.getContext('2d'), viewport: vp}).promise;
                    }
                } catch (err) {
                    console.error("Error rendering PDF preview:", err);
                }
            };
            reader.readAsArrayBuffer(file);
            
            // Optimistic UI (Loading state)
            const item = document.createElement('div');
            item.className = "flex items-center bg-slate-50 p-3 rounded border";
            item.id = `loading-${id}`;
            item.innerHTML = `
                <div class="h-16 w-12 bg-slate-200 animate-pulse mr-4 rounded flex items-center justify-center text-[10px] text-slate-400">Loading</div>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm truncate">${file.name}</div>
                    <div class="text-xs text-slate-500">Parsing PDF...</div>
                </div>
            `;
            list.appendChild(item);
        }
    }

    function updatePdfUi() {
        countBadge.textContent = pdfFiles.length;
        list.innerHTML = '';
        pdfFiles.forEach(obj => {
            const item = document.createElement('div');
            item.className = "flex items-center bg-slate-50 p-3 rounded border";
            item.innerHTML = `
                <div class="relative mr-4 shrink-0">
                    <canvas id="canv-${obj.id}" class="bg-white shadow w-12 h-16 rounded object-cover"></canvas>
                    <div class="absolute -top-2 -right-2 bg-red-500 text-white flex items-center justify-center rounded-full font-bold text-[8px] h-4 w-4 shadow">PDF</div>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm truncate">${obj.file.name}</div>
                    <div class="text-xs text-slate-500">${obj.pdf.numPages} Pages</div>
                </div>
            `;
            list.appendChild(item);
        });
        failedFiles.forEach(({ file, message }) => {
            const item = document.createElement('div');
            item.className = "flex items-center bg-red-50 p-3 rounded border border-red-200";
            item.innerHTML = `
                <div class="h-16 w-12 bg-red-100 mr-4 rounded flex items-center justify-center text-[10px] font-bold text-red-500 shrink-0">Error</div>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm truncate"></div>
                    <div class="text-xs text-red-500 truncate"></div>
                </div>
            `;
            item.querySelector('.font-bold.text-sm').textContent = file.name;
            item.querySelector('.text-red-500.truncate').textContent = `Could not open: ${message}`;
            list.appendChild(item);
        });
    }

    btn.addEventListener('click', async () => {
        const totalPages = pdfFiles.reduce((sum, obj) => sum + obj.pdf.numPages, 0);
        if (!totalPages) {
            showToast('Add at least one valid PDF before converting.', 'warning');
            return;
        }

        btn.disabled = true;
        const zipFiles = [];
        let pagesProcessed = 0;

        progressEl.classList.remove('hidden');
        progressBar.style.width = '0%';

        for (let i = 0; i < pdfFiles.length; i++) {
            const obj = pdfFiles[i];

            for (let p = 1; p <= obj.pdf.numPages; p++) {
                progressLabel.textContent = `${obj.file.name} — page ${p} of ${obj.pdf.numPages}`;
                progressPct.textContent = `${Math.round((pagesProcessed / totalPages) * 100)}%`;
                progressBar.style.width = `${(pagesProcessed / totalPages) * 100}%`;

                const page = await obj.pdf.getPage(p);
                const vp = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                canvas.width = vp.width; canvas.height = vp.height;

                await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

                const data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
                const cleanName = obj.file.name.replace(/\.pdf$/i, '');
                const binary = atob(data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                zipFiles.push({ name: `${cleanName}_page_${p}.jpg`, data: bytes.buffer });

                pagesProcessed++;
                progressPct.textContent = `${Math.round((pagesProcessed / totalPages) * 100)}%`;
                progressBar.style.width = `${(pagesProcessed / totalPages) * 100}%`;
            }
        }

        progressLabel.textContent = "Zipping...";
        progressPct.textContent = "100%";
        progressBar.style.width = '100%';

        await downloadZip(zipFiles, 'pdf_converted.zip');

        status.textContent = "Done! Check your downloads.";
        progressEl.classList.add('hidden');
        progressBar.style.width = '0%';

        setTimeout(() => {
            status.textContent = "";
            btn.disabled = false;
        }, 3000);
    });
}