// Bundles the demo into demo/dist: open dist/index.html, or deploy the folder
// anywhere static (GitHub Pages serves it over HTTPS for phones).
import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const dir = new URL('.', import.meta.url);
const out = new URL('dist/', dir);

export async function buildDemo() {
  await mkdir(out, { recursive: true });
  await build({
    entryPoints: [new URL('main.ts', dir).pathname],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'safari16',
    outfile: new URL('main.js', out).pathname,
    logLevel: 'warning',
  });
  await copyFile(new URL('index.html', dir), new URL('index.html', out));
}

if (import.meta.url === `file://${process.argv[1]}`) await buildDemo();
