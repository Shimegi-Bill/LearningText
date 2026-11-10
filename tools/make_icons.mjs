// 整主畫面圖示（真 PNG，iPhone 唔收 SVG／data URI）
// 用 Make Me a Hanzi「字」嘅筆畫，部分筆畫用橙色（好似揀咗）
// 用法：node tools/make_icons.mjs <dataDir>   （要有 Playwright）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'char-puzzle');
const dataDir = process.argv[2];

let zi = null;
for (const line of fs.readFileSync(path.join(dataDir, 'graphics.txt'), 'utf8').split('\n')) {
  if (line.includes('"character":"字"')) { zi = JSON.parse(line); break; }
}
const SEL = new Set([3, 4, 5]); // 「子」嘅三筆
const paths = zi.strokes.map((d, i) => `<path d="${d}" fill="${SEL.has(i) ? '#ff5a2c' : '#2f3e4e'}" stroke="#fff" stroke-width="16" paint-order="stroke"/>`).join('');
const svg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8efe1"/><stop offset="1" stop-color="#fff1c9"/></linearGradient></defs>
<rect width="1024" height="1024" fill="url(#g)"/>
<rect x="${pad}" y="${pad}" width="${1024 - 2 * pad}" height="${1024 - 2 * pad}" rx="90" fill="#fff" stroke="#5fb39c" stroke-width="22"/>
<path d="M512 ${pad + 20}V${1024 - pad - 20}M${pad + 20} 512H${1024 - pad - 20}" stroke="#9ed5c5" stroke-width="12" stroke-dasharray="40 30"/>
<g transform="translate(512 512) scale(0.78) translate(-512 -512) scale(1,-1) translate(0,-900)">${paths}</g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [['apple-touch-icon.png', 180, 70], ['icon-192.png', 192, 70], ['icon-512.png', 512, 70], ['icon-maskable-512.png', 512, 150]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(size, pad)}</body></html>`);
  await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}
await browser.close();
