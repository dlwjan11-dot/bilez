import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, OUTPUT, SCREENSHOTS, RESULTS, LOG_FILE } from './helpers.mjs';

// Always test the current source: regenerate fixtures, rebuild dist/, start from clean output folders.
export default async function globalSetup() {
    execSync('node tests/fixtures/generate.mjs', { cwd: ROOT, stdio: 'inherit' });
    execSync('npx vite build --logLevel error', { cwd: ROOT, stdio: 'inherit' });
    for (const dir of [OUTPUT, SCREENSHOTS]) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(RESULTS, { recursive: true });
    fs.rmSync(LOG_FILE, { force: true });
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}
