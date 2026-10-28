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

    function formatCSS(css) {
        return css
            .replace(/\/\*[\s\S]*?\*\//g, m => `\n${m}\n`)
            .replace(/\s*\{\s*/g, ' {\n    ')
            .replace(/\s*;\s*/g, ';\n    ')
            .replace(/\s*\}\s*/g, '\n}\n')
            .replace(/\n {4}(\n\})/g, '\n$1')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function minifyCSS(css) {
        return css
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s*([{};:,>~+])\s*/g, '$1')
            .replace(/;}/g, '}')
            .trim();
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
                const isSelfClose = /\/>$/.test(line) || VOID_TAGS.test((line.match(/^<([^\s>\/]+)/) || [])[1] || '');
                if (isClose) indent = Math.max(0, indent - 1);
                const out = '  '.repeat(indent) + line;
                if (isOpen && !isSelfClose && !isClose) indent++;
                return out;
            })
            .filter(l => l !== null)
            .join('\n');
    }

    function minifyHTML(html) {
        return html
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\s+/g, ' ')
            .replace(/>\s+</g, '><')
            .trim();
    }
}
