// Laddar plugin/ui.html i Chromium, matar in resultatet och sparar PDF:en.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'out');
  const result = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'));
  const png = [...fs.readFileSync(path.join(out, 'startsida.png'))];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 440, height: 640 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '../plugin/ui.html'));
  await page.evaluate((r) => window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: r } })), result);
  await page.screenshot({ path: path.join(out, 'plugin-ui.png') });
  const dl = page.waitForEvent('download');
  await page.click('#pdf');
  await page.evaluate(([id, bytes]) => window.dispatchEvent(new MessageEvent('message',
    { data: { pluginMessage: { type: 'images', images: { [id]: new Uint8Array(bytes) } } } })), [result.frames[0].id, png]);
  const d = await dl;
  await d.saveAs(path.join(out, 'exempelrapport.pdf'));
  console.log('PDF sparad', errors.length ? errors : 'inga fel');
  await browser.close();
})();
