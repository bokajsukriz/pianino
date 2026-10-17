const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${process.argv[2]}`, '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  await page.goto('http://localhost:8765/');
  await page.waitForTimeout(500);
  await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('pianino'); r.onsuccess = () => { const s = r.result.transaction('meta', 'readwrite').objectStore('meta');
    s.put({ id: 'settings', plan: '', onboarded: true, click: true, melody: true, melodyLow: false, mic: true });
    s.put({ id: 'phrase:z1', mode: 'tempo', bpm: 56, streak: 0, bad: 0, solid: false, passes: 1, tempoErrors: 0, lastPlayed: '2026-10-16' });
    s.transaction.oncomplete = res; }; }));
  await page.reload();
  await page.waitForSelector('#s-start:not([hidden])');
  await page.click('#go-one');
  let seen = [];
  for (let i = 0; i < 44; i++) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => ({
      count: document.querySelector('#s-guided [data-f="count"]').textContent,
      status: document.querySelector('#s-guided [data-f="status"]').textContent,
      strip: [...document.querySelectorAll('#s-guided [data-f="strip"] li')].map((l) => l.textContent + (l.className.includes('hit') ? '✓' : l.className.includes('miss') ? '·' : '')).join(' '),
      level: document.querySelector('#s-guided [data-f="level"]').textContent,
      screen: document.querySelector('.screen:not([hidden])')?.dataset.screen,
    }));
    const line = JSON.stringify(st);
    if (seen.at(-1) !== line) { console.log(i, line); seen.push(line); }
    if (i === 30) await page.screenshot({ path: 'shot-tempo.png' });
  }
  console.log('LOGS', logs.join('\n'));
  await browser.close();
})();
