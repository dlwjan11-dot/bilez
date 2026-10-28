import fs from 'node:fs';
import { test, expect, openTool, uploadViaClick, dropFiles, expectSaved, waitForFile, shot, fixture , expectClipboard } from '../helpers.mjs';

test.describe('Base64', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'base64'); });

    test('encode text (Arabic/UTF-8), Ctrl+Enter, copy, clear', async ({ ctx }) => {
        const { page } = ctx;
        const text = 'Hello مرحبا 👋';
        await page.fill('#b64-encode-input', text);
        await page.click('#b64-encode-btn');
        expect(await page.inputValue('#b64-encode-output')).toBe(Buffer.from(text).toString('base64'));

        await page.fill('#b64-encode-input', 'abc');
        await page.press('#b64-encode-input', 'Control+Enter');
        expect(await page.inputValue('#b64-encode-output')).toBe('YWJj');

        await page.click('#b64-encode-copy');
        await expect(page.locator('#b64-encode-copy')).toHaveText('Copied!');
        await expectClipboard(ctx, 'YWJj');
        await page.click('#b64-encode-clear');
        expect(await page.inputValue('#b64-encode-input')).toBe('');
        expect(await page.inputValue('#b64-encode-output')).toBe('');
    });

    test('encode files by click and by drag & drop', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#b64-file-drop', ['small.jpg']);
        await expect(page.locator('#b64-encode-output')).not.toHaveValue('');
        expect(await page.inputValue('#b64-encode-output')).toBe('data:image/jpeg;base64,' + fs.readFileSync(fixture('small.jpg')).toString('base64'));
        expect(await page.inputValue('#b64-encode-input')).toContain('[File: small.jpg');

        await dropFiles(page, '#b64-file-drop', ['notes.txt']);
        await expect(page.locator('#b64-encode-output')).toHaveValue(/^data:text\/plain;base64,/);

        await dropFiles(page, '#b64-file-drop', ['empty.png']);
        await expect(page.locator('#b64-encode-input')).toHaveValue(/empty\.png/);
        expect(await page.inputValue('#b64-encode-output')).toMatch(/^data:/);
        await shot(page, '10-base64-encode');
    });

    test('decode text, data URL → file, and errors', async ({ ctx }) => {
        const { page } = ctx;
        await page.click('#b64-tab-decode');
        await expect(page.locator('#b64-decode-panel')).toBeVisible();

        await page.fill('#b64-decode-input', Buffer.from('سلام world').toString('base64'));
        await page.click('#b64-decode-btn');
        expect(await page.inputValue('#b64-decode-output')).toBe('سلام world');
        await page.click('#b64-decode-copy');
        await expectClipboard(ctx, 'سلام world');

        await page.fill('#b64-decode-input', 'data:image/jpeg;base64,' + fs.readFileSync(fixture('small.jpg')).toString('base64'));
        await page.press('#b64-decode-input', 'Control+Enter');
        await expect(page.locator('#b64-decode-download')).toBeVisible();
        await page.click('#b64-decode-download');
        const saved = await expectSaved(ctx.out('decoded_file.jpeg'));
        expect(fs.readFileSync(saved).equals(fs.readFileSync(fixture('small.jpg')))).toBe(true);

        await page.fill('#b64-decode-input', 'data:image/svg+xml;base64,' + fs.readFileSync(fixture('icon-bloated.svg')).toString('base64'));
        await page.click('#b64-decode-btn');
        await page.click('#b64-decode-download');
        await page.waitForTimeout(1000);
        expect.soft(await waitForFile(ctx.out('decoded_file.svg'), 2000), 'SVG data URL should save as .svg (not ".svg+xml")').not.toBeNull();

        await page.fill('#b64-decode-input', 'data:text/plain;charset=utf-8;base64,' + Buffer.from('hi').toString('base64'));
        await page.click('#b64-decode-btn');
        expect.soft(await page.locator('#b64-decode-error').isVisible(), 'data URL with ";charset=utf-8" should decode').toBe(false);

        await page.fill('#b64-decode-input', 'SGVsbG8_d29ybGQ-');
        await page.click('#b64-decode-btn');
        expect.soft(await page.inputValue('#b64-decode-output'), 'URL-safe Base64 (- and _)').toBe('Hello?world>');

        await page.fill('#b64-decode-input', '###not base64###');
        await page.click('#b64-decode-btn');
        await expect(page.locator('#b64-decode-error')).toBeVisible();
        await expect(page.locator('#b64-decode-error')).toContainText('Decode failed');
        await shot(page, '10-base64-decode');

        await page.click('#b64-decode-clear');
        expect(await page.inputValue('#b64-decode-input')).toBe('');
        await expect(page.locator('#b64-decode-error')).toBeHidden();
        await expect(page.locator('#b64-decode-download')).toBeHidden();
    });
});
