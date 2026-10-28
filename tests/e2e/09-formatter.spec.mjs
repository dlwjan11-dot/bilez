import { test, expect, openTool, shot , expectClipboard } from '../helpers.mjs';

const out = (page) => page.locator('#fmt-output').textContent();

test.describe('Code formatter', () => {
    test.beforeEach(async ({ ctx }) => { await openTool(ctx.page, 'formatter'); });

    test('JSON: format, minify, invalid, Ctrl+Enter, copy, clear', async ({ ctx }) => {
        const { page } = ctx;
        const obj = { a: 1, b: [1, 2], ar: 'مرحبا', nested: { x: null } };
        await page.fill('#fmt-input', JSON.stringify(obj));
        await page.click('#fmt-format');
        expect(await out(page)).toBe(JSON.stringify(obj, null, 2));
        await page.click('#fmt-minify');
        expect(await out(page)).toBe(JSON.stringify(obj));

        await page.fill('#fmt-input', '{a:1}');
        await page.click('#fmt-format');
        await expect(page.locator('#fmt-error')).toBeVisible();
        await page.fill('#fmt-input', '[1,2]');
        await page.press('#fmt-input', 'Control+Enter');
        await expect(page.locator('#fmt-error')).toBeHidden();
        expect(await out(page)).toBe('[\n  1,\n  2\n]');

        await page.click('#fmt-copy');
        await expect(page.locator('#fmt-copy')).toHaveText('Copied!');
        await expectClipboard(ctx, '[\n  1,\n  2\n]');
        await page.click('#fmt-clear');
        expect(await page.inputValue('#fmt-input')).toBe('');
        expect(await out(page)).toBe('');
        await page.fill('#fmt-input', JSON.stringify(obj));
        await page.click('#fmt-format');
        await shot(page, '09-formatter');
    });

    test('CSS: format and minify', async ({ ctx }) => {
        const { page } = ctx;
        await page.click('.fmt-tab-btn[data-fmt="css"]');
        expect(await page.getAttribute('#fmt-input', 'placeholder')).toBe('Paste CSS here…');
        await page.fill('#fmt-input', '.a{color:red;margin:0 auto}.b > .c{padding:1px}');
        await page.click('#fmt-format');
        expect(await out(page)).toBe('.a {\n    color:red;\n    margin:0 auto\n}\n.b > .c {\n    padding:1px\n}');
        await page.click('#fmt-minify');
        expect(await out(page)).toBe('.a{color:red;margin:0 auto}.b>.c{padding:1px}');

        const tricky = '.i{background:url("data:image/png;base64,AAAA");content:"a;b"}';
        await page.fill('#fmt-input', tricky);
        await page.click('#fmt-format');
        expect.soft(await out(page), 'semicolons inside url()/strings must not be split').toContain('url("data:image/png;base64,AAAA")');
        await page.click('#fmt-minify');
        expect.soft(await out(page), 'minify keeps spaces inside strings').toBe(tricky);

        await page.fill('#fmt-input', '@media (max-width: 600px){.a{color:red}}');
        await page.click('#fmt-format');
        expect.soft(await out(page), 'nested @media block indentation').toContain('\n    .a {');
    });

    test('HTML: format and minify', async ({ ctx }) => {
        const { page } = ctx;
        await page.click('.fmt-tab-btn[data-fmt="html"]');
        await page.fill('#fmt-input', '<div><p>Hello</p><br><img src="x.png"><span>a</span></div>');
        await page.click('#fmt-format');
        expect(await out(page)).toBe('<div>\n  <p>Hello</p>\n  <br>\n  <img src="x.png">\n  <span>a</span>\n</div>');

        await page.fill('#fmt-input', '<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>');
        await page.click('#fmt-minify');
        expect(await out(page)).toBe('<ul><li>One</li><li>Two</li></ul>');

        await page.fill('#fmt-input', '<p>Hello <b>World</b> !</p>');
        await page.click('#fmt-minify');
        expect.soft(await out(page), 'minify keeps the space between inline words').toBe('<p>Hello <b>World</b> !</p>');

        await page.fill('#fmt-input', '<pre>  line 1\n  line 2</pre>');
        await page.click('#fmt-minify');
        expect.soft(await out(page), 'minify must keep whitespace inside <pre>').toBe('<pre>  line 1\n  line 2</pre>');
    });

    test('switching mode clears stale error and output', async ({ ctx }) => {
        const { page } = ctx;
        await page.fill('#fmt-input', '{bad');
        await page.click('#fmt-format');
        await expect(page.locator('#fmt-error')).toBeVisible();
        await page.click('.fmt-tab-btn[data-fmt="css"]');
        await expect(page.locator('#fmt-error')).toBeHidden();
    });
});
