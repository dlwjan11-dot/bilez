import fs from 'node:fs';
import { test, expect, openTool, uploadViaClick, dropFiles, expectSaved, waitForFile, readZip, meta, shot, toastText } from '../helpers.mjs';

test.describe('PDF to JPG', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'pdf'); });

    test('click upload 3-page PDF, convert, ZIP of JPGs', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#pdf-drop', ['three-pages.pdf']);
        await expect(page.locator('#pdf-list')).toContainText('3 Pages', { timeout: 20000 });
        await expect(page.locator('#pdf-count')).toHaveText('1');
        await page.waitForTimeout(500);
        const thumbW = await page.locator('#pdf-list canvas').first().evaluate(c => c.width);
        expect(thumbW, 'first-page thumbnail rendered').toBeGreaterThan(0);

        await page.click('#pdf-action-btn');
        const entries = await readZip(await expectSaved(ctx.out('pdf_converted.zip'), 30000));
        expect(Object.keys(entries).sort()).toEqual(['three-pages_page_1.jpg', 'three-pages_page_2.jpg', 'three-pages_page_3.jpg']);
        const m = await meta(entries['three-pages_page_2.jpg']);
        expect([m.format, m.width, m.height]).toEqual(['jpeg', 1224, 1584]);
        await expect(page.locator('#pdf-status')).toContainText('Done');
        await shot(page, '04-pdf-to-jpg');
        await expect(page.locator('#pdf-action-btn')).toBeEnabled({ timeout: 5000 });
    });

    test('drag & drop several PDFs (Arabic name, upper-case .PDF)', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#pdf-drop', ['ملف عربي.pdf', 'UPPER CASE.PDF']);
        await expect(page.locator('#pdf-count')).toHaveText('2', { timeout: 20000 });
        await page.click('#pdf-action-btn');
        const entries = await readZip(await expectSaved(ctx.out('pdf_converted.zip'), 30000));
        const names = Object.keys(entries).sort();
        expect(names).toContain('ملف عربي_page_1.jpg');
        expect(names).toContain('ملف عربي_page_2.jpg');
        expect.soft(names, '".PDF" extension should be stripped like ".pdf"').toContain('UPPER CASE_page_1.jpg');
    });

    test('corrupt PDF shows an error instead of loading forever', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#pdf-drop', ['corrupt.pdf']);
        await page.waitForTimeout(5000);
        expect.soft(await page.locator('#pdf-list').textContent(), 'still "Parsing PDF..." after 5s').not.toContain('Parsing PDF');
        expect.soft(await page.locator('#tool-pdf').textContent(), 'user-visible error').toMatch(/error|invalid|failed|could not/i);
        await shot(page, '04-pdf-to-jpg-corrupt');
    });

    test('non-PDF file and converting with nothing loaded', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#pdf-drop', ['notes.txt']);
        await page.waitForTimeout(500);
        expect.soft(await page.locator('#pdf-drop').isVisible(), 'drop zone should stay when the only file was rejected').toBe(true);
        expect.soft(await toastText(page), 'rejected file feedback').toMatch(/pdf/i);

        if (await page.locator('#pdf-action-btn').isVisible()) {
            await page.click('#pdf-action-btn');
            await page.waitForTimeout(1500);
            expect.soft(await page.locator('#pdf-progress-pct').textContent(), 'progress shows NaN%').not.toContain('NaN');
            expect.soft(await waitForFile(ctx.out('pdf_converted.zip'), 1000), 'empty ZIP saved with zero pages').toBeNull();
        }
    });

    test('adding more PDFs / starting over after the first upload', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#pdf-drop', ['three-pages.pdf']);
        await expect(page.locator('#pdf-list')).toContainText('3 Pages', { timeout: 20000 });
        const canAddOrClear = await page.locator('#pdf-drop').isVisible()
            || await page.locator('#tool-pdf button:has-text("Clear"), #tool-pdf button:has-text("Add")').count() > 0;
        expect.soft(canAddOrClear, 'after the first upload there is no way to add more PDFs or clear the list').toBe(true);
    });
});
