// End-to-end smoke test in a real browser at phone size. Builds nothing
// itself: run `npm run build` first. Usage: npm run smoke
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let step = 0;
const check = (cond, msg) => { if (!cond) throw new Error(`FAILED: ${msg}`); console.log(`  ✓ ${msg}`); };
const settle = (ms = 700) => page.waitForTimeout(ms); // let count-up animations finish
const shot = async (name) => { await settle(500); return page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png` }); };
const heroNum = async () => Number((await page.locator('.market-value').first().textContent()).replace(/[^0-9.]/g, ''));
const tab = (name) => page.locator('nav .tab', { hasText: name }).click();
const plus = () => page.getByRole('button', { name: 'Add something' }).click();
const noOverflow = () => page.evaluate(() => [...document.querySelectorAll('.scroll')].every((el) => el.scrollWidth <= el.clientWidth + 1));

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.market');
  await shot('home');

  check((await page.locator('.market-label').textContent()) === 'You owe suppliers', 'home leads with what you owe');
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'light look by default');
  const start = await heroNum();
  check(start > 0, `owed is a real number (${start})`);
  const nav = await page.locator('.tabbar').boundingBox();
  check(Math.abs(nav.y + nav.height - 844) <= 1, 'tab bar sits on the bottom edge');

  // No sideways overflow on any main screen, at small, normal and big phones.
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const t of ['Home', 'Bills', 'Suppliers', 'Deals']) { await tab(t); await settle(150); if (!(await noOverflow())) throw new Error(`FAILED: ${t} overflows at ${width}px`); }
    check(true, `no sideways overflow on any tab at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await tab('Home');

  // Four chart views, and the number follows the view and your finger.
  const label = () => page.locator('.market-label').textContent();
  const ch = await page.locator('.market .chart').boundingBox();
  await page.mouse.move(ch.x + ch.width * 0.3, ch.y + ch.height / 2);
  check(/^Owed /.test(await label()), `dragging over the owed chart shows that day (${await label()})`);
  await page.mouse.move(ch.x + ch.width * 0.9, ch.y + ch.height / 2);
  check(/^Left after /.test(await label()), 'past today it shows what is left after bills are paid');
  await page.mouse.move(ch.x + ch.width / 2, ch.y - 120);
  await settle(200);
  await page.locator('.period', { hasText: '1Y' }).click();
  check((await page.locator('.market-change').textContent()).includes('in a year'), 'owed range changes the comparison');
  await page.locator('.period', { hasText: '3M' }).click();
  await page.getByRole('tab', { name: 'Mix' }).click();
  check(await page.locator('.market .donut').count() === 1 && (await label()).startsWith('Spent'), 'Mix shows who takes your money');
  await page.getByRole('tab', { name: 'Shock' }).click();
  check(await page.locator('.market .gauge').count() === 1 && (await label()).startsWith('Bill shock'), 'Shock shows the gauge');
  await shot('shock');
  await page.getByRole('tab', { name: 'Spend' }).click();

  // Dots: each one is a period total; tapping one says what it is.
  check(await page.locator('.dots-legend').getByText('Each dot is a week').count() === 1, '3M shows one dot per week');
  const tapDot = async (sel, n) => { const b = await page.locator(sel).nth(n).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  await tapDot('.dot:not(.dot-due)', 3);
  check(/^(Week of|Last 7 days)/.test(await page.locator('.dot-title').textContent()), 'tapping a past dot names its week');
  await tapDot('.dot-due', 2);
  check((await page.locator('.dot-due').nth(2).getAttribute('aria-pressed')) === 'true', 'close-together due dots can each be picked');
  check((await page.locator('.dot-title').textContent()).startsWith('Due week of'), 'tapping a hollow dot shows what is due that week');
  await page.locator('.period', { hasText: '1M' }).click();
  check(await page.locator('.dots-legend').getByText('Each dot is a day').count() === 1, '1M shows one dot per day');
  await page.locator('.period', { hasText: '1Y' }).click();
  check(await page.locator('.dot:not(.dot-due)').count() === 12, '1Y shows twelve month dots');
  await shot('dots-year');
  await page.locator('.period', { hasText: '3M' }).click();
  await page.getByRole('tab', { name: 'Owed' }).click();

  // "Needs you" groups three new bills into one row that leads to them.
  await page.locator('.todo', { hasText: '3 new bills to check' }).getByRole('button', { name: 'Check', exact: true }).click();
  check(await page.getByRole('tab', { name: /To check · 3/ }).getAttribute('aria-selected') === 'true', 'the new-bills row opens the bills to check');
  await page.getByRole('button', { name: "It's right — add it" }).first().click();
  await tab('Home');
  await settle();
  const afterConfirm = await heroNum();
  check(Math.abs(afterConfirm - start - 1284.5) < 0.01, `confirming adds the bill (${start} → ${afterConfirm})`);

  // Dispute something Watchdog caught.
  await page.locator('.todo', { hasText: 'Watchdog caught' }).getByRole('button', { name: 'See them', exact: true }).click();
  const caughtTotal = () => page.locator('.sheet .catch').count();
  const caughtBefore = await caughtTotal();
  await page.locator('.sheet .catch').first().getByRole('button', { name: 'Dispute' }).click();
  await shot('dispute');
  await page.getByRole('button', { name: "I've sent it" }).click();
  await settle(300);
  check((await caughtTotal()) < caughtBefore, `a disputed catch moves off the list (${caughtBefore} → ${await caughtTotal()})`);
  await page.goBack(); await settle(300);

  // Supplier page from a holding row; back gesture closes it.
  await page.locator('.holding').first().click();
  await page.waitForSelector('.fullscreen');
  check(await page.getByText('You owe them').count() === 1, 'supplier page shows what you owe them');
  check(await page.locator('.fullscreen a[href^="tel:"]').count() === 1, 'supplier page has a call button');
  await shot('supplier');
  await page.goBack();
  await settle(300);
  check(await page.locator('.fullscreen').count() === 0, 'back closes the supplier page');

  // Add a bill through the + button.
  await plus();
  await page.locator('.action', { hasText: 'Type in a bill' }).click();
  await page.getByLabel('Amount').fill('432.10');
  await page.getByRole('group', { name: 'Supplier' }).getByRole('button', { name: 'Middys' }).click();
  await page.getByPlaceholder('e.g. Smith reno').fill('Test job');
  await shot('add-bill');
  await page.getByRole('button', { name: 'Add bill', exact: true }).click();
  await settle();
  check(Math.abs((await heroNum()) - afterConfirm - 432.1) < 0.01, 'a bill added with + shows up in what you owe');

  // Add a supplier.
  await plus();
  await page.locator('.action', { hasText: 'Add a supplier' }).click();
  await page.getByLabel('Name').fill('Haymes Paint');
  await page.getByRole('button', { name: 'Add supplier' }).click();
  await tab('Suppliers');
  check(await page.locator('.holding', { hasText: 'Haymes Paint' }).count() === 1, 'new supplier appears in Suppliers');
  await shot('suppliers');

  // Bills: open one, mark paid, then edit another.
  await tab('Bills');
  await page.getByRole('tab', { name: 'To pay' }).click();
  const billsBefore = Number((await page.locator('.title + .num').textContent()).replace(/[^0-9.]/g, ''));
  await shot('bills');
  await page.locator('.bill').first().click();
  await page.getByRole('button', { name: 'Mark as paid' }).click();
  await settle();
  const billsAfter = Number((await page.locator('.title + .num').textContent()).replace(/[^0-9.]/g, ''));
  check(billsAfter < billsBefore, `marking a bill paid lowers what you owe (${billsBefore} → ${billsAfter})`);
  await page.locator('.bill').first().click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Amount').fill('111');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await settle(300);
  check(await page.getByText('Bill updated').count() === 1, 'a bill can be edited');

  // Try a buy → add as bill.
  await plus();
  await page.locator('.action', { hasText: 'Try a buy' }).click();
  await page.getByLabel('How much').fill('5000');
  check(await page.getByText("You'd pay it").count() === 1, 'try a buy shows when you would pay');
  await shot('try-buy');
  await page.getByRole('button', { name: /Bought it/ }).click();
  check((await page.getByLabel('Amount').inputValue()) === '5000', 'try a buy carries the amount into a new bill');
  await page.getByRole('button', { name: 'Add bill', exact: true }).click();

  // Prices + alert.
  await tab('Suppliers');
  await page.getByRole('tab', { name: 'Prices' }).click();
  await shot('prices');
  await page.locator('.holding').first().click();
  await page.getByRole('button', { name: /Set alert/ }).click();
  await settle(300);
  check(await page.getByText('alert on').count() >= 2, 'alert shows on the watched price');

  // Deals → counter mode → sign and lock.
  await tab('Deals');
  await shot('deals');
  await page.getByRole('button', { name: /Counter mode/ }).click();
  await page.getByRole('button', { name: /^Hide / }).nth(1).click();
  check(await page.getByText('Hidden', { exact: true }).count() === 1, 'a supplier can be hidden from the rep');
  await page.getByRole('button', { name: /Make a deal on the spot/ }).click();
  await page.getByRole('button', { name: 'Lock it in' }).click();
  check(await page.getByRole('alert').count() === 1, 'locking without reward and signatures is refused');
  await page.getByLabel('You give me').fill('Milwaukee Packout');
  await page.getByLabel("Rep's name").fill('Dave');
  for (const pad of await page.locator('.sig').all()) {
    await pad.scrollIntoViewIfNeeded();
    const b = await pad.boundingBox();
    await page.mouse.move(b.x + 20, b.y + 60);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + 20 + i * 18, b.y + 60 - Math.sin(i) * 25);
    await page.mouse.up();
  }
  await page.getByRole('button', { name: 'Lock it in' }).click();
  await page.waitForSelector('.stamp');
  await page.locator('.stamp').scrollIntoViewIfNeeded();
  await shot('counter-locked');
  await page.goBack();
  await settle(300);
  check(await page.getByText('Reward: Milwaukee Packout · with Dave').count() === 1, 'the new deal shows in Deals');

  // Everything survives a reload.
  await page.reload();
  await tab('Deals');
  check(await page.getByText('Reward: Milwaukee Packout · with Dave').count() === 1, 'deal is still there after reload');
  await tab('Suppliers');
  check(await page.locator('.holding', { hasText: 'Haymes Paint' }).count() === 1, 'added supplier is still there after reload');

  // Dark look from Account, and back.
  await tab('Home');
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('tab', { name: 'Dark' }).click();
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark look can be switched on');
  await page.goBack(); await settle(300);
  await shot('home-dark');
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('tab', { name: 'Light' }).click();

  // Start fresh with your own bills.
  await page.getByRole('button', { name: 'Start with my own bills' }).click();
  await page.getByRole('button', { name: /clear it and start fresh/ }).click();
  await settle();
  check(await page.getByText('Treat your suppliers like a portfolio.').count() === 1, 'starting fresh shows the welcome screen');
  await shot('fresh-home');
  await plus();
  await page.locator('.action', { hasText: 'Type in a bill' }).click();
  await page.getByLabel('Amount').fill('250');
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByLabel('New supplier name').fill('Local Electrical');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Add bill', exact: true }).click();
  await settle();
  check((await heroNum()) === 250, 'first real bill with a brand-new supplier works');
  await shot('fresh-first-bill');

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
