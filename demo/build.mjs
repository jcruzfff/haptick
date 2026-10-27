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
  // Fonts are self-hosted so the page makes no third-party requests. Geist is
  // under the SIL Open Font License, which travels with the files.
  const fonts = new URL('fonts/', out);
  const geist = new URL('../node_modules/geist/', dir);
  await mkdir(fonts, { recursive: true });
  await copyFile(new URL('dist/fonts/geist-sans/Geist-Variable.woff2', geist), new URL('Geist-Variable.woff2', fonts));
  await copyFile(new URL('dist/fonts/geist-mono/GeistMono-Variable.woff2', geist), new URL('GeistMono-Variable.woff2', fonts));
  await copyFile(new URL('LICENSE.txt', geist), new URL('OFL.txt', fonts));
}

if (import.meta.url === `file://${process.argv[1]}`) await buildDemo();
