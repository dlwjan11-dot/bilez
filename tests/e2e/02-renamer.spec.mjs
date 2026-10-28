import fs from 'node:fs';
import { test, expect, openTool, uploadViaClick, dropFiles, expectSaved, readZip, shot, fixture } from '../helpers.mjs';

const previewNames = (page) => page.locator('#renamer-list > div > span:last-child').allTextContents();

test.describe('Renamer', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'renamer'); });

    test('click upload, every rule, download ZIP with identical bytes', async ({ ctx }) => {
        const { page } = ctx;
        const chooser = await uploadViaClick(page, '#renamer-drop', ['small.jpg', 'my photo-min.jpg', 'صورة تجربة.jpg', 'notes.txt']);
        expect(chooser.isMultiple()).toBe(true);
        await expect(page.locator('#renamer-file-count')).toHaveText('4 files loaded');
        await expect(page.locator('#renamer-options')).toBeVisible();
        expect(await previewNames(page)).toEqual(['small.jpg', 'my photo.jpg', 'صورة تجربة.jpg', 'notes.txt']);

        await page.uncheck('#renamer-strip-min');
        expect((await previewNames(page))[1]).toBe('my photo-min.jpg');
        await page.check('#renamer-strip-min');

        await page.fill('#renamer-prefix', '2026_');
        await page.fill('#renamer-suffix', '_final');
        await page.fill('#renamer-find', 'photo');
        await page.fill('#renamer-replace', 'pic');
        expect(await previewNames(page)).toEqual(['2026_small_final.jpg', '2026_my pic_final.jpg', '2026_صورة تجربة_final.jpg', '2026_notes_final.txt']);

        await page.check('#renamer-sequential');
        await page.fill('#renamer-seq-pad', '2');
        expect((await previewNames(page))[0]).toBe('2026_small_01_final.jpg');
        await page.fill('#renamer-seq-start', '0');
        expect.soft((await previewNames(page))[0], 'sequence "start at 0" (the field allows min=0)').toBe('2026_small_00_final.jpg');
        await page.fill('#renamer-seq-start', '5');
        expect((await previewNames(page))[3]).toBe('2026_notes_08_final.txt');

        const expected = await previewNames(page);
        await page.click('#renamer-download');
        const entries = await readZip(await expectSaved(ctx.out('renamed_files.zip')));
        expect(Object.keys(entries).sort()).toEqual([...expected].sort());
        expect(entries['2026_صورة تجربة_07_final.jpg'].equals(fs.readFileSync(fixture('صورة تجربة.jpg')))).toBe(true);
        await expect(page.locator('#renamer-download')).toHaveText('Download ZIP');
        await shot(page, '02-renamer');
    });

    test('drag & drop replaces the list; name collisions', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#renamer-drop', ['large.jpg', 'portrait.png']);
        await expect(page.locator('#renamer-file-count')).toHaveText('2 files loaded');
        await dropFiles(page, '#renamer-drop', ['small.jpg', 'small-min.jpg']);
        await expect(page.locator('#renamer-file-count')).toHaveText('2 files loaded');

        const names = await previewNames(page);
        expect(names, 'second file numbered instead of overwriting the first').toEqual(['small.jpg', 'small-2.jpg']);
        expect.soft(await page.locator('#renamer-preview-panel').textContent(), 'duplicate output names should be flagged').toMatch(/duplicate|conflict|same name/i);

        await page.click('#renamer-download');
        const entries = await readZip(await expectSaved(ctx.out('renamed_files.zip')));
        expect.soft(Object.keys(entries).length, 'two input files → two files in the ZIP (collision silently drops one)').toBe(2);
    });

    test('single file, empty file, and re-upload of the same file', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#renamer-drop', ['empty.png']);
        await expect(page.locator('#renamer-file-count')).toHaveText('1 file loaded');
        await page.fill('#renamer-prefix', 'x_');
        await page.click('#renamer-download');
        const entries = await readZip(await expectSaved(ctx.out('renamed_files.zip')));
        expect(entries['x_empty.png'].length).toBe(0);

        await uploadViaClick(page, '#renamer-drop', ['empty.png']);
        await expect(page.locator('#renamer-file-count')).toHaveText('1 file loaded');
        expect(await previewNames(page)).toEqual(['x_empty.png']);
        await page.click('#renamer-clear');
        await expect(page.locator('#renamer-preview-panel')).toBeHidden();
        await expect(page.locator('#renamer-options')).toBeHidden();
        await expect(page.locator('#renamer-file-count')).toBeHidden();
        await dropFiles(page, '#renamer-drop', ['small.jpg']);
        await expect(page.locator('#renamer-file-count')).toHaveText('1 file loaded');
        expect(await previewNames(page), 'rules are kept after Clear').toEqual(['x_small.jpg']);
    });
});
