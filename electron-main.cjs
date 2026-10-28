const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const JSZip = require('jszip');

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    title: "Abdul Tools",
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Save downloaded files (ZIP, cropped images, etc.) directly to Downloads folder
  win.webContents.session.on('will-download', (event, item) => {
    const savePath = path.join(app.getPath('downloads'), item.getFilename());
    item.setSavePath(savePath);
    item.once('done', (event, state) => {
      if (state !== 'completed') {
        console.error('Download failed:', state);
      }
    });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('web-contents-created', (e, contents) => {
  contents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      contents.openDevTools();
      event.preventDefault();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- NEW NATIVE BACKEND BRIDGE (MEMORY BUFFER) ---
ipcMain.handle('process-image-sharp', async (event, config) => {
  const { fileData, targetW, targetH, quality, format, allowUpscale } = config;

  try {
    // 1. Convert the raw memory sent from the frontend into a native Buffer
    const inputBuffer = Buffer.from(fileData);
    let engine = sharp(inputBuffer);

    // 2. Resize if needed
    if (targetW || targetH) {
      engine = engine.resize({
        width: targetW ? Math.round(targetW) : undefined,
        height: targetH ? Math.round(targetH) : undefined,
        fit: 'inside',
        withoutEnlargement: !allowUpscale
      });
    }

    // 3. Set Format & Quality
    if (format === 'webp') {
      engine = engine.webp({ quality: Math.round(quality * 100) });
    } else if (format === 'jpeg' || format === 'jpg') {
      engine = engine.jpeg({ quality: Math.round(quality * 100) });
    } else if (format === 'png') {
      engine = engine.png({ quality: Math.round(quality * 100) });
    } else if (format === 'jxl') {
      engine = engine.jxl({ quality: Math.round(quality * 100) });
    }

    // 4. THE MAGIC BULLET: Keep all Alt Text, EXIF, and XMP data
    engine = engine.withMetadata();

    // 5. Return the new image memory back to the frontend
    const outputBuffer = await engine.toBuffer();
    return outputBuffer;

  } catch (err) {
    console.error("Backend Processing Error:", err);
    throw err;
  }
});

ipcMain.handle('crop-image', async (event, config) => {
  const { fileData, left, top, width, height } = config;
  try {
    const inputBuffer = Buffer.from(fileData);
    const outputBuffer = await sharp(inputBuffer)
      .extract({ left, top, width, height })
      .withMetadata()
      .toBuffer();
    return outputBuffer;
  } catch (err) {
    console.error("Crop Error:", err);
    throw err;
  }
});

ipcMain.handle('create-zip', async (event, { files, filename }) => {
  try {
    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.name, Buffer.from(f.data));
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), filename),
      buttonLabel: 'Save'
    });
    if (!filePath) return null;
    fs.writeFileSync(filePath, buf);
    shell.showItemInFolder(filePath);
    return filePath;
  } catch (err) {
    dialog.showErrorBox('ZIP Error', err.message || String(err));
    throw err;
  }
});

ipcMain.handle('save-file', async (event, { filename, data }) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), filename),
      buttonLabel: 'Save'
    });
    if (!filePath) return null;
    fs.writeFileSync(filePath, Buffer.from(data));
    shell.showItemInFolder(filePath);
    return filePath;
  } catch (err) {
    dialog.showErrorBox('Save Error', err.message || String(err));
    throw err;
  }
});