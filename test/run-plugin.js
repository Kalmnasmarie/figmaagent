// Kör plugin/code.js i en låtsas-Figma och skriver resultatet till JSON.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { build, MIXED } = require('./fixture');

const frame = build();
const all = {};
(function index(n) { all[n.id] = n; (n.children || []).forEach(index); })(frame);
function walk(n) { if (n.type === 'TEXT') n.getStyledTextSegments = () => []; (n.children || []).forEach(walk); }
walk(frame);

let onmessage;
const messages = [];
const figma = {
  mixed: MIXED,
  showUI() {},
  root: { name: 'Exempelfil' },
  currentPage: { name: 'Mobil', children: [frame], selection: [] },
  ui: { postMessage: (m) => messages.push(m), set onmessage(f) { onmessage = f; }, get onmessage() { return onmessage; } },
  getNodeByIdAsync: async (id) => all[id],
};
frame.exportAsync = async () => new Uint8Array(fs.readFileSync(path.join(__dirname, 'out/startsida.png')));

vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../plugin/code.js'), 'utf8'), { figma, __html__: '', console });

(async () => {
  await figma.ui.onmessage({ type: 'run', scope: 'page' });
  const result = messages.find((m) => m.type === 'result');
  if (!result) { console.error(messages); process.exit(1); }
  await figma.ui.onmessage({ type: 'export', frameIds: [frame.id] });
  const images = messages.find((m) => m.type === 'images');
  fs.writeFileSync(path.join(__dirname, 'out/result.json'), JSON.stringify(result, null, 2));
  console.log('Stats:', JSON.stringify(result.stats));
  result.issues.forEach((i) => console.log(i.severity.padEnd(8), i.ruleId.padEnd(20), i.nodeName.padEnd(18), i.message));
  console.log('Bilder:', Object.keys(images.images));
})();
