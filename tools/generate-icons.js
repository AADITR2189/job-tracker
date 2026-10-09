/* Generates PNG icons, maskable icons and iOS splash screens from assets/logo.svg.
   Usage: node tools/generate-icons.js   (needs Playwright + Chromium) */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const logo = fs.readFileSync(path.join(root, 'assets/logo.svg'), 'utf8');

// Maskable: full-bleed background, artwork inside the central 80% safe zone
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563EB"/><stop offset="1" stop-color="#14B8A6"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(136 136) scale(10)" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="5" r="3"/><path d="M12 22V8M8.5 11h7"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
  </g></svg>`;

const splashes = [[1320,2868],[1206,2622],[1290,2796],[1179,2556],[1284,2778],[1170,2532],[1125,2436],[1242,2688],[828,1792],[1242,2208],[750,1334],[2048,2732],[1668,2388],[1640,2360],[1620,2160],[1536,2048]];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (svg, size, out, opts = {}) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(root, out), omitBackground: !opts.opaque, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote', out);
  };
  await shot(logo, 192, 'icons/icon-192.png');
  await shot(logo, 512, 'icons/icon-512.png');
  await shot(maskable, 192, 'icons/maskable-192.png', { opaque: true });
  await shot(maskable, 512, 'icons/maskable-512.png', { opaque: true });
  await shot(maskable, 180, 'icons/apple-touch-icon.png', { opaque: true }); // iOS rounds corners itself
  await shot(logo, 32, 'icons/favicon-32.png');
  await shot(logo, 150, 'icons/mstile-150.png');

  for (const [w, h] of splashes) {
    const s = Math.round(Math.min(w, h) * 0.22);
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;background:#F8FAFC;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,Arial,sans-serif">
      ${logo.replace('<svg ', `<svg width="${s}" height="${s}" style="filter:drop-shadow(0 ${s*0.06}px ${s*0.12}px rgba(37,99,235,.3))" `)}
      <div style="margin-top:${s*0.28}px;font-size:${s*0.26}px;font-weight:800;color:#1E293B;letter-spacing:-.02em">Job Tracker</div>
      <div style="margin-top:${s*0.06}px;font-size:${s*0.12}px;font-weight:500;color:#5B6779">Stability Engineering</div>
    </body></html>`);
    await page.screenshot({ path: path.join(root, `icons/splash/splash-${w}x${h}.png`) });
  }
  console.log('wrote', splashes.length, 'splash screens');
  await browser.close();
})();
