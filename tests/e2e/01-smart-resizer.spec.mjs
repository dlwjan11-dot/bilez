import fs from 'node:fs';
import {
    test, expect, openTool, uploadViaClick, dropFiles, setRange, expectSaved, waitForFile,
    readZip, meta, shot, toastText, fixture, logMark, newErrors,
} from '../helpers.mjs';

// Wait until every card has finished (or failed) processing.
async function settle(page, timeout = 20000) {
    await page.waitForTimeout(450); // reprocess is debounced by 200-300ms
    await page.waitForFunction(() => {
        const cards = [...document.querySelectorAll('[id^="smart-card-"]')];
        return cards.every(c => {
            const idx = c.id.split('-').pop();
            const loader = document.getElementById(`smart-loader-${idx}`);
            const dims = document.getElementById(`smart-dims-${idx}`);
            return loader.classList.contains('hidden') && dims.textContent !== 'Calculating...';
        });
    }, null, { timeout });
}

const dims = (page, idx) => page.locator(`#smart-dims-${idx}`).textContent();

async function saveCard(ctx, idx, name) {
    fs.rmSync(ctx.out(name), { force: true });
    await ctx.page.click(`#smart-dl-${idx}`);
    return expectSaved(ctx.out(name));
}

test.describe('Smart Resizer', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'smart'); });

    test('single upload via click: auto 1920px + WebP, then save', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#smart-drop', ['large.jpg']);
        await settle(page);
        await expect(page.locator('#smart-counter')).toHaveText(/1 image/);
        expect.soft(await page.locator('#smart-counter').textContent(), 'singular wording').toBe('1 image loaded');
        expect(await dims(page, 0)).toBe('4000x3000 → 1920x1440');
        await expect(page.locator('#smart-processed-count')).toHaveText('1');

        const saved = await saveCard(ctx, 0, 'large-min.webp');
        const m = await meta(saved);
        expect([m.format, m.width, m.height]).toEqual(['webp', 1920, 1440]);
        expect(fs.statSync(saved).size).toBeLessThan(fs.statSync(fixture('large.jpg')).size);
        await shot(page, '01-smart-resizer');
    });

    test('multi upload via drag & drop, Download All as ZIP', async ({ ctx }) => {
        const { page } = ctx;
        const names = ['small.jpg', 'portrait.png', 'landscape.webp', 'صورة تجربة.jpg', 'my photo-min.jpg'];
        await dropFiles(page, '#smart-drop', names);
        await settle(page);
        await expect(page.locator('#smart-counter')).toHaveText('5 images loaded');
        expect.soft(await dims(page, 0)).toBe('200x150 → 200x150');
        expect.soft(await dims(page, 1)).toBe('1080x1920 → 1080x1920');
        expect.soft(await dims(page, 2)).toBe('2560x1440 → 1920x1080');
        expect.soft(await dims(page, 3)).toBe('640x480 → 640x480');

        await page.click('#smart-download-all');
        const zipPath = await expectSaved(ctx.out('processed_images.zip'));
        const entries = await readZip(zipPath);
        expect(Object.keys(entries).sort()).toEqual(
            ['landscape-min.webp', 'my photo-min.webp', 'portrait-min.webp', 'small-min.webp', 'صورة تجربة-min.webp'].sort());
        const land = await meta(entries['landscape-min.webp']);
        expect([land.format, land.width, land.height]).toEqual(['webp', 1920, 1080]);
        await expect(page.locator('#smart-download-all')).toContainText('Download All as ZIP');
    });

    test('resize strategies, custom size and presets', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#smart-drop', ['large.jpg', 'portrait.png']);
        await settle(page);

        await page.click('.smart-mode-btn[data-mode="landscape"]'); await settle(page);
        expect.soft(await dims(page, 0), 'landscape: large').toBe('4000x3000 → 1920x1440');
        await page.click('.smart-mode-btn[data-mode="portrait"]'); await settle(page);
        expect.soft(await dims(page, 0), 'portrait: large').toBe('4000x3000 → 2560x1920');
        await page.click('.smart-mode-btn[data-mode="none"]'); await settle(page);
        expect.soft(await dims(page, 0), 'no resize').toBe('4000x3000 → 4000x3000');

        await page.click('#smart-toggle-manual');
        await expect(page.locator('#smart-manual-inputs')).not.toHaveClass(/pointer-events-none/);
        await page.fill('#smart-w', '800'); await page.press('#smart-w', 'Tab'); await settle(page);
        expect.soft(await dims(page, 0), 'custom width 800').toBe('4000x3000 → 800x600');

        await page.click('.smart-preset-btn[data-width="400"]'); await settle(page);
        expect.soft(await page.inputValue('#smart-w')).toBe('400');
        expect.soft(await page.inputValue('#smart-h')).toBe('300');
        expect.soft(await dims(page, 0), 'preset 400x300 on 4:3 image').toBe('4000x3000 → 400x300');
        expect.soft(await dims(page, 1), 'preset "Callouts 400×300" on a portrait image should give 400×300').toBe('1080x1920 → 400x300');

        await page.click('.smart-preset-btn[data-width="1920"]'); await settle(page);
        expect.soft(await dims(page, 0), 'preset "Subpage Banner 1920×600" should give 1920×600').toBe('4000x3000 → 1920x600');

        await page.click('.smart-preset-btn[data-width="100"]'); await settle(page);
        expect.soft(await dims(page, 0), 'tall preset 100×700 on a landscape image is centre-cropped').toBe('4000x3000 → 100x700');
        const m = await meta(await saveCard(ctx, 0, 'large-min.webp'));
        expect([m.width, m.height], 'saved file is exactly the preset size').toEqual([100, 700]);

        await page.click('.smart-mode-btn[data-mode="auto"]'); await settle(page);
        await expect(page.locator('#smart-manual-inputs')).toHaveClass(/pointer-events-none/);
    });

    test('global and per-image quality sliders change output size', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#smart-drop', ['large.jpg']);
        await settle(page);
        const hi = fs.statSync(await saveCard(ctx, 0, 'large-min.webp')).size;

        await setRange(page.locator('#smart-quality'), 0.3);
        await expect(page.locator('#smart-q-val')).toHaveText('30%');
        await settle(page);
        await expect(page.locator('#smart-item-q-val-0')).toHaveText('30%');
        const lo = fs.statSync(await saveCard(ctx, 0, 'large-min.webp')).size;
        expect(lo, 'lower quality → smaller file').toBeLessThan(hi);

        await setRange(page.locator('#smart-item-q-0'), 1);
        await expect(page.locator('#smart-item-q-val-0')).toHaveText('100%');
        await settle(page);
        const max = fs.statSync(await saveCard(ctx, 0, 'large-min.webp')).size;
        expect(max, 'per-image 100% → bigger than 30%').toBeGreaterThan(lo);
    });

    test('output formats: JPG, Original (PNG/WebP); no JXL', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#smart-drop', ['portrait.png', 'landscape.webp']);
        await settle(page);

        await page.check('input[name="smart-fmt"][value="jpeg"]'); await settle(page);
        expect((await meta(await saveCard(ctx, 0, 'portrait-min.jpg'))).format).toBe('jpeg');

        await page.check('input[name="smart-fmt"][value="keep"]'); await settle(page);
        expect((await meta(await saveCard(ctx, 0, 'portrait-min.png'))).format).toBe('png');
        expect((await meta(await saveCard(ctx, 1, 'landscape-min.webp'))).format).toBe('webp');

        // The bundled sharp build cannot encode JXL, so the option was removed
        await expect(page.locator('input[name="smart-fmt"][value="jxl"]')).toHaveCount(0);
        expect(await page.locator('input[name="smart-fmt"]').evaluateAll(els => els.map(e => e.value))).toEqual(['webp', 'jpeg', 'keep']);
    });

    test('checkboxes: suffix, upscale, bypass', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#smart-drop', ['small.jpg']);
        await settle(page);

        await page.uncheck('#smart-suffix-min'); await settle(page);
        await saveCard(ctx, 0, 'small.webp');

        await page.check('#smart-upscale'); await settle(page);
        expect.soft(await dims(page, 0), 'upscale small image to 1920').toBe('200x150 → 1920x1440');

        await page.check('#smart-bypass'); await settle(page);
        await expect(page.locator(`#smart-dims-0`)).toHaveText('Original Size (Bypassed)');
        const bypassed = await saveCard(ctx, 0, 'small.jpg');
        expect(fs.readFileSync(bypassed).equals(fs.readFileSync(fixture('small.jpg'))), 'bypass keeps bytes').toBe(true);

        await page.uncheck('#smart-bypass'); await settle(page);
        expect(await dims(page, 0)).toContain('→');
    });

    test('export multiple widths', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#smart-drop', ['large.jpg']);
        await settle(page);
        expect.soft(await page.locator('#smart-sizes-row').isVisible(), 'widths row should be hidden until "Export multiple widths" is checked').toBe(false);
        await page.check('#smart-multi-size');
        await page.click('#smart-download-all');
        const entries = await readZip(await expectSaved(ctx.out('processed_images_multi.zip'), 30000));
        expect(Object.keys(entries).sort()).toEqual(['large_1280w.webp', 'large_1920w.webp', 'large_400w.webp', 'large_800w.webp']);
        expect((await meta(entries['large_800w.webp'])).width).toBe(800);

        await page.fill('#smart-sizes', 'abc, -5');
        await page.click('#smart-download-all');
        await expect(page.locator('#toast-container')).toContainText('at least one width');
    });

    test('25 image limit', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#smart-drop', Array(30).fill('small.jpg'));
        await expect(page.locator('#smart-counter')).toHaveText('25 images loaded');
        expect(await toastText(page)).toContain('Only adding the first 25');
        await settle(page, 60000);
        await page.click('#smart-reset');

        await page.uncheck('#smart-limit-25');
        await dropFiles(page, '#smart-drop', Array(30).fill('small.jpg'));
        await expect(page.locator('#smart-counter')).toHaveText('30 images loaded');
        await settle(page, 60000);
    });

    test('remove a card, clear all, re-upload', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#smart-drop', ['small.jpg', 'portrait.png']);
        await settle(page);
        await page.click('#smart-remove-0');
        await expect(page.locator('#smart-counter')).toHaveText(/1 image/);

        const mark = logMark(ctx);
        await setRange(page.locator('#smart-quality'), 0.5);
        await settle(page);
        expect.soft(newErrors(ctx, mark).console, 'changing settings after removing a card should not log errors').toEqual([]);

        await page.click('#smart-reset');
        await expect(page.locator('#smart-empty-state')).toBeVisible();
        await expect(page.locator('#smart-actions')).toBeHidden();

        await uploadViaClick(page, '#smart-drop', ['small.jpg']);
        await settle(page);
        await expect(page.locator('#smart-counter')).toHaveText(/1 image/);
        await saveCard(ctx, 0, 'small-min.webp');
    });

    test('bad inputs: text file, SVG, fake JPG, empty PNG', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#smart-drop', ['notes.txt']);
        await expect(page.locator('#toast-container')).toContainText('Skipped notes.txt');
        await dropFiles(page, '#smart-drop', ['icon-bloated.svg']);
        await expect(page.locator('#toast-container')).toContainText('Skipped icon-bloated.svg');

        await dropFiles(page, '#smart-drop', ['fake-image.jpg', 'empty.png']);
        await settle(page);
        await expect(page.locator('#smart-dims-0')).toHaveText('Error');
        await expect(page.locator('#smart-dims-1')).toHaveText('Error');
        expect.soft(await toastText(page), 'user should be told the file could not be read').toMatch(/could not|failed|invalid|error/i);

        await page.click('#smart-download-all');
        await page.waitForTimeout(1500);
        expect.soft(fs.existsSync(ctx.out('processed_images.zip')), 'should not save an empty ZIP when nothing processed').toBe(false);
        await shot(page, '01-smart-resizer-errors');
    });
});
