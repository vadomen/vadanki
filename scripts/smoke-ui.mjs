import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const EMAIL = `smoke_${Date.now()}@example.com`;
const PASS = 'password123';

const br = await chromium.launch({ headless: true });
const page = await br.newPage();
page.on('console', m => console.log('[browser]', m.text()));

let ok = true;
function check(label, cond) {
  console.log((cond ? '✅' : '❌'), label);
  if (!cond) ok = false;
}

// ── 1. Login page renders ─────────────────────────────────────────────────────
await page.goto(BASE);
await page.screenshot({ path: 'scripts/screen-1-login.png' });
check('Login page title visible', await page.isVisible('.auth-logo'));
check('Login form present', await page.isVisible('#login-form'));

// ── 2. Register ───────────────────────────────────────────────────────────────
await page.click('[data-tab="register"]');
await page.fill('#reg-email', EMAIL);
await page.fill('#reg-password', PASS);
await page.click('#register-form [type="submit"]');
await page.waitForURL('**/decks.html', { timeout: 8000 });
await page.screenshot({ path: 'scripts/screen-2-decks.png' });
check('Landed on decks page', page.url().includes('decks.html'));
check('New Deck button visible', await page.isVisible('#new-deck-btn'));

// ── 3. Create a deck ──────────────────────────────────────────────────────────
await page.click('#new-deck-btn');
await page.fill('[name="name"]', 'French Test');
await page.fill('[name="sourceLang"]', 'en');
await page.fill('[name="targetLang"]', 'fr');
await page.click('#new-deck-form [type="submit"]');
await page.waitForSelector('.deck-card', { timeout: 5000 });
await page.screenshot({ path: 'scripts/screen-3-deck-created.png' });
check('Deck card appeared', await page.isVisible('.deck-card'));
check('Deck name correct', (await page.textContent('.deck-name')) === 'French Test');

// ── 4. Add a card ─────────────────────────────────────────────────────────────
await page.click('[data-action="cards"]');
await page.waitForSelector('.add-card-form', { timeout: 4000 });
await page.fill('[name="front"]', 'hello');
await page.fill('[name="back"]', 'bonjour');
await page.click('.add-card-form [type="submit"]');
await page.waitForSelector('.card-row', { timeout: 8000 });
await page.screenshot({ path: 'scripts/screen-4-card-added.png' });
check('Card row visible', await page.isVisible('.card-row'));
check('Card front text correct', (await page.textContent('.card-front-text')).trim() === 'hello');

// ── 5. Study: flip + grade ────────────────────────────────────────────────────
await page.click('.btn-primary[href*="study.html"]');
await page.waitForURL('**/study.html**', { timeout: 5000 });
await page.waitForSelector('.card-word', { timeout: 5000 });
await page.screenshot({ path: 'scripts/screen-5-study-front.png' });
check('Study page loaded', await page.isVisible('#study-card'));
check('Card front shown', (await page.textContent('#card-front-text')).trim() === 'hello');
check('Grade buttons hidden before flip', await page.isHidden('#grade-buttons'));

await page.click('#flip-btn');
await page.waitForSelector('#grade-buttons:not([hidden])', { timeout: 3000 });
await page.screenshot({ path: 'scripts/screen-6-study-flipped.png' });
check('Card flipped (back visible)', await page.isVisible('#grade-buttons'));
check('Translation shown', (await page.textContent('#card-back-text')).trim() === 'bonjour');

await page.click('.grade-good');
await page.waitForSelector('#done-screen:not([hidden])', { timeout: 5000 });
await page.screenshot({ path: 'scripts/screen-7-after-grade.png' });
check('Done screen shown after grading', await page.isVisible('#done-screen'));

await br.close();
console.log('\n' + (ok ? '✅ All checks passed' : '❌ Some checks failed'));
process.exit(ok ? 0 : 1);
