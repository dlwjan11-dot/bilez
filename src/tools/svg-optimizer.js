import { optimize } from 'svgo/browser';
import { showToast } from '../toast.js';
import { downloadZip, makeUniqueName } from '../download.js';

export function initSvgOptimizer() {
    const drop = document.getElementById('svg-drop');
    const input = document.getElementById('svg-input');
    const resultSection = document.getElementById('svg-results');
    const listEl = document.getElementById('svg-list');
    const statusEl = document.getElementById('svg-status');
    const dlAllBtn = document.getElementById('svg-download-all');

    if (!drop) return;

    let optimizedFiles = [];

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('border-blue-400', 'bg-blue-50'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('border-blue-400', 'bg-blue-50'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('border-blue-400', 'bg-blue-50');
        handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', e => { handleFiles(e.target.files); input.value = ''; });

    async function handleFiles(fileList) {
        const all = Array.from(fileList);
        const svgFiles = all.filter(f =>
            f.name.toLowerCase().endsWith('.svg') || f.type === 'image/svg+xml'
        );
        all.filter(f => !svgFiles.includes(f))
            .forEach(f => showToast(`Skipped ${f.name}: only SVG files can be optimized.`, 'warning'));
        if (!svgFiles.length) return;

        resultSection.classList.remove('hidden');

        for (const file of svgFiles) {
            const text = await file.text();
            const origSize = new Blob([text]).size;

            const itemEl = document.createElement('div');
            itemEl.className = "flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200";
            itemEl.innerHTML = `
                <div class="flex-1 min-w-0 mr-4">
                    <p class="text-sm font-bold text-slate-700 truncate">${file.name}</p>
                    <p class="text-xs text-slate-400 animate-pulse">Optimizing...</p>
                </div>
            `;
            listEl.appendChild(itemEl);

            try {
                const result = optimize(text, {
                    multipass: true,
                    plugins: ['preset-default']
                });

                const optSize = new Blob([result.data]).size;
                const saving = ((origSize - optSize) / origSize * 100).toFixed(0);
                const savedKb = ((origSize - optSize) / 1024).toFixed(1);

                optimizedFiles.push({ name: file.name, data: result.data });

                const dlUrl = URL.createObjectURL(new Blob([result.data], { type: 'image/svg+xml' }));
                const savingsColor = Number(saving) > 30 ? 'text-green-600' : 'text-blue-600';

                itemEl.innerHTML = `
                    <div class="flex-1 min-w-0 mr-4">
                        <p class="text-sm font-bold text-slate-700 truncate">${file.name}</p>
                        <p class="text-xs text-slate-400">${(origSize / 1024).toFixed(1)} KB → ${(optSize / 1024).toFixed(1)} KB <span class="text-slate-300 ml-1">(saved ${savedKb} KB)</span></p>
                    </div>
                    <span class="text-sm font-black ${savingsColor} shrink-0 mr-4">-${saving}%</span>
                    <a href="${dlUrl}" download="${file.name}" class="text-[11px] font-bold text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded transition-colors whitespace-nowrap">Save</a>
                `;
            } catch (err) {
                itemEl.innerHTML = `
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-slate-700 truncate">${file.name}</p>
                        <p class="text-xs text-red-500">Failed: ${err.message}</p>
                    </div>
                `;
            }
        }

        statusEl.textContent = `${optimizedFiles.length} file${optimizedFiles.length !== 1 ? 's' : ''} optimized.`;
        if (optimizedFiles.length > 1) dlAllBtn.classList.remove('hidden');
    }

    const clearBtn = document.getElementById('svg-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            optimizedFiles = [];
            listEl.querySelectorAll('a[href^="blob:"]').forEach(a => URL.revokeObjectURL(a.href));
            listEl.innerHTML = '';
            statusEl.textContent = '';
            dlAllBtn.classList.add('hidden');
            resultSection.classList.add('hidden');
        });
    }

    dlAllBtn.addEventListener('click', async () => {
        dlAllBtn.textContent = "Zipping...";
        dlAllBtn.disabled = true;

        const used = new Set();
        const files = optimizedFiles.map(f => ({ name: makeUniqueName(f.name, used), data: f.data }));
        await downloadZip(files, 'optimized_svgs.zip');

        dlAllBtn.textContent = "Download All as ZIP";
        dlAllBtn.disabled = false;
    });
}
