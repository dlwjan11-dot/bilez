export function initCodeFormatter() {
    const tabBtns = document.querySelectorAll('.fmt-tab-btn');
    const inputEl = document.getElementById('fmt-input');
    const outputEl = document.getElementById('fmt-output');
    const formatBtn = document.getElementById('fmt-format');
    const minifyBtn = document.getElementById('fmt-minify');
    const copyBtn = document.getElementById('fmt-copy');
    const clearBtn = document.getElementById('fmt-clear');
    const errorEl = document.getElementById('fmt-error');

    if (!inputEl) return;

    let mode = 'json';

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            mode = btn.dataset.fmt;
            tabBtns.forEach(b => {
                const active = b === btn;
                b.classList.toggle('bg-blue-600', active);
                b.classList.toggle('text-white', active);
                b.classList.toggle('border-blue-600', active);
                b.classList.toggle('bg-slate-50', !active);
                b.classList.toggle('text-slate-600', !active);
                b.classList.toggle('border-slate-200', !active);
            });
            const placeholders = { json: 'Paste JSON here…', css: 'Paste CSS here…', html: 'Paste HTML here…' };
            inputEl.placeholder = placeholders[mode] || 'Paste code here…';
            clearError();
        });
    });

    formatBtn.addEventListener('click', () => {
        const raw = inputEl.value.trim();
        if (!raw) return;
        clearError();
        if (mode === 'json') {
            try { outputEl.textContent = JSON.stringify(JSON.parse(raw), null, 2); }
            catch (e) { showError(e.message); }
        } else if (mode === 'css') {
            outputEl.textContent = formatCSS(raw);
        } else {
            outputEl.textContent = formatHTML(raw);
        }
    });

    minifyBtn.addEventListener('click', () => {
        const raw = inputEl.value.trim();
        if (!raw) return;
        clearError();
        if (mode === 'json') {
            try { outputEl.textContent = JSON.stringify(JSON.parse(raw)); }
            catch (e) { showError(e.message); }
        } else if (mode === 'css') {
            outputEl.textContent = minifyCSS(raw);
        } else {
            outputEl.textContent = minifyHTML(raw);
        }
    });

    copyBtn.addEventListener('click', () => {
        const text = outputEl.textContent;
        if (!text) return;
        navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy Output', 1500);
    });

    clearBtn.addEventListener('click', () => {
        inputEl.value = '';
        outputEl.textContent = '';
        clearError();
    });

    // Ctrl+Enter to format
    inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            formatBtn.click();
        }
    });

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    }

    function clearError() {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    // Swap quoted strings (and optionally other spans) for placeholders so whitespace and
    // punctuation rules never touch their contents, then put them back afterwards.
    function protect(text, pattern) {
        const saved = [];
        const masked = text.replace(pattern, m => `\u0000${saved.push(m) - 1}\u0000`);
        return { masked, restore: s => s.replace(/\u0000(\d+)\u0000/g, (_, i) => saved[i]) };
    }

    const CSS_STRINGS = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;

    // Walks the CSS so ; { } inside strings or parentheses (url(data:...;base64,...)) are left alone
    function formatCSS(css) {
        const { masked, restore } = protect(css, CSS_STRINGS);
        const lines = [];
        let depth = 0;
        let parens = 0;
        let line = '';
        const push = (text) => { if (text.trim()) lines.push('    '.repeat(depth) + text.trim()); };
        const flush = () => { push(line); line = ''; };

        for (let i = 0; i < masked.length; i++) {
            const ch = masked[i];
            if (ch === '/' && masked[i + 1] === '*') {
                const end = masked.indexOf('*/', i + 2);
                const stop = end === -1 ? masked.length : end + 2;
                flush();
                push(masked.slice(i, stop));
                i = stop - 1;
                continue;
            }
            if (ch === '(') parens++;
            if (ch === ')') parens = Math.max(0, parens - 1);
            if (parens === 0 && ch === '{') { line = line.trim() + ' {'; flush(); depth++; continue; }
            if (parens === 0 && ch === ';') { line += ';'; flush(); continue; }
            if (parens === 0 && ch === '}') { flush(); depth = Math.max(0, depth - 1); push('}'); continue; }
            if (/\s/.test(ch)) { if (line && !line.endsWith(' ')) line += ' '; continue; }
            line += ch;
        }
        flush();
        return restore(lines.join('\n'));
    }

    function minifyCSS(css) {
        const { masked, restore } = protect(css, CSS_STRINGS);
        return restore(masked
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s*([{};:,>~+])\s*/g, '$1')
            .replace(/;}/g, '}')
            .trim());
    }

    const VOID_TAGS = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;

    function formatHTML(html) {
        let indent = 0;
        return html
            .replace(/>\s*</g, '>\n<')
            .split('\n')
            .map(line => {
                line = line.trim();
                if (!line) return null;
                const isClose = /^<\/[^>]+>/.test(line);
                const isOpen  = /^<[^\/!][^>]*>/.test(line) && !VOID_TAGS.test((line.match(/^<([^\s>\/]+)/) || [])[1] || '');
                const tag = (line.match(/^<([^\s>\/]+)/) || [])[1] || '';
                const isSelfClose = /\/>$/.test(line) || VOID_TAGS.test(tag);
                // <p>Hello</p> opens and closes on the same line, so it must not indent what follows
                const closesOnSameLine = tag && new RegExp(`</${tag}\\s*>$`, 'i').test(line);
                if (isClose) indent = Math.max(0, indent - 1);
                const out = '  '.repeat(indent) + line;
                if (isOpen && !isSelfClose && !isClose && !closesOnSameLine) indent++;
                return out;
            })
            .filter(l => l !== null)
            .join('\n');
    }

    // Whitespace is significant inside these, so they are kept byte-for-byte
    const RAW_BLOCKS = /<(pre|textarea|script|style)\b[\s\S]*?<\/\1\s*>/gi;

    function minifyHTML(html) {
        const { masked, restore } = protect(html.replace(/<!--[\s\S]*?-->/g, ''), RAW_BLOCKS);
        return restore(masked
            .replace(/\s+/g, ' ')
            .replace(/>\s+</g, '><')
            .trim());
    }
}
