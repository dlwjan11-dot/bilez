import fs from 'node:fs';
import sharp from 'sharp';
import { test, expect, openTool, uploadViaClick, dropFiles, expectSaved, waitForFile, readZip, meta, shot } from '../helpers.mjs';

const SPECS = {
    'favicon-16x16.png': 16, 'favicon-32x32.png': 32,
    'apple-touch-icon-57x57-precomposed.png': 57, 'apple-touch-icon-72x72-precomposed.png': 72,
    'apple-touch-icon-114x114-precomposed.png': 114, 'apple-touch-icon-144x144-precomposed.png': 144,
    'icon-192x192.png': 192, 'icon-512x512.png': 512,
};

test.describe('Favicon generator', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'favicon'); });

    test('click upload square PNG, app name, ZIP contents', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#fav-drop', ['logo-square.png']);
        await expect(page.locator('#fav-ui')).toBeVisible();
        await expect(page.locator('#fav-status')).toHaveText('Ready to generate!');
        await expect.poll(() => page.locator('#fav-preview').evaluate(i => i.naturalWidth)).toBe(512);

        await page.fill('#fav-app-name', 'تطبيقي');
        await page.click('#fav-generate-btn');
        const entries = await readZip(await expectSaved(ctx.out('website_icons.zip')));
        expect(Object.keys(entries).sort()).toEqual([...Object.keys(SPECS), 'favicon.ico', 'site.webmanifest'].sort());
        for (const [name, size] of Object.entries(SPECS)) {
            const m = await meta(entries[name]);
            expect([name, m.format, m.width, m.height]).toEqual([name, 'png', size, size]);
        }
        const ico = entries['favicon.ico'];
        expect([...ico.subarray(0, 6)]).toEqual([0, 0, 1, 0, 1, 0]);
        expect(ico[6]).toBe(32);
        expect((await meta(ico.subarray(22))).width).toBe(32);
        const manifest = JSON.parse(entries['site.webmanifest'].toString('utf8'));
        expect(manifest.name).toBe('تطبيقي');
        await expect(page.locator('#fav-status')).toHaveText('Done! Check your downloads.');
        await shot(page, '05-favicon');
    });

    test('drag & drop non-square PNG and SVG logo', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#fav-drop', ['wide-banner.png']);
        await page.click('#fav-generate-btn');
        const entries = await readZip(await expectSaved(ctx.out('website_icons.zip')));
        const m = await meta(entries['icon-512x512.png']);
        expect([m.width, m.height]).toEqual([512, 512]);
        const manifest = JSON.parse(entries['site.webmanifest'].toString('utf8'));
        expect(manifest.name).toBe('My App');
    });

    test('SVG logo', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#fav-drop', ['icon-bloated.svg']);
        await page.click('#fav-generate-btn');
        const entries = await readZip(await expectSaved(ctx.out('website_icons.zip')));
        const stats = await (await import('sharp')).default(entries['icon-192x192.png']).stats();
        expect(stats.isOpaque === false || stats.channels[0].max > 0, 'icon is not blank').toBe(true);
    });

    test('bad inputs: text file, empty PNG', async ({ ctx }) => {
        const { page } = ctx;
        await dropFiles(page, '#fav-drop', ['notes.txt']);
        await expect(page.locator('#toast-container')).toContainText('valid image');
        await expect(page.locator('#fav-ui')).toBeHidden();

        await dropFiles(page, '#fav-drop', ['empty.png']);
        await expect(page.locator('#toast-container')).toContainText('Could not read empty.png');
        expect.soft(await page.locator('#fav-ui').isVisible(), 'an unreadable image should be rejected before showing the generate UI').toBe(false);
        if (await page.locator('#fav-generate-btn').isVisible()) {
            await page.click('#fav-generate-btn');
            await page.waitForTimeout(4000);
            expect.soft(await page.locator('#fav-status').textContent(), 'status stuck on "Cutting icons..."').not.toBe('Cutting icons...');
            expect.soft(await page.locator('#fav-generate-btn').isEnabled(), 'generate button stays disabled forever').toBe(true);
        }
        await shot(page, '05-favicon-empty-png');
    });

    test('changing the logo after the first upload', async ({ ctx }) => {
        const { page } = ctx;
        await uploadViaClick(page, '#fav-drop', ['logo-square.png']);
        await expect(page.locator('#fav-ui')).toBeVisible();
        await page.click('#fav-generate-btn');
        await expectSaved(ctx.out('website_icons.zip'));

        await page.click('#fav-change');
        await expect(page.locator('#fav-drop')).toBeVisible();
        await expect(page.locator('#fav-ui')).toBeHidden();
        await uploadViaClick(page, '#fav-drop', ['wide-banner.png']);
        await expect(page.locator('#fav-ui')).toBeVisible();
        await expect.poll(() => page.locator('#fav-preview').evaluate(i => i.naturalWidth)).toBe(800);
        fs.rmSync(ctx.out('website_icons.zip'));
        await expect(page.locator('#fav-generate-btn')).toBeEnabled({ timeout: 5000 });
        await page.click('#fav-generate-btn');
        const entries = await readZip(await expectSaved(ctx.out('website_icons.zip')));
        // the old logo was a circle on transparency; the banner crop is fully opaque
        const { isOpaque } = await sharp(entries['icon-512x512.png']).stats();
        expect(isOpaque, 'icons were made from the new logo').toBe(true);
    });
});
