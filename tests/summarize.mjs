// Prints a compact list of every failed check from the last `npm test` run.
import fs from 'node:fs';
import path from 'node:path';
import { RESULTS } from './helpers.mjs';

const results = JSON.parse(fs.readFileSync(path.join(RESULTS, 'results.json'), 'utf8'));
const strip = (s) => (s || '').replace(/\x1b\[[0-9;]*m/g, '');
let failed = 0;
let passed = 0;

function walk(suite, trail) {
    for (const spec of suite.specs || []) {
        for (const t of spec.tests) {
            const res = t.results[t.results.length - 1];
            if (!res) continue;
            if (res.status === 'passed') { passed++; continue; }
            failed++;
            console.log(`\n✗ ${[...trail, spec.title].join(' › ')}  [${res.status}]`);
            for (const e of res.errors || []) {
                const lines = strip(e.message).split('\n').filter(Boolean);
                console.log('   - ' + lines.slice(0, 8).join('\n     ').slice(0, 700));
            }
        }
    }
    for (const child of suite.suites || []) walk(child, [...trail, child.title]);
}

for (const s of results.suites) walk(s, []);
console.log(`\n${passed} passed, ${failed} failed`);
