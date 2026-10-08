// End-to-end smoke test in a real browser at iPhone size (390×844).
// Builds nothing itself: run `npm run build` first. Usage: npm run smoke
// Screenshots go to $SHOTS (default ./smoke-shots).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4179;
const SHOTS = process.env.SHOTS || 'smoke-shots';
mkdirSync(SHOTS, { recursive: true });

const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((ok, fail) => {
  server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) ok(); });
  server.on('exit', () => fail(new Error('preview server exited')));
  setTimeout(() => fail(new Error('preview server did not start')), 20000);
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fonts.g')) errors.push(m.text()); });

let step = 0;
const check = (cond, msg) => { if (!cond) throw new Error(`FAILED: ${msg}`); console.log(`  ✓ ${msg}`); };
const shot = async (name) => { await page.waitForTimeout(450); return page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png` }); };
const owed = async () => Number((await page.locator('.hero-value').textContent()).replace(/[^0-9.]/g, ''));

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.hero-value');
  await shot('market');

  check((await page.locator('.hero-label').textContent()) === 'Owed to suppliers', 'home shows what is owed');
  const before = await owed();
  check(before > 0, `owed is a real number (${before})`);

  // The tab bar must sit at the bottom of the screen, fully visible.
  const nav = await page.locator('.tabbar').boundingBox();
  check(Math.abs(nav.y + nav.height - 844) <= 1, `tab bar sits at the bottom edge (${nav.y + nav.height}px)`);

  // No sideways scrolling anywhere on the home screen.
  check(await page.evaluate(() => document.querySelector('.scroll').scrollWidth <= 390), 'no horizontal overflow');

  // Drag on the chart: past half shows a day, right half shows what is due.
  const chart = await page.locator('.chart').boundingBox();
  await page.mouse.move(chart.x + chart.width * 0.4, chart.y + 100);
  const pastLabel = await page.locator('.hero-label').textContent();
  check(pastLabel !== 'Owed to suppliers', `hovering the past shows a day (“${pastLabel}”)`);
  await page.mouse.move(chart.x + chart.width * 0.9, chart.y + 100);
  check((await page.locator('.hero-label').textContent()).startsWith('Still owed after'), 'hovering the future shows what is still owed');
  await shot('scrub-ahead');
  await page.mouse.move(5, 5);

  // Confirm the incoming bill: owed goes up, badge goes down.
  await page.getByRole('button', { name: 'Confirm' }).first().click();
  await page.waitForTimeout(200);
  const after = await owed();
  check(Math.abs(after - before - 1284.5) < 0.01, `confirming adds the bill to what is owed (${before} → ${after})`);
  check((await page.locator('.badge').textContent()) === '2', 'bills badge drops to 2');

  for (const v of ['Monthly', 'Mix', 'Shock']) {
    await page.getByRole('tab', { name: v }).click();
    await shot(v.toLowerCase());
  }
  check(/\d+ \/ 100/.test(await page.locator('.hero-value').textContent()), 'shock view shows a score');

  // Supplier page opens and the back button closes it.
  await page.getByRole('tab', { name: 'Owed' }).click();
  await page.locator('.row').first().click();
  await page.waitForSelector('.fullscreen');
  await shot('supplier');
  await page.goBack();
  await page.waitForTimeout(200);
  check(await page.locator('.fullscreen').count() === 0, 'phone back button closes the supplier page');

  // Bills: marking paid lowers the total.
  await page.getByRole('button', { name: /^Bills/ }).click();
  await shot('bills');
  const paidBtn = page.getByRole('button', { name: /^Mark .* paid$/ }).first();
  await paidBtn.click();
  await page.getByRole('button', { name: 'Market', exact: true }).click();
  check((await owed()) < after, 'marking a bill paid lowers what is owed');

  // Watch: set a price alert.
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  await shot('watch');
  await page.locator('.row').first().click();
  await page.getByRole('button', { name: 'Set alert' }).click();
  await page.waitForTimeout(200);
  check(await page.locator('[aria-label="Alert set"]').count() >= 2, 'alert icon appears on the watched item');

  // League → Counter mode: hide a supplier, make and sign a deal.
  await page.getByRole('button', { name: 'League', exact: true }).click();
  await shot('league');
  await page.getByRole('button', { name: 'Counter mode' }).click();
  await page.getByRole('button', { name: /^Hide / }).nth(1).click();
  check(await page.getByText('Hidden', { exact: true }).count() === 1, 'a supplier can be hidden from the rep');
  await page.getByRole('button', { name: 'Make a deal on the spot' }).click();
  await page.getByRole('button', { name: 'Lock it in' }).click();
  check(await page.getByRole('alert').count() === 1, 'locking without a reward or signatures is refused');
  await page.getByLabel('You give me').fill('Milwaukee Packout');
  await page.getByLabel("Rep's name").fill('Dave');
  for (const pad of await page.locator('.sig').all()) {
    const b = await pad.boundingBox();
    await page.mouse.move(b.x + 20, b.y + 60);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + 20 + i * 18, b.y + 60 - Math.sin(i) * 25);
    await page.mouse.up();
  }
  await shot('counter-signed');
  await page.getByRole('button', { name: 'Lock it in' }).click();
  await page.waitForSelector('.stamp');
  await shot('counter-locked');
  check(true, 'deal locked with both signatures');
  await page.goBack();
  await page.waitForTimeout(200);
  check(await page.getByText('Milwaukee Packout · signed with Dave').count() === 1, 'new deal appears in League');

  // State survives a reload.
  await page.reload();
  await page.getByRole('button', { name: 'League', exact: true }).click();
  check(await page.getByText('Milwaukee Packout · signed with Dave').count() === 1, 'deal is still there after reload');

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log(`\nSmoke test passed. Screenshots in ${SHOTS}/`);
} catch (e) {
  await shot('failure').catch(() => {});
  console.error(e.message);
  if (errors.length) console.error('Console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
