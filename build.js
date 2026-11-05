// Bygger pluginet till plugin/: lägger in regelmotorn i code.js och
// jsPDF + rapportbyggaren i ui.html (Figma-plugins kan inte ladda moduler).
const fs = require('fs');
const path = require('path');
const r = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const code = [
  '// Genererad av build.js. Redigera filerna i src/ i stället.',
  r('src/core/rules.js'),
  r('src/core/normalize-plugin.js'),
  r('src/plugin/code.src.js')
].join('\n\n');

const jspdf = r('node_modules/jspdf/dist/jspdf.umd.min.js').replace(/<\/script/gi, '<\\/script');
const ui = r('src/plugin/ui.src.html')
  .replace('/*JSPDF*/', () => jspdf)
  .replace('/*REPORT*/', () => r('src/core/report.js'));

fs.mkdirSync(path.join(__dirname, 'plugin'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'plugin/code.js'), code);
fs.writeFileSync(path.join(__dirname, 'plugin/ui.html'), ui);
console.log('Byggt: plugin/code.js och plugin/ui.html');
