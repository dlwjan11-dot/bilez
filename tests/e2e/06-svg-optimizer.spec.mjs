import fs from 'node:fs';
import { test, expect, openTool, uploadViaClick, dropFiles, expectSaved, readZip, meta, shot, fixture, toastText } from '../helpers.mjs';

test.describe('SVG optimizer', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'svg'); });

    test('click upload one SVG and save it', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#svg-drop', ['icon-bloated.svg']);
        await expect(page.locator('#svg-list')).toContainText('KB →');
        await expect(page.locator('#svg-status')).toHaveText('1 file optimized.');
        await expect(page.locator('#svg-download-all')).toBeHidden();

        await page.click('#svg-list a:has-text("Save")');
        const saved = await expectSaved(ctx.out('icon-bloated.svg'));
        const text = fs.readFileSync(saved, 'utf8');
        expect(text.length).toBeLessThan(fs.statSync(fixture('icon-bloated.svg')).size);
        expect(text).not.toMatch(/sodipodi|metadata|Illustrator/);
        const m = await meta(Buffer.from(text));
        expect([m.format, m.width, m.height]).toEqual(['svg', 256, 256]);
        await shot(page, '06-svg-optimizer');
    });

    test('drag & drop several SVGs, Download All as ZIP', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#svg-drop', ['icon-bloated.svg', 'شعار.svg']);
        await expect(page.locator('#svg-status')).toHaveText('2 files optimized.');
        await page.click('#svg-download-all');
        const entries = await readZip(await expectSaved(ctx.out('optimized_svgs.zip')));
        expect(Object.keys(entries).sort()).toEqual(['icon-bloated.svg', 'شعار.svg'].sort());
        expect(entries['شعار.svg'].toString()).toContain('#10b981');
    });

    test('broken SVG, non-SVG file, duplicate upload', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#svg-drop', ['broken.svg']);
        await expect(page.locator('#svg-list')).toContainText('Failed:');
        await expect(page.locator('#svg-status')).toHaveText('0 files optimized.');

        await dropFiles(page, '#svg-drop', ['small.jpg']);
        await page.waitForTimeout(500);
        expect.soft(await toastText(page), 'feedback when a non-SVG is dropped').toMatch(/svg/i);

        await dropFiles(page, '#svg-drop', ['icon-bloated.svg']);
        await dropFiles(page, '#svg-drop', ['icon-bloated.svg']);
        await expect(page.locator('#svg-status')).toHaveText('2 files optimized.');
        await page.click('#svg-download-all');
        const entries = await readZip(await expectSaved(ctx.out('optimized_svgs.zip')));
        expect.soft(Object.keys(entries).length, 'two optimized files → two entries (same name overwrites)').toBe(2);
        expect.soft(await page.locator('#tool-svg button:has-text("Clear")').count(), 'a way to clear the list').toBeGreaterThan(0);
        await shot(page, '06-svg-optimizer-errors');
    });
});
