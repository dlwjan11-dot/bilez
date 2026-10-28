// File writes and ZIP creation go through the main process via IPC.
// This avoids Vite's Buffer polyfill (JSZip uses Buffer, Vite injects a broken polyfill).
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
    }
    // No browser fallback needed — this app only runs in Electron
}
