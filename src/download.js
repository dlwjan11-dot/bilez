// In Electron, file writes and ZIP creation go through the main process via IPC.
// This avoids Vite's Buffer polyfill (JSZip uses Buffer, Vite injects a broken polyfill).
// In a plain browser (the web version) ZIPs are built with fflate, which needs no Buffer.
import { zipSync } from 'fflate';

let _ipc;
if (window.require) {
    _ipc = window.require('electron').ipcRenderer;
}

function browserSave(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Return `name`, or "name-2.ext", "name-3.ext"… if it is already in `used` (a Set of
// lower-cased names, since Windows paths are case-insensitive). Adds the result to `used`.
// ZIP entries with the same name overwrite each other, so use this for every ZIP.
export function makeUniqueName(name, used) {
    let unique = name;
    if (used.has(unique.toLowerCase())) {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let n = 2;
        while (used.has(`${base}-${n}${ext}`.toLowerCase())) n++;
        unique = `${base}-${n}${ext}`;
    }
    used.add(unique.toLowerCase());
    return unique;
}

// Save a single Blob to disk
export async function downloadBlob(blob, filename) {
    if (_ipc) {
        await _ipc.invoke('save-file', { filename, data: await blob.arrayBuffer() });
    } else {
        browserSave(URL.createObjectURL(blob), filename);
    }
}

// Create and save a ZIP file.
// files: Array of { name: string, data: ArrayBuffer | Uint8Array | string }
// Strings are UTF-8 encoded automatically.
export async function downloadZip(files, filename) {
    if (_ipc) {
        const normalized = files.map(f => ({
            name: f.name,
            data: typeof f.data === 'string'
                ? new TextEncoder().encode(f.data).buffer
                : f.data instanceof Uint8Array ? f.data.buffer : f.data
        }));
        await _ipc.invoke('create-zip', { files: normalized, filename });
        return;
    }
    // Browser: already-compressed formats are stored, everything else is deflated
    const stored = /\.(jpe?g|png|webp|avif|gif|jxl|zip|pdf)$/i;
    const entries = {};
    for (const f of files) {
        const data = typeof f.data === 'string' ? new TextEncoder().encode(f.data)
            : f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
        entries[f.name] = [data, { level: stored.test(f.name) ? 0 : 6 }];
    }
    const bytes = zipSync(entries);
    browserSave(URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })), filename);
}
