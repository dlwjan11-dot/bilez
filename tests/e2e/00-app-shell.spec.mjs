import { test, expect, shot } from '../helpers.mjs';

const TABS = ['smart', 'renamer', 'typescale', 'pdf', 'favicon', 'svg', 'cropper', 'palette', 'formatter', 'base64', 'cssbuilder'];

test.describe('App shell', () => {
    test('boots with no console errors and the expected title', async ({ ctx }) => {
        const { page } = ctx;
        expect(await page.title()).toContain('Abdul Tools');
        expect(await page.evaluate(() => typeof window.pdfjsLib), 'pdf.js (CDN) should be loaded').toBe('object');
        await page.waitForTimeout(1500);
        expect.soft(ctx.logs.pageErrors, 'uncaught errors on boot').toEqual([]);
        expect.soft(ctx.logs.console.filter(l => l.startsWith('[error]')), 'console errors on boot').toEqual([]);
    });

    test('every nav tab shows exactly its own section', async ({ ctx }) => {
        const { page } = ctx;
        for (const tab of TABS) {
            await page.click(`#nav-tabs [data-tab="${tab}"]`);
            await expect(page.locator(`#tool-${tab}`)).toBeVisible();
            expect(await page.locator('.tool-section:visible').count(), `only ${tab} visible`).toBe(1);
            await expect(page.locator(`#nav-tabs [data-tab="${tab}"]`)).toHaveAttribute('aria-pressed', 'true');
        }
    });

    test('dark mode toggles and survives a reload', async ({ ctx }) => {
        const { page } = ctx;
        const start = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        await page.click('#dark-toggle');
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(!start);
        await expect(page.locator(start ? '#dark-icon-moon' : '#dark-icon-sun')).toBeVisible();
        await shot(page, '00-app-dark-mode-toggled');
        await page.reload();
        await expect(page.locator('#ts-css')).not.toBeEmpty();
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'theme persisted').toBe(!start);
        await page.click('#dark-toggle');
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(start);
    });

    test('tooltips appear on hover', async ({ ctx }) => {
        const { page } = ctx;
        await page.hover('#dark-toggle');
        await expect(page.locator('#app-tooltip')).toHaveClass(/visible/);
        await expect(page.locator('#app-tooltip')).toContainText('dark mode');
    });
});
