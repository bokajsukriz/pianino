const { chromium } = require('playwright');
(async () => {
  const wav = process.argv[2];
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto('http://localhost:8765/');
  await page.click('#plan-skip');
  await page.waitForSelector('#s-start:not([hidden])');
  console.log('start:', await page.textContent('#mix-label'), '|', await page.textContent('#song-status'));
  await page.screenshot({ path: 'shot-start.png' });
  await page.click('#go-mix');
  await page.waitForSelector('#modal:not([hidden])');
  console.log('modal:', await page.textContent('#modal-title'));
  await page.click('#modal-buttons [data-value="yes"]');
  if (process.env.ESS === '1') await page.click('#s-guided [data-toggle="essentia"]');
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(2500);
    const st = await page.evaluate(() => ({
      level: document.querySelector('#s-guided [data-f="level"]').textContent,
      count: document.querySelector('#s-guided [data-f="count"]').textContent,
      bpm: document.querySelector('#s-guided [data-f="bpm"]').textContent,
      now: document.querySelector('#s-guided [data-f="now"]').textContent,
      status: document.querySelector('#s-guided [data-f="status"]').textContent,
      dots: document.querySelectorAll('#s-guided .kb circle').length,
    }));
    console.log(i, JSON.stringify(st));
    if (i === 2 || i === 9) await page.screenshot({ path: `shot-guided-${i}.png` });
  }
  const db = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('pianino'); r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').getAll(); q.onsuccess = () => res(q.result.filter((x) => String(x.id).startsWith('phrase:') || x.id === 'settings')); }; }));
  console.log(JSON.stringify(db));
  console.log('LOGS', logs.join('\n'));
  await browser.close();
})();
