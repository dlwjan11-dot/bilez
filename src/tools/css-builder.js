export function initCssBuilder() {
    const shadowTab = document.getElementById('cssb-tab-shadow');
    const gradientTab = document.getElementById('cssb-tab-gradient');
    const shadowPanel = document.getElementById('cssb-shadow-panel');
    const gradientPanel = document.getElementById('cssb-gradient-panel');

    if (!shadowTab) return;

    function switchTab(tab) {
        [shadowTab, gradientTab].forEach(btn => {
            const active = btn.dataset.tab === tab;
            btn.classList.toggle('bg-blue-600', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('border-blue-600', active);
            btn.classList.toggle('bg-slate-50', !active);
            btn.classList.toggle('text-slate-600', !active);
            btn.classList.toggle('border-slate-200', !active);
        });
        shadowPanel.classList.toggle('hidden', tab !== 'shadow');
        gradientPanel.classList.toggle('hidden', tab !== 'gradient');
    }

    shadowTab.addEventListener('click', () => switchTab('shadow'));
    gradientTab.addEventListener('click', () => switchTab('gradient'));

    // ── Box Shadow ────────────────────────────────────────────────────
    initShadowBuilder();
    initGradientBuilder();

    function initShadowBuilder() {
        const preview = document.getElementById('cssb-shadow-preview');
        const outputEl = document.getElementById('cssb-shadow-output');
        const copyBtn = document.getElementById('cssb-shadow-copy');
        const addBtn = document.getElementById('cssb-shadow-add');
        const layersList = document.getElementById('cssb-shadow-layers');

        let shadows = [defaultShadow()];

        function defaultShadow() {
            return { x: 4, y: 4, blur: 10, spread: 0, color: '#000000', opacity: 30, inset: false };
        }

        function renderLayers() {
            layersList.innerHTML = '';
            shadows.forEach((s, i) => {
                const div = document.createElement('div');
                div.className = 'bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3';
                div.innerHTML = `
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Layer ${i + 1}</span>
                        ${shadows.length > 1 ? `<button class="cssb-shadow-remove text-[10px] text-red-400 hover:text-red-600 font-bold" data-i="${i}">Remove</button>` : ''}
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        ${slider('H Offset', `cssb-sx-${i}`, s.x, -50, 50)}
                        ${slider('V Offset', `cssb-sy-${i}`, s.y, -50, 50)}
                        ${slider('Blur', `cssb-sb-${i}`, s.blur, 0, 100)}
                        ${slider('Spread', `cssb-ss-${i}`, s.spread, -50, 50)}
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-2">
                            <label class="text-xs font-semibold text-slate-500">Color</label>
                            <input type="color" id="cssb-sc-${i}" value="${s.color}" class="w-8 h-8 rounded cursor-pointer border border-slate-200">
                        </div>
                        <div class="flex items-center gap-2 flex-1">
                            <label class="text-xs font-semibold text-slate-500 whitespace-nowrap">Opacity <span id="cssb-so-label-${i}">${s.opacity}%</span></label>
                            <input type="range" id="cssb-so-${i}" min="0" max="100" value="${s.opacity}" class="flex-1">
                        </div>
                        <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                            <input type="checkbox" id="cssb-si-${i}" ${s.inset ? 'checked' : ''} class="rounded">
                            Inset
                        </label>
                    </div>
                `;
                layersList.appendChild(div);

                const getEl = id => document.getElementById(id);
                const watchInput = (id, key, parse = Number) => {
                    const el = getEl(id);
                    if (el) el.addEventListener('input', () => {
                        shadows[i][key] = parse(el.value);
                        if (key === 'opacity') getEl(`cssb-so-label-${i}`).textContent = el.value + '%';
                        updateShadow();
                    });
                };
                watchInput(`cssb-sx-${i}`, 'x');
                watchInput(`cssb-sy-${i}`, 'y');
                watchInput(`cssb-sb-${i}`, 'blur');
                watchInput(`cssb-ss-${i}`, 'spread');
                watchInput(`cssb-sc-${i}`, 'color', v => v);
                watchInput(`cssb-so-${i}`, 'opacity');
                const insetEl = getEl(`cssb-si-${i}`);
                if (insetEl) insetEl.addEventListener('change', () => { shadows[i].inset = insetEl.checked; updateShadow(); });
            });

            layersList.querySelectorAll('.cssb-shadow-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    shadows.splice(parseInt(btn.dataset.i), 1);
                    renderLayers();
                    updateShadow();
                });
            });
        }

        function slider(label, id, val, min, max) {
            return `<div>
                <div class="flex justify-between mb-1"><label class="text-[10px] font-semibold text-slate-500">${label}</label><span id="${id}-v" class="text-[10px] font-bold text-blue-600">${val}px</span></div>
                <input type="range" id="${id}" min="${min}" max="${max}" value="${val}" class="w-full">
            </div>`;
        }

        function hexToRgba(hex, opacity) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r},${g},${b},${(opacity / 100).toFixed(2)})`;
        }

        function updateShadow() {
            // Update slider value labels
            shadows.forEach((s, i) => {
                ['x','y','b','s'].forEach((k, ki) => {
                    const keys = ['x','y','blur','spread'];
                    const ids = [`cssb-sx-${i}`, `cssb-sy-${i}`, `cssb-sb-${i}`, `cssb-ss-${i}`];
                    const labelEl = document.getElementById(ids[ki] + '-v');
                    if (labelEl) labelEl.textContent = s[keys[ki]] + 'px';
                });
            });

            const css = shadows.map(s => {
                const rgba = hexToRgba(s.color, s.opacity);
                return `${s.inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${rgba}`;
            }).join(',\n             ');

            preview.style.boxShadow = shadows.map(s => {
                const rgba = hexToRgba(s.color, s.opacity);
                return `${s.inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${rgba}`;
            }).join(', ');

            outputEl.textContent = `box-shadow: ${css};`;
        }

        addBtn.addEventListener('click', () => {
            shadows.push(defaultShadow());
            renderLayers();
            updateShadow();
        });

        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(outputEl.textContent);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = 'Copy CSS', 1500);
        });

        renderLayers();
        updateShadow();
    }

    // ── Gradient Builder ──────────────────────────────────────────────
    function initGradientBuilder() {
        const preview = document.getElementById('cssb-grad-preview');
        const outputEl = document.getElementById('cssb-grad-output');
        const copyBtn = document.getElementById('cssb-grad-copy');
        const typeLinear = document.getElementById('cssb-grad-linear');
        const typeRadial = document.getElementById('cssb-grad-radial');
        const angleRow = document.getElementById('cssb-grad-angle-row');
        const angleSlider = document.getElementById('cssb-grad-angle');
        const angleLabel = document.getElementById('cssb-grad-angle-label');
        const stopsContainer = document.getElementById('cssb-grad-stops');
        const addStopBtn = document.getElementById('cssb-grad-add-stop');

        let gradType = 'linear';
        let angle = 135;
        let stops = [
            { color: '#6366f1', pos: 0 },
            { color: '#06b6d4', pos: 100 },
        ];

        function renderStops() {
            stopsContainer.innerHTML = '';
            stops.forEach((stop, i) => {
                const div = document.createElement('div');
                div.className = 'flex items-center gap-3';
                div.innerHTML = `
                    <input type="color" id="cssb-stop-c-${i}" value="${stop.color}" class="w-8 h-8 rounded cursor-pointer border border-slate-200 shrink-0">
                    <div class="flex items-center gap-2 flex-1">
                        <input type="range" id="cssb-stop-p-${i}" min="0" max="100" value="${stop.pos}" class="flex-1">
                        <span id="cssb-stop-p-label-${i}" class="text-xs font-bold text-blue-600 w-8 text-right">${stop.pos}%</span>
                    </div>
                    ${stops.length > 2 ? `<button class="cssb-stop-remove text-[10px] text-red-400 hover:text-red-600 font-bold shrink-0" data-i="${i}">×</button>` : '<div class="w-4 shrink-0"></div>'}
                `;
                stopsContainer.appendChild(div);

                document.getElementById(`cssb-stop-c-${i}`).addEventListener('input', e => { stops[i].color = e.target.value; updateGradient(); });
                const posEl = document.getElementById(`cssb-stop-p-${i}`);
                posEl.addEventListener('input', () => {
                    stops[i].pos = parseInt(posEl.value);
                    document.getElementById(`cssb-stop-p-label-${i}`).textContent = posEl.value + '%';
                    updateGradient();
                });
            });

            stopsContainer.querySelectorAll('.cssb-stop-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    stops.splice(parseInt(btn.dataset.i), 1);
                    renderStops();
                    updateGradient();
                });
            });
        }

        function updateGradient() {
            const sorted = [...stops].sort((a, b) => a.pos - b.pos);
            const stopStr = sorted.map(s => `${s.color} ${s.pos}%`).join(', ');
            let css;
            if (gradType === 'linear') {
                css = `linear-gradient(${angle}deg, ${stopStr})`;
            } else {
                css = `radial-gradient(circle, ${stopStr})`;
            }
            preview.style.background = css;
            outputEl.textContent = `background: ${css};`;
        }

        typeLinear.addEventListener('click', () => {
            gradType = 'linear';
            typeLinear.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            typeLinear.classList.remove('bg-slate-50', 'text-slate-600', 'border-slate-200');
            typeRadial.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            typeRadial.classList.add('bg-slate-50', 'text-slate-600', 'border-slate-200');
            angleRow.classList.remove('hidden');
            updateGradient();
        });

        typeRadial.addEventListener('click', () => {
            gradType = 'radial';
            typeRadial.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            typeRadial.classList.remove('bg-slate-50', 'text-slate-600', 'border-slate-200');
            typeLinear.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            typeLinear.classList.add('bg-slate-50', 'text-slate-600', 'border-slate-200');
            angleRow.classList.add('hidden');
            updateGradient();
        });

        angleSlider.addEventListener('input', () => {
            angle = parseInt(angleSlider.value);
            angleLabel.textContent = angle + '°';
            updateGradient();
        });

        addStopBtn.addEventListener('click', () => {
            stops.push({ color: '#f59e0b', pos: 50 });
            renderStops();
            updateGradient();
        });

        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(outputEl.textContent);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = 'Copy CSS', 1500);
        });

        renderStops();
        updateGradient();
    }
}
