import { downloadZip } from '../download.js';

export function initRenamer() {
    const drop = document.getElementById('renamer-drop');
    const optionsPanel = document.getElementById('renamer-options');
    const previewPanel = document.getElementById('renamer-preview-panel');
    const listEl = document.getElementById('renamer-list');
    const dlBtn = document.getElementById('renamer-download');
    const statusEl = document.getElementById('renamer-status');
    const fileCountEl = document.getElementById('renamer-file-count');

    const stripMinCheck = document.getElementById('renamer-strip-min');
    const prefixInp = document.getElementById('renamer-prefix');
    const suffixInp = document.getElementById('renamer-suffix');
    const findInp = document.getElementById('renamer-find');
    const replaceInp = document.getElementById('renamer-replace');
    const sequentialCheck = document.getElementById('renamer-sequential');
    const seqStartInp = document.getElementById('renamer-seq-start');
    const seqPadInp = document.getElementById('renamer-seq-pad');

    if (!drop) return;

    let files = [];

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    drop.appendChild(fileInput);

    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('border-blue-400', 'bg-blue-50'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('border-blue-400', 'bg-blue-50'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('border-blue-400', 'bg-blue-50');
        if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', e => {
        if (e.target.files.length) loadFiles(e.target.files);
        fileInput.value = '';
    });

    function loadFiles(fileList) {
        files = Array.from(fileList);
        fileCountEl.textContent = `${files.length} file${files.length !== 1 ? 's' : ''} loaded`;
        fileCountEl.classList.remove('hidden');
        optionsPanel.classList.remove('hidden');
        previewPanel.classList.remove('hidden');
        updatePreview();
    }

    const optionInputs = [stripMinCheck, prefixInp, suffixInp, findInp, replaceInp, sequentialCheck, seqStartInp, seqPadInp];
    optionInputs.forEach(el => {
        if (!el) return;
        el.addEventListener('input', updatePreview);
        el.addEventListener('change', updatePreview);
    });

    function getSettings() {
        return {
            stripMin: stripMinCheck ? stripMinCheck.checked : false,
            prefix: prefixInp ? prefixInp.value : '',
            suffix: suffixInp ? suffixInp.value : '',
            find: findInp ? findInp.value : '',
            replace: replaceInp ? replaceInp.value : '',
            sequential: sequentialCheck ? sequentialCheck.checked : false,
            seqStart: parseInt(seqStartInp ? seqStartInp.value : '1', 10) || 1,
            seqPad: parseInt(seqPadInp ? seqPadInp.value : '3', 10) || 3,
        };
    }

    function computeNewName(file, idx, settings) {
        const dotIdx = file.name.lastIndexOf('.');
        let base = dotIdx !== -1 ? file.name.slice(0, dotIdx) : file.name;
        const ext = dotIdx !== -1 ? file.name.slice(dotIdx) : '';

        if (settings.stripMin) base = base.replace(/-min$/i, '');
        if (settings.find) base = base.split(settings.find).join(settings.replace || '');
        if (settings.sequential) {
            base = base + '_' + String(settings.seqStart + idx).padStart(settings.seqPad, '0');
        }
        base = (settings.prefix || '') + base + (settings.suffix || '');

        return base + ext;
    }

    function updatePreview() {
        if (!files.length) return;
        const settings = getSettings();
        listEl.innerHTML = '';

        files.forEach((file, idx) => {
            const newName = computeNewName(file, idx, settings);
            const changed = newName !== file.name;

            const div = document.createElement('div');
            div.className = "py-2 px-3 border-b border-slate-100 flex items-center gap-2";
            div.innerHTML = `
                <span class="text-slate-500 text-xs truncate flex-1">${file.name}</span>
                <span class="text-slate-300 shrink-0">→</span>
                <span class="text-xs font-mono truncate flex-1 text-right ${changed ? 'text-blue-600 font-bold' : 'text-slate-400'}">${newName}</span>
            `;
            listEl.appendChild(div);
        });

        statusEl.textContent = `${files.length} file${files.length !== 1 ? 's' : ''} ready.`;
    }

    dlBtn.addEventListener('click', async () => {
        if (!files.length) return;

        dlBtn.textContent = "Zipping...";
        dlBtn.disabled = true;

        const settings = getSettings();
        const zipFiles = await Promise.all(files.map(async (file, idx) => ({
            name: computeNewName(file, idx, settings),
            data: await file.arrayBuffer()
        })));
        await downloadZip(zipFiles, 'renamed_files.zip');

        dlBtn.textContent = "Download ZIP";
        dlBtn.disabled = false;
    });
}
