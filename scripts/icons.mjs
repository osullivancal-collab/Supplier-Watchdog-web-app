// Renders public/icon.svg into the PNG sizes phones need. Run once after
// changing the icon: node scripts/icons.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
for (const [size, file, pad] of [[180, 'icon-180.png', 0], [192, 'icon-192.png', 0], [512, 'icon-512.png', 0], [512, 'icon-512-maskable.png', 0.12]]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  // Maskable icons need a full-bleed background with the mark inside the safe zone.
  await page.setContent(`<body style="margin:0;background:#0A0C0F;display:flex;align-items:center;justify-content:center;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`);
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: false });
}
await browser.close();
console.log('icons written');
