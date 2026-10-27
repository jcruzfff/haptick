// Builds the demo and serves it on your network, so a phone on the same Wi-Fi
// can open it over plain http. Rebuilds on every page load. Ctrl+C to stop.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { buildDemo } from './build.mjs';

const port = Number(process.env.PORT ?? 8787);
const dist = new URL('dist/', import.meta.url);
const isLan = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
// The only files served: nothing else on disk is reachable.
const files = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ['main.js', 'text/javascript; charset=utf-8'],
  ['fonts/Geist-Variable.woff2', 'font/woff2'],
  ['fonts/GeistMono-Variable.woff2', 'font/woff2'],
  ['fonts/OFL.txt', 'text/plain; charset=utf-8'],
]);

const lanAddress = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((net) => net?.family === 'IPv4' && !net.internal)
    .map((net) => net.address)
    // Prefer a home/office LAN address over VPN ones (Tailscale's 100.x).
    .sort((a, b) => Number(isLan(b)) - Number(isLan(a)))[0];

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  // The demo's QR code points phones here instead of at localhost.
  if (path === '/lan.json') {
    const lan = lanAddress();
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ url: lan ? `http://${lan}:${port}/` : null }));
    return;
  }
  const file = path === '/' ? 'index.html' : path.slice(1);
  const type = files.get(file);
  if (!type) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    if (file === 'index.html') await buildDemo();
    const body = await readFile(new URL(file, dist));
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(body);
  } catch (error) {
    console.error(error);
    res.writeHead(500).end('Build failed; see the terminal.');
  }
}).listen(port, '0.0.0.0', () => {
  const lan = lanAddress();
  console.log(`\n  On this computer: http://localhost:${port}/`);
  if (lan) console.log(`  On your phone:    http://${lan}:${port}/   (same Wi-Fi; add ?debug to see the switches)`);
  console.log('');
});
