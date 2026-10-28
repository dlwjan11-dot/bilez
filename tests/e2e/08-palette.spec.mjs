import { test, expect, openTool, uploadViaClick, dropFiles, setRange, shot , expectClipboard, toastText } from '../helpers.mjs';

const hexes = (page) => page.locator('#palette-swatches .copy-hex-btn').evaluateAll(els => els.map(e => e.dataset.hex));
const dist = (a, b) => {
    const p = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

test.describe('Color palette', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'palette'); });

    test('click upload, extracted colours are correct, copy hex & CSS', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#palette-drop', ['palette-blocks.png']);
        await expect(page.locator('#palette-results')).toBeVisible();
        const found = await hexes(page);
        for (const hex of found) expect(hex, `valid hex ${hex}`).toMatch(/^#[0-9a-f]{6}$/);
        for (const expected of ['#ffffff', '#ff0000', '#0000ff', '#00a000']) {
            const best = Math.min(...found.map(h => dist(h, expected)));
            expect.soft(best, `${expected} should be in the palette (got ${found.join(', ')})`).toBeLessThan(30);
        }
        expect.soft(found, 'image has no black but palette shows #000000').not.toContain('#000000');

        await ctx.clearClipboard();
        await page.locator('#palette-swatches .copy-hex-btn').first().click();
        await expectClipboard(ctx, found[0]);
        await page.click('#palette-copy-css');
        await expectClipboard(ctx, await page.locator('#palette-css').textContent());
        expect(await ctx.clipboard()).toContain(`--color-primary: ${found[0]};`);
        await shot(page, '08-palette');
    });

    test('colour count slider', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#palette-drop', ['large.jpg']);
        await expect(page.locator('#palette-results')).toBeVisible();
        await setRange(page.locator('#palette-count'), 4);
        await expect(page.locator('#palette-count-label')).toHaveText('4');
        expect(await page.locator('#palette-swatches > div').count()).toBeLessThanOrEqual(4);
        await setRange(page.locator('#palette-count'), 12);
        await expect(page.locator('#palette-count-label')).toHaveText('12');
        const n = await page.locator('#palette-swatches > div').count();
        expect(n, 'more colours than at 4, never above the requested 12').toBeGreaterThan(4);
        expect(n).toBeLessThanOrEqual(12);
        expect(await page.locator('#palette-css').textContent()).toContain(`--color-${n > 8 ? 'extra-8' : 'light'}`);
    });

    test('new image, non-image file', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#palette-drop', ['small.jpg']);
        await expect(page.locator('#palette-results')).toBeVisible();
        await page.click('#palette-new-image');
        await expect(page.locator('#palette-drop')).toBeVisible();
        await expect(page.locator('#palette-results')).toBeHidden();
        await uploadViaClick(page, '#palette-drop', ['portrait.png']);
        await expect(page.locator('#palette-results')).toBeVisible();
        await page.click('#palette-new-image');

        await dropFiles(page, '#palette-drop', ['notes.txt']);
        await page.waitForTimeout(500);
        expect.soft(await toastText(page), 'feedback for a non-image').toMatch(/image/i);
        await dropFiles(page, '#palette-drop', ['empty.png']);
        await page.waitForTimeout(800);
        expect.soft(await toastText(page), 'feedback for an unreadable image').toMatch(/image|read|invalid/i);
    });
});
