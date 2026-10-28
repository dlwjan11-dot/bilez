import fs from 'node:fs';
import { test, expect, openTool, uploadViaClick, dropFiles, expectSaved, waitForFile, meta, shot, toastText } from '../helpers.mjs';

const dimsLabel = async (page) => {
    const t = await page.locator('#crop-dims').textContent();
    const m = t.match(/(\d+) × (\d+)/);
    return m ? [Number(m[1]), Number(m[2])] : null;
};

// Fractions are relative to the displayed canvas.
async function drag(page, from, to) {
    await page.locator('#crop-canvas').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const box = await page.locator('#crop-canvas').boundingBox();
    const at = ([fx, fy]) => [box.x + box.width * fx, box.y + box.height * fy];
    await page.mouse.move(...at(from));
    await page.mouse.down();
    await page.mouse.move(...at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]), { steps: 4 });
    await page.mouse.move(...at(to), { steps: 4 });
    await page.mouse.up();
}

// Drag the bottom-right handle of a full-image selection to shrink it.
const shrinkFromCorner = (page, to) => drag(page, [0.99, 0.99], to);

test.describe('Image cropper', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'cropper'); });

    test('click upload, full-image crop, corner resize, save', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#crop-drop', ['large.jpg']);
        await expect(page.locator('#crop-editor')).toBeVisible();
        expect.soft(await dimsLabel(page), 'initial selection label on 4000×3000').toEqual([4000, 3000]);

        await page.click('#crop-download');
        let m = await meta(await expectSaved(ctx.out('large_cropped.jpg')));
        expect(m.format).toBe('jpeg');
        expect.soft([m.width, m.height], 'full-image crop keeps every pixel').toEqual([4000, 3000]);

        await shrinkFromCorner(page, [0.5, 0.5]);
        const [w, h] = await dimsLabel(page);
        expect(w, 'corner drag shrinks the selection').toBeLessThan(3500);
        expect(h, 'corner drag shrinks the selection').toBeLessThan(2700);
        fs.rmSync(ctx.out('large_cropped.jpg'), { force: true });
        await page.click('#crop-download');
        await expect(page.locator('#crop-download')).toHaveText('Download Crop');
        m = await meta(await expectSaved(ctx.out('large_cropped.jpg')));
        expect([m.width, m.height], 'saved crop matches the size shown').toEqual([w, h]);
        await shot(page, '07-cropper');
    });

    test('drawing a new selection right after loading', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#crop-drop', ['large.jpg']);
        const before = await dimsLabel(page);
        await drag(page, [0.25, 0.25], [0.75, 0.75]);
        expect.soft(await dimsLabel(page), 'dragging on the image should draw a new selection (full selection only moves)').not.toEqual(before);
    });

    test('aspect ratio buttons keep the ratio', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#crop-drop', ['large.jpg']);
        await page.click('.crop-ratio-btn[data-ratio="1:1"]');
        let [w, h] = await dimsLabel(page);
        expect.soft(w, `1:1 on the full selection (${w}×${h})`).toBe(h);

        await page.click('#crop-reset-selection');
        await page.click('.crop-ratio-btn[data-ratio="free"]');
        await shrinkFromCorner(page, [0.4, 0.4]);
        await page.click('.crop-ratio-btn[data-ratio="16:9"]');
        [w, h] = await dimsLabel(page);
        expect(Math.abs(w / h - 16 / 9), `16:9 applied to a small selection (${w}×${h})`).toBeLessThan(0.02);

        await drag(page, [0.5, 0.55], [0.95, 0.95]);
        [w, h] = await dimsLabel(page);
        expect.soft(Math.abs(w / h - 16 / 9), `16:9 while drawing a selection that reaches the image edge (${w}×${h})`).toBeLessThan(0.02);

        await page.click('#crop-reset-selection');
        await page.click('.crop-ratio-btn[data-ratio="9:16"]');
        [w, h] = await dimsLabel(page);
        expect.soft(Math.abs(w / h - 9 / 16), `9:16 on a landscape image (${w}×${h})`).toBeLessThan(0.02);

        await page.click('#crop-reset-selection');
        await page.click('.crop-ratio-btn[data-ratio="free"]');
        await shrinkFromCorner(page, [0.3, 0.3]);
        await drag(page, [0.4, 0.6], [0.95, 0.75]);
        [w, h] = await dimsLabel(page);
        expect(w / h, 'free drawing').toBeGreaterThan(3);
    });

    test('"Select All" + download on images whose size does not divide evenly', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#crop-drop', ['landscape.webp']);
        await page.click('#crop-reset-selection');
        expect.soft(await dimsLabel(page), 'Select All on 2560×1440').toEqual([2560, 1440]);
        await page.click('#crop-download');
        const saved = await waitForFile(ctx.out('landscape_cropped.webp'), 6000);
        expect.soft(saved, 'Select All crop of 2560×1440 WebP should save').not.toBeNull();
        await expect(page.locator('#crop-download')).toHaveText('Download Crop');
        expect.soft(await toastText(page), 'user told that the crop failed').toMatch(/crop|fail|error/i);

        await page.click('#crop-new-image');
        await expect(page.locator('#crop-drop')).toBeVisible();
        await dropFiles(page, '#crop-drop', ['portrait.png']);
        await expect(page.locator('#crop-editor')).toBeVisible();
        expect.soft(await dimsLabel(page), 'Select All on 1080×1920').toEqual([1080, 1920]);
        await page.click('#crop-download');
        const p = await waitForFile(ctx.out('portrait_cropped.png'), 6000);
        expect.soft(p, 'portrait crop saved').not.toBeNull();
        expect.soft(ctx.logs.main.join('\n'), 'main process crop error').not.toContain('Crop Error');
        await shot(page, '07-cropper-portrait');
    });

    test('keyboard nudge, and arrow keys in other tools afterwards', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#crop-drop', ['large.jpg']);
        await shrinkFromCorner(page, [0.5, 0.5]);
        const before = await dimsLabel(page);
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('ArrowDown');
        expect(await dimsLabel(page), 'nudging moves but does not resize').toEqual(before);

        await openTool(page, 'formatter');
        await page.click('#fmt-input');
        await page.keyboard.type('abc');
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.type('X');
        expect.soft(await page.inputValue('#fmt-input'), 'arrow keys in the Formatter textarea after using the Cropper').toBe('abXc');
    });

    test('bad inputs and edge cases', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#crop-drop', ['notes.txt']);
        await page.waitForTimeout(500);
        await expect(page.locator('#crop-editor')).toBeHidden();
        expect.soft(await toastText(page), 'feedback for a non-image').toMatch(/image/i);

        await dropFiles(page, '#crop-drop', ['empty.png']);
        await page.waitForTimeout(1000);
        await expect(page.locator('#crop-editor')).toBeHidden();
        expect.soft(await toastText(page), 'feedback for an unreadable image').toMatch(/image|read|invalid/i);

        await dropFiles(page, '#crop-drop', ['small.jpg', 'large.jpg']);
        await expect(page.locator('#crop-editor')).toBeVisible();
        expect(await dimsLabel(page), 'multi-file drop takes the first file').toEqual([200, 150]);

        // shrink, then click outside the selection without dragging → empty selection
        await shrinkFromCorner(page, [0.4, 0.4]);
        await page.locator('#crop-canvas').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        const box = await page.locator('#crop-canvas').boundingBox();
        await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.9);
        await page.click('#crop-download');
        await page.waitForTimeout(800);
        const savedSomething = await waitForFile(ctx.out('small_cropped.jpg'), 500) !== null;
        const told = /select/i.test(await toastText(page));
        expect.soft(savedSomething || told, 'Download Crop with an empty selection does nothing and says nothing').toBe(true);
    });
});
