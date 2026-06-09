import { chromium } from 'playwright';

const br = await chromium.launch({ headless: true });
const page = await br.newPage();

await page.goto('http://localhost:3000');
await page.click('[data-tab="register"]');
await page.fill('#reg-email', `html_${Date.now()}@x.com`);
await page.fill('#reg-password', 'password123');
await page.click('#register-form [type="submit"]');
await page.waitForURL('**/decks.html');

// Create deck
await page.click('#new-deck-btn');
await page.fill('[name="name"]', 'English Vocab');
await page.fill('[name="sourceLang"]', 'en');
await page.fill('[name="targetLang"]', 'uk');
await page.click('#new-deck-form [type="submit"]');
await page.waitForSelector('.deck-card');

// Import the sample CSV
await page.click('[data-action="cards"]');
await page.waitForSelector('.add-card-form', { timeout: 4000 });

const csv = `Front,Back
"Relentless","<b>Невблаганний, безперервний, наполегливий/завзятий</b><br><i>Our team's relentless pursuit of perfection paid off.</i>"
"Obsessive","<b>Одержимий, нав'язливий, маніакальний</b><br><i>He has an obsessive attention to detail.</i>"
"One-off","<b>Одноразовий, унікальний (випадок/проєкт), експрес-завдання</b><br><i>This isn't a permanent task, just a one-off request from the CEO.</i>"`;

// Upload via file chooser
const [fc] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('.io-import-label'),
]);
await fc.setFiles([{ name: 'vocab.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }]);

await page.waitForSelector('.card-row', { timeout: 6000 });
await page.screenshot({ path: 'scripts/screen-import-list.png', fullPage: true });

// Study the first card
await page.click('[href*="study.html"]');
await page.waitForURL('**/study.html**');
await page.waitForSelector('#card-front-text');
await page.screenshot({ path: 'scripts/screen-study-front-html.png' });

// Flip it
await page.click('#flip-btn');
await page.waitForSelector('#grade-buttons:not([hidden])');
await page.screenshot({ path: 'scripts/screen-study-back-html.png' });

console.log('front text:', await page.textContent('#card-front-text'));
console.log('back innerHTML:', await page.innerHTML('#card-back-text'));

await br.close();
