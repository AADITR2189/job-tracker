/* Captures manifest screenshots (install dialog) using the app's built-in sample data.
   Usage: npx http-server -p 8080 . & node tools/generate-screenshots.js */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['wide', { width: 1280, height: 800 }], ['narrow', { width: 390, height: 844 }]]) {
    const c = await b.newContext({ viewport: vp, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const p = await c.newPage();
    await p.goto(process.env.BASE || 'http://localhost:8080/');
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(__dirname, '..', `icons/screenshot-${name}.png`) });
    await c.close();
  }
  await b.close();
})();
