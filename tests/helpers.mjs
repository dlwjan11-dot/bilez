import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, _electron as electron } from '@playwright/test';
import sharp from 'sharp';
import JSZip from 'jszip';

export { expect };

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
export const OUTPUT = path.join(ROOT, 'tests', 'output');
export const SCREENSHOTS = path.join(ROOT, 'tests', 'screenshots');
export const RESULTS = path.join(ROOT, 'tests', 'results');
export const LOG_FILE = path.join(RESULTS, 'console-log.jsonl');

export const fixture = (name) => path.join(FIXTURES, name);

const MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    svg: 'image/svg+xml', pdf: 'application/pdf', txt: 'text/plain',
};
const mimeOf = (name) => MIME[name.split('.').pop().toLowerCase()] || '';

function slug(testInfo) {
    return testInfo.titlePath.slice(1).join('-')
        .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80);
}

// Launch the real packaged-mode Electron app (main process + dist/index.html).
// Native save dialogs are replaced so every save lands in a per-test folder.
export async function launchApp(outDir) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    const env = { ...process.env };
    delete env.VITE_DEV_SERVER_URL;

    const app = await electron.launch({ args: ['.'], cwd: ROOT, env });
    const logs = { console: [], pageErrors: [], main: [], errorBoxes: [] };

    const proc = app.process();
    const onMain = (chunk) => {
        const text = chunk.toString().trim();
        if (text && !/DevTools listening|disk_cache|cache_util|gpu_disk_cache|^\s*$/.test(text)) logs.main.push(text);
    };
    proc.stdout?.on('data', onMain);
    proc.stderr?.on('data', onMain);

    await app.evaluate(({ app: eApp, dialog, shell }, dir) => {
        globalThis.__errorBoxes = [];
        eApp.setPath('downloads', dir);
        dialog.showSaveDialog = async (...args) => {
            const opts = args.length > 1 ? args[1] : args[0];
            const name = String(opts.defaultPath).split(/[\\/]/).pop();
            return { canceled: false, filePath: `${dir}\\${name}` };
        };
        dialog.showErrorBox = (title, msg) => { globalThis.__errorBoxes.push(`${title}: ${msg}`); };
        shell.showItemInFolder = () => {};
    }, outDir);

    const page = await app.firstWindow();
    page.on('console', (msg) => {
        if (['error', 'warning'].includes(msg.type())) logs.console.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => logs.pageErrors.push(String(err && err.stack || err)));
    await page.waitForLoadState('domcontentloaded');
    // typescale renders on boot, so non-empty CSS means main.js finished initialising
    await expect(page.locator('#ts-css')).not.toBeEmpty({ timeout: 15000 });

    return {
        app, page, outDir, logs,
        out: (name) => path.join(outDir, name),
        async errorBoxes() { return app.evaluate(() => globalThis.__errorBoxes); },
        // Windows clipboard turns \n into \r\n; normalise so comparisons match the page text
        async clipboard() { return (await app.evaluate(({ clipboard }) => clipboard.readText())).replace(/\r\n/g, '\n'); },
        async clearClipboard() { await app.evaluate(({ clipboard }) => clipboard.writeText('')); },
    };
}

export const test = base.extend({
    ctx: async ({}, use, testInfo) => {
        const ctx = await launchApp(path.join(OUTPUT, slug(testInfo)));
        await use(ctx);

        ctx.logs.errorBoxes = await ctx.errorBoxes().catch(() => []);
        const entry = { test: testInfo.titlePath.slice(1).join(' > '), status: testInfo.status, ...ctx.logs };
        fs.mkdirSync(RESULTS, { recursive: true });
        fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
        for (const [type, list] of Object.entries(ctx.logs)) {
            if (list.length) testInfo.annotations.push({ type, description: list.join('\n') });
        }
        if (testInfo.status !== testInfo.expectedStatus) {
            await ctx.page.screenshot({ path: testInfo.outputPath('failure.png'), fullPage: true }).catch(() => {});
        }
        await Promise.race([ctx.app.close(), new Promise(r => setTimeout(r, 5000))]);
        try { ctx.app.process().kill(); } catch {}
    },
});

export async function openTool(page, tab) {
    await page.click(`#nav-tabs [data-tab="${tab}"]`);
    await expect(page.locator(`#tool-${tab}`)).toBeVisible();
}

// Real "click to browse" flow: click the drop zone and answer the native file chooser.
export async function uploadViaClick(page, clickSelector, names) {
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await page.click(clickSelector);
    const chooser = await chooserPromise;
    await chooser.setFiles(names.map(fixture));
    return chooser;
}

// Drag & drop of real files: build File objects in the page and fire the DnD events.
export async function dropFiles(page, selector, names) {
    const files = names.map((name) => {
        const realName = typeof name === 'string' ? name : name.as;
        const src = typeof name === 'string' ? name : name.file;
        return { name: realName, type: mimeOf(realName), b64: fs.readFileSync(fixture(src)).toString('base64') };
    });
    await page.evaluate(({ selector, files }) => {
        const dt = new DataTransfer();
        for (const f of files) {
            const bin = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
            dt.items.add(new File([bin], f.name, { type: f.type }));
        }
        const el = document.querySelector(selector);
        for (const type of ['dragenter', 'dragover', 'drop']) {
            el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        }
    }, { selector, files });
}

export async function setRange(locator, value) {
    await locator.evaluate((el, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
}

// Wait for a saved file to appear and stop growing. Returns its path or null on timeout.
export async function waitForFile(filePath, timeout = 15000) {
    const end = Date.now() + timeout;
    let lastSize = -1;
    while (Date.now() < end) {
        if (fs.existsSync(filePath)) {
            const size = fs.statSync(filePath).size;
            if (size === lastSize) return filePath;
            lastSize = size;
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    return fs.existsSync(filePath) ? filePath : null;
}

export async function expectSaved(filePath, timeout) {
    const found = await waitForFile(filePath, timeout);
    expect(found, `expected file to be saved: ${path.basename(filePath)}`).not.toBeNull();
    return found;
}

export async function readZip(filePath) {
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const entries = {};
    for (const [name, entry] of Object.entries(zip.files)) {
        if (!entry.dir) entries[name] = await entry.async('nodebuffer');
    }
    return entries;
}

export const meta = (input) => sharp(input).metadata();

export async function shot(page, name) {
    fs.mkdirSync(SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
}

export async function toastText(page) {
    // the container only exists once a toast has been shown; don't wait for it
    const el = page.locator('#toast-container');
    return (await el.count()) ? ((await el.textContent()) || '') : '';
}

export function newErrors(ctx, sinceCounts) {
    return {
        console: ctx.logs.console.slice(sinceCounts.console).filter(l => l.startsWith('[error]')),
        pageErrors: ctx.logs.pageErrors.slice(sinceCounts.pageErrors),
    };
}

export function logMark(ctx) {
    return { console: ctx.logs.console.length, pageErrors: ctx.logs.pageErrors.length };
}

// navigator.clipboard.writeText is async, so poll until the copy lands.
export async function expectClipboard(ctx, expected) {
    await expect.poll(() => ctx.clipboard(), { message: 'clipboard content', timeout: 3000 }).toBe(expected);
}
