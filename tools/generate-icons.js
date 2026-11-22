/* Generates PNG icons, maskable icons and iOS splash screens from assets/logo.svg.
   Usage: node tools/generate-icons.js   (needs Playwright + Chromium) */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const logo = fs.readFileSync(path.join(root, 'assets/logo.svg'), 'utf8');

// Maskable: full-bleed background, artwork inside the central 80% safe zone
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2E3D28"/>
  <g fill="#fff" transform="translate(140.8 140.8) scale(0.9)">
    <rect x="16" y="44" width="208" height="32" rx="16"/><rect x="56" y="92" width="168" height="32" rx="16"/>
    <rect x="96" y="140" width="128" height="32" rx="16"/><rect x="136" y="188" width="88" height="32" rx="16"/>
  </g></svg>`;
// Small-size cut (three heavier bars) for the 32 px favicon
const small = fs.readFileSync(path.join(root, 'icons/favicon.svg'), 'utf8');

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
  await shot(small, 32, 'icons/favicon-32.png');
  await shot(logo, 150, 'icons/mstile-150.png');

  for (const [w, h] of splashes) {
    const s = Math.round(Math.min(w, h) * 0.22);
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;background:#E8E9DF;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,Arial,sans-serif">
      ${logo.replace('<svg ', `<svg width="${s}" height="${s}" style="filter:drop-shadow(0 ${s*0.06}px ${s*0.12}px rgba(46,61,40,.3))" `)}
      <div style="margin-top:${s*0.28}px;font-size:${s*0.26}px;font-weight:800;color:#1F2A1C;letter-spacing:-.02em">Job Tracker</div>
      <div style="margin-top:${s*0.06}px;font-size:${s*0.12}px;font-weight:500;color:#5B6656">Stability Engineering</div>
    </body></html>`);
    await page.screenshot({ path: path.join(root, `icons/splash/splash-${w}x${h}.png`) });
  }
  console.log('wrote', splashes.length, 'splash screens');
  await browser.close();
})();
