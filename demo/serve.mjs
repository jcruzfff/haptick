// Builds the demo and serves it on your network, so a phone on the same Wi-Fi
// can open it over plain http. Rebuilds on every page load. Ctrl+C to stop.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { buildDemo } from './build.mjs';

const port = Number(process.env.PORT ?? 8787);
const dist = new URL('dist/', import.meta.url);
const isLan = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (!(file in { 'index.html': 1, 'main.js': 1 })) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    if (file === 'index.html') await buildDemo();
    const body = await readFile(new URL(file, dist));
    res.writeHead(200, { 'content-type': types[file.slice(file.lastIndexOf('.'))], 'cache-control': 'no-store' });
    res.end(body);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
}).listen(port, '0.0.0.0', () => {
  // Prefer a home/office LAN address over VPN ones (Tailscale's 100.x).
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((net) => net?.family === 'IPv4' && !net.internal)
    .map((net) => net.address)
    .sort((a, b) => Number(isLan(b)) - Number(isLan(a)))[0];
  console.log(`\n  On this computer: http://localhost:${port}/`);
  if (lan) console.log(`  On your phone:    http://${lan}:${port}/   (same Wi-Fi; add ?debug to see the switches)`);
  console.log('');
});
