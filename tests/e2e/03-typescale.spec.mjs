import { test, expect, openTool, shot , expectClipboard } from '../helpers.mjs';

const css = (page) => page.locator('#ts-css').textContent();

test.describe('Typescale', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'typescale'); });

    test('base size, ratio, font, copy CSS and tokens', async ({ ctx }) => {
        const { page } = ctx;
        expect(await css(page)).toContain('--text-base: 16.00px;');
        expect(await css(page)).toContain('--text-xl-1: 20.00px;');
        await expect(page.locator('#ts-preview > div')).toHaveCount(8);

        await page.fill('#ts-base', '20');
        expect(await css(page)).toContain('--text-base: 20.00px;');
        await page.selectOption('#ts-scale', '1.618');
        expect(await css(page)).toContain('--text-xl-1: 32.36px;');

        await page.selectOption('#ts-font', 'Oswald');
        expect(await page.locator('#ts-preview').evaluate(el => el.style.fontFamily)).toContain('Oswald');
        expect(await page.locator('#ts-font-link').getAttribute('href')).toContain('family=Oswald');
        await page.selectOption('#ts-font', 'Playfair Display');
        expect(await page.locator('#ts-font-link').getAttribute('href')).toContain('family=Playfair+Display');
        await page.waitForTimeout(1500);
        const fontLoaded = await page.evaluate(() => document.fonts.check('16px "Playfair Display"'));
        expect.soft(fontLoaded, 'Google font actually loaded (needs internet)').toBe(true);

        await ctx.clearClipboard();
        await page.click('#ts-copy-css');
        await expect(page.locator('#ts-copy-css')).toHaveText('Copied!');
        await expectClipboard(ctx, await css(page));

        await page.click('#ts-copy-tokens');
        await expect.poll(() => ctx.clipboard()).toContain('$description');
        const tokens = JSON.parse(await ctx.clipboard());
        expect(tokens['text-base']).toEqual({ $value: '20.00px', $type: 'dimension' });
        expect(tokens['font-family'].$value).toContain('Playfair Display');
        expect(Object.keys(tokens).filter(k => k.startsWith('text-'))).toHaveLength(8);
        await shot(page, '03-typescale');
    });

    test('switching to "Set Max (Heading)" mode', async ({ ctx }) => {
        const { page } = ctx;
        await page.selectOption('#ts-mode', 'max');
        expect(await page.inputValue('#ts-base')).toBe('64');
        expect.soft(await css(page), 'after switching to Max, the largest step should be the 64px shown in the field').toContain('--text-xl-5: 64.00px;');

        await page.fill('#ts-base', '72');
        expect(await css(page)).toContain('--text-xl-5: 72.00px;');

        await page.fill('#ts-base', '64');
        await page.selectOption('#ts-mode', 'base');
        expect(await page.inputValue('#ts-base')).toBe('16');
        expect.soft(await css(page), 'after switching back to Base, base should be 16px').toContain('--text-base: 16.00px;');
    });

    test('invalid sizes', async ({ ctx }) => {
        const { page } = ctx;
        await page.fill('#ts-base', '');
        expect(await css(page)).toContain('--text-base: 16.00px;');
        await page.fill('#ts-base', '-10');
        expect.soft(await css(page), 'negative size should be rejected, not produce negative px').not.toMatch(/: -\d/);
    });
});
