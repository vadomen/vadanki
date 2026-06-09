import { chromium } from 'playwright';

const br = await chromium.launch({ headless: true });
const page = await br.newPage();

await page.goto('http://localhost:3000');
await page.click('[data-tab="register"]');
await page.fill('#reg-email', `csv_${Date.now()}@x.com`);
await page.fill('#reg-password', 'password123');
await page.click('#register-form [type="submit"]');
await page.waitForURL('**/decks.html');

await page.click('#new-deck-btn');
await page.fill('[name="name"]', 'Spanish');
await page.click('#new-deck-form [type="submit"]');
await page.waitForSelector('.deck-card');

await page.click('[data-action="cards"]');
await page.waitForSelector('.io-bar', { timeout: 4000 });

await page.screenshot({ path: 'scripts/screen-csv-panel.png', fullPage: true });

console.log('io-bar visible:', await page.isVisible('.io-bar'));
console.log('export link:', await page.$eval('a[download]', el => el.textContent.trim()));
console.log('import label:', await page.$eval('.io-import-label', el => el.textContent.trim()));

await br.close();
