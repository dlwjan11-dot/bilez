import { downloadBlob } from '../download.js';

export function initBase64() {
    const encodeTab = document.getElementById('b64-tab-encode');
    const decodeTab = document.getElementById('b64-tab-decode');
    const encodePanel = document.getElementById('b64-encode-panel');
    const decodePanel = document.getElementById('b64-decode-panel');

    const encodeInput = document.getElementById('b64-encode-input');
    const encodeOutput = document.getElementById('b64-encode-output');
    const encodeBtn = document.getElementById('b64-encode-btn');
    const encodeCopyBtn = document.getElementById('b64-encode-copy');
    const encodeClearBtn = document.getElementById('b64-encode-clear');
    const encodeFileDrop = document.getElementById('b64-file-drop');
    const encodeFileInput = document.getElementById('b64-file-input');

    const decodeInput = document.getElementById('b64-decode-input');
    const decodeOutput = document.getElementById('b64-decode-output');
    const decodeBtn = document.getElementById('b64-decode-btn');
    const decodeCopyBtn = document.getElementById('b64-decode-copy');
    const decodeClearBtn = document.getElementById('b64-decode-clear');
    const decodeDownloadBtn = document.getElementById('b64-decode-download');
    const decodeError = document.getElementById('b64-decode-error');

    if (!encodeTab) return;

    let decodeBlob = null;

    function switchTab(tab) {
        const isEncode = tab === 'encode';
        [encodeTab, decodeTab].forEach(btn => {
            btn.classList.toggle('bg-blue-600', btn.dataset.tab === tab);
            btn.classList.toggle('text-white', btn.dataset.tab === tab);
            btn.classList.toggle('border-blue-600', btn.dataset.tab === tab);
            btn.classList.toggle('bg-slate-50', btn.dataset.tab !== tab);
            btn.classList.toggle('text-slate-600', btn.dataset.tab !== tab);
            btn.classList.toggle('border-slate-200', btn.dataset.tab !== tab);
        });
        encodePanel.classList.toggle('hidden', !isEncode);
        decodePanel.classList.toggle('hidden', isEncode);
    }

    encodeTab.addEventListener('click', () => switchTab('encode'));
    decodeTab.addEventListener('click', () => switchTab('decode'));

    // ── Encode: text ──────────────────────────────────────────────────
    encodeBtn.addEventListener('click', () => {
        const text = encodeInput.value;
        if (!text) return;
        encodeOutput.value = btoa(unescape(encodeURIComponent(text)));
    });

    encodeCopyBtn.addEventListener('click', () => {
        if (!encodeOutput.value) return;
        navigator.clipboard.writeText(encodeOutput.value);
        encodeCopyBtn.textContent = 'Copied!';
        setTimeout(() => encodeCopyBtn.textContent = 'Copy', 1500);
    });

    encodeClearBtn.addEventListener('click', () => {
        encodeInput.value = '';
        encodeOutput.value = '';
    });

    encodeInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); encodeBtn.click(); }
    });

    // ── Encode: file drop ─────────────────────────────────────────────
    encodeFileDrop.addEventListener('click', () => encodeFileInput.click());
    encodeFileDrop.addEventListener('dragover', e => { e.preventDefault(); encodeFileDrop.classList.add('border-blue-400', 'bg-blue-50'); });
    encodeFileDrop.addEventListener('dragleave', () => encodeFileDrop.classList.remove('border-blue-400', 'bg-blue-50'));
    encodeFileDrop.addEventListener('drop', e => {
        e.preventDefault();
        encodeFileDrop.classList.remove('border-blue-400', 'bg-blue-50');
        handleEncodeFile(e.dataTransfer.files[0]);
    });
    encodeFileInput.addEventListener('change', e => { handleEncodeFile(e.target.files[0]); encodeFileInput.value = ''; });

    function handleEncodeFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            encodeOutput.value = reader.result; // already a data URL — full base64
            encodeInput.value = `[File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`;
        };
        reader.readAsDataURL(file);
    }

    // ── Decode ────────────────────────────────────────────────────────
    decodeBtn.addEventListener('click', () => {
        const raw = decodeInput.value.trim();
        if (!raw) return;
        decodeError.classList.add('hidden');
        decodeDownloadBtn.classList.add('hidden');
        decodeBlob = null;

        try {
            // Handle data URLs
            const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/s);
            if (dataUrlMatch) {
                const mime = dataUrlMatch[1];
                const b64 = dataUrlMatch[2];
                const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                decodeBlob = new Blob([bytes], { type: mime });
                decodeOutput.value = `[Binary file: ${mime}, ${(bytes.length / 1024).toFixed(1)} KB]\nClick "Download File" to save it.`;
                decodeDownloadBtn.classList.remove('hidden');
                return;
            }

            const normalized = raw.replace(/\s+/g, '');
            const bytes = Uint8Array.from(atob(normalized), c => c.charCodeAt(0));
            const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
            decodeOutput.value = text;
        } catch (e) {
            decodeError.textContent = `Decode failed: ${e.message}`;
            decodeError.classList.remove('hidden');
            decodeOutput.value = '';
        }
    });

    decodeCopyBtn.addEventListener('click', () => {
        if (!decodeOutput.value) return;
        navigator.clipboard.writeText(decodeOutput.value);
        decodeCopyBtn.textContent = 'Copied!';
        setTimeout(() => decodeCopyBtn.textContent = 'Copy Text', 1500);
    });

    decodeClearBtn.addEventListener('click', () => {
        decodeInput.value = '';
        decodeOutput.value = '';
        decodeBlob = null;
        decodeDownloadBtn.classList.add('hidden');
        decodeError.classList.add('hidden');
    });

    decodeDownloadBtn.addEventListener('click', async () => {
        if (!decodeBlob) return;
        await downloadBlob(decodeBlob, `decoded_file.${decodeBlob.type.split('/')[1] || 'bin'}`);
    });

    decodeInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); decodeBtn.click(); }
    });
}
