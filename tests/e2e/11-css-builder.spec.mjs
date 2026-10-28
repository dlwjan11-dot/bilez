import { test, expect, openTool, setRange, shot , expectClipboard } from '../helpers.mjs';

const shadowCss = (page) => page.locator('#cssb-shadow-output').textContent();
const gradCss = (page) => page.locator('#cssb-grad-output').textContent();

test.describe('CSS builder', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'cssbuilder'); });

    test('box shadow: every slider, colour, inset, layers, copy', async ({ ctx }) => {
        const { page } = ctx;
        expect(await shadowCss(page)).toBe('box-shadow: 4px 4px 10px 0px rgba(0,0,0,0.30);');

        await setRange(page.locator('#cssb-sx-0'), 12);
        await setRange(page.locator('#cssb-sy-0'), -8);
        await setRange(page.locator('#cssb-sb-0'), 30);
        await setRange(page.locator('#cssb-ss-0'), -5);
        await expect(page.locator('#cssb-sx-0-v')).toHaveText('12px');
        await expect(page.locator('#cssb-ss-0-v')).toHaveText('-5px');
        await page.locator('#cssb-sc-0').fill('#ff0000');
        await setRange(page.locator('#cssb-so-0'), 50);
        await expect(page.locator('#cssb-so-label-0')).toHaveText('50%');
        await page.check('#cssb-si-0');
        expect(await shadowCss(page)).toBe('box-shadow: inset 12px -8px 30px -5px rgba(255,0,0,0.50);');
        const applied = await page.locator('#cssb-shadow-preview').evaluate(el => getComputedStyle(el).boxShadow);
        expect(applied).toContain('inset');

        await page.click('#cssb-shadow-add');
        await expect(page.locator('#cssb-shadow-layers > div')).toHaveCount(2);
        expect(await shadowCss(page)).toContain(',\n');
        await setRange(page.locator('#cssb-sb-1'), 40);
        await page.locator('.cssb-shadow-remove[data-i="0"]').click();
        await expect(page.locator('#cssb-shadow-layers > div')).toHaveCount(1);
        expect(await shadowCss(page), 'remaining layer keeps its own values').toBe('box-shadow: 4px 4px 40px 0px rgba(0,0,0,0.30);');
        await expect(page.locator('#cssb-sb-0-v')).toHaveText('40px');
        expect(await page.inputValue('#cssb-sb-0')).toBe('40');

        await page.click('#cssb-shadow-copy');
        await expect(page.locator('#cssb-shadow-copy')).toHaveText('Copied!');
        await expectClipboard(ctx, await shadowCss(page));
        await shot(page, '11-css-builder-shadow');
    });

    test('gradient: angle, linear/radial, stops, copy', async ({ ctx }) => {
        const { page } = ctx;
        await page.click('#cssb-tab-gradient');
        await expect(page.locator('#cssb-gradient-panel')).toBeVisible();
        await expect(page.locator('#cssb-shadow-panel')).toBeHidden();
        expect(await gradCss(page)).toBe('background: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%);');

        await setRange(page.locator('#cssb-grad-angle'), 45);
        await expect(page.locator('#cssb-grad-angle-label')).toHaveText('45°');
        expect(await gradCss(page)).toContain('linear-gradient(45deg');

        await page.click('#cssb-grad-radial');
        await expect(page.locator('#cssb-grad-angle-row')).toBeHidden();
        expect(await gradCss(page)).toBe('background: radial-gradient(circle, #6366f1 0%, #06b6d4 100%);');
        await page.click('#cssb-grad-linear');
        await expect(page.locator('#cssb-grad-angle-row')).toBeVisible();
        expect(await gradCss(page)).toContain('linear-gradient(45deg');

        await page.click('#cssb-grad-add-stop');
        await expect(page.locator('#cssb-grad-stops > div')).toHaveCount(3);
        expect(await gradCss(page)).toBe('background: linear-gradient(45deg, #6366f1 0%, #f59e0b 50%, #06b6d4 100%);');
        await page.locator('#cssb-stop-c-2').fill('#000000');
        await setRange(page.locator('#cssb-stop-p-2'), 10);
        await expect(page.locator('#cssb-stop-p-label-2')).toHaveText('10%');
        expect(await gradCss(page)).toBe('background: linear-gradient(45deg, #6366f1 0%, #000000 10%, #06b6d4 100%);');
        const bg = await page.locator('#cssb-grad-preview').evaluate(el => getComputedStyle(el).backgroundImage);
        expect(bg).toContain('linear-gradient');

        await page.locator('.cssb-stop-remove[data-i="0"]').click();
        await expect(page.locator('#cssb-grad-stops > div')).toHaveCount(2);
        expect(await gradCss(page)).toBe('background: linear-gradient(45deg, #000000 10%, #06b6d4 100%);');
        await expect(page.locator('.cssb-stop-remove')).toHaveCount(0);

        await page.click('#cssb-grad-copy');
        await expectClipboard(ctx, await gradCss(page));
        await shot(page, '11-css-builder-gradient');
    });
});
