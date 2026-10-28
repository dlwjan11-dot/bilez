import './style.css';

import { initSmartResizer } from './tools/smart-resizer.js';
import { initRenamer } from './tools/renamer.js';
import { initTypescale } from './tools/typescale.js';
import { initPdfConverter } from './tools/pdf-converter.js';
import { initFaviconGenerator } from './tools/favicon-generator.js';
import { initSvgOptimizer } from './tools/svg-optimizer.js';
import { initImageCropper } from './tools/image-cropper.js';
import { initColorPalette } from './tools/color-palette.js';
import { initCodeFormatter } from './tools/code-formatter.js';
import { initBase64 } from './tools/base64.js';
import { initCssBuilder } from './tools/css-builder.js';

// --- Tab system ---

function switchTab(tabId) {
    document.querySelectorAll('.tool-section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById('tool-' + tabId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(btn => {
        const active = btn.dataset.tab === tabId;
        btn.classList.toggle('border-blue-500', active);
        btn.classList.toggle('text-blue-400', active);
        btn.classList.toggle('active-tab', active);
        btn.classList.toggle('border-transparent', !active);
        btn.classList.toggle('text-slate-400', !active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function updateDarkIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    const moon = document.getElementById('dark-icon-moon');
    const sun = document.getElementById('dark-icon-sun');
    if (moon) moon.classList.toggle('hidden', isDark);
    if (sun) sun.classList.toggle('hidden', !isDark);
}

function applyTooltips() {
    const tooltip = document.getElementById('app-tooltip') || (() => {
        const node = document.createElement('div');
        node.id = 'app-tooltip';
        node.className = 'app-tooltip';
        document.body.appendChild(node);
        return node;
    })();

    document.querySelectorAll('[data-tooltip]').forEach((el) => {
        const text = (el.dataset.tooltip || '').trim();
        if (!text || el.dataset.tooltipBound === 'true') return;

        el.dataset.tooltipBound = 'true';
        el.removeAttribute('title');
        if (!el.getAttribute('aria-label')) {
            el.setAttribute('aria-label', text);
        }

        const show = (event) => {
            tooltip.textContent = text;
            tooltip.classList.add('visible');
            const x = event && typeof event.clientX === 'number' ? event.clientX : el.getBoundingClientRect().left + (el.offsetWidth / 2);
            const y = event && typeof event.clientY === 'number' ? event.clientY : el.getBoundingClientRect().top;
            tooltip.style.left = `${x + 14}px`;
            tooltip.style.top = `${y - 12}px`;
        };

        const hide = () => tooltip.classList.remove('visible');

        el.addEventListener('mouseenter', show);
        el.addEventListener('mousemove', show);
        el.addEventListener('mouseleave', hide);
        el.addEventListener('pointerdown', hide);
        el.addEventListener('focus', (event) => show({ clientX: el.getBoundingClientRect().left + (el.offsetWidth / 2), clientY: el.getBoundingClientRect().top }));
        el.addEventListener('blur', hide);
    });
}

// --- Boot ---

document.addEventListener('DOMContentLoaded', () => {
    const navTabs = document.getElementById('nav-tabs');

    function activateTool(tabId) {
        switchTab(tabId);
    }

    if (navTabs) {
        navTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-tab]');
            if (!btn) return;
            activateTool(btn.dataset.tab);
        });
    }

    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.setAttribute('aria-pressed', btn.classList.contains('active-tab') ? 'true' : 'false');
    });

    const darkToggle = document.getElementById('dark-toggle');
    if (darkToggle) {
        darkToggle.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            updateDarkIcon();
        });
    }

    applyTooltips();
    switchTab('smart');
    updateDarkIcon();

    try { initSmartResizer(); } catch (e) { console.error("Smart Resizer Failed:", e); }
    try { initRenamer(); } catch (e) { console.error("Renamer Failed:", e); }
    try { initTypescale(); } catch (e) { console.error("Typescale Failed:", e); }
    try { initPdfConverter(); } catch (e) { console.error("PDF Failed:", e); }
    try { initFaviconGenerator(); } catch (e) { console.error("Favicon Failed:", e); }
    try { initSvgOptimizer(); } catch (e) { console.error("SVG Optimizer Failed:", e); }
    try { initImageCropper(); } catch (e) { console.error("Cropper Failed:", e); }
    try { initColorPalette(); } catch (e) { console.error("Palette Failed:", e); }
    try { initCodeFormatter(); } catch (e) { console.error("Formatter Failed:", e); }
    try { initBase64(); } catch (e) { console.error("Base64 Failed:", e); }
    try { initCssBuilder(); } catch (e) { console.error("CSS Builder Failed:", e); }
});
