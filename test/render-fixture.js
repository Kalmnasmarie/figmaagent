// Ritar fixturen som PNG med Playwright så att PDF:en får en riktig skärmdump.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { build } = require('./fixture');
const css = (c) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
function html(n, root) {
  if (n.visible === false) return '';
  const b = n.absoluteBoundingBox;
  const fill = n.fills && n.fills[0] ? css(n.fills[0].color) : 'transparent';
  let s = `position:absolute;left:${b.x - root.x}px;top:${b.y - root.y}px;width:${b.width}px;height:${b.height}px;`;
  if (n.type === 'TEXT') return `<div style="${s}color:${fill};font:${n.fontWeight} ${n.fontSize}px/1.3 Helvetica,Arial">${n.characters}</div>`;
  s += `background:${fill};border-radius:${n.cornerRadius || 0}px;`;
  if (n.strokes && n.strokes.length) s += `outline:1px solid ${css(n.strokes[0].color)};`;
  if (n.effects && n.effects.length) s += 'box-shadow:0 4px 12px rgba(0,0,0,.12);';
  return `<div style="${s}"></div>` + (n.children || []).map((c) => html(c, root)).join('');
}
(async () => {
  const f = build();
  const root = f.absoluteBoundingBox;
  const page = await (await chromium.launch()).newPage({ viewport: { width: root.width, height: root.height }, deviceScaleFactor: 2 });
  await page.setContent(`<body style="margin:0;position:relative;overflow:hidden">${html(f, root)}</body>`);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, 'out/startsida.png') });
  process.exit(0);
})();
