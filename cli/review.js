#!/usr/bin/env node
// Granskar en Figma-fil via länk med samma regler som pluginet och skriver en PDF.
//
//   FIGMA_TOKEN=... node cli/review.js "https://www.figma.com/design/KEY/Namn?node-id=1-2" [--ut rapport.pdf] [--json resultat.json]
//   node cli/review.js --fil sparad-respons.json        (offline, utan skärmdumpar)
//
// Utan node-id granskas alla toppnivå-frames på alla sidor (använd --sida "Namn" för att begränsa).

const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const { runRules } = require('../src/core/rules');
const { normalizeRestNode } = require('../src/core/normalize-rest');
const { buildReport } = require('../src/core/report');

const API = 'https://api.figma.com/v1';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else args._.push(a);
  }
  return args;
}

function parseFigmaUrl(url) {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  let key = parts[1];
  const branch = parts.indexOf('branch');
  if (branch >= 0) key = parts[branch + 1];
  const nodeId = u.searchParams.get('node-id');
  return { key, nodeId: nodeId ? nodeId.replace(/-/g, ':') : null };
}

async function api(p, token) {
  const res = await fetch(API + p, { headers: { 'X-Figma-Token': token } });
  if (!res.ok) throw new Error(`Figma API svarade ${res.status} på ${p}: ${await res.text()}`);
  return res.json();
}

const FRAME_TYPES = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'];

// Plockar ut granskningsbara frames ur ett dokument eller en nod.
function collectFrames(root, pageFilter) {
  if (root.type === 'DOCUMENT') {
    return root.children
      .filter((p) => !pageFilter || p.name === pageFilter)
      .flatMap((p) => collectFrames(p));
  }
  if (root.type === 'CANVAS' || root.type === 'SECTION') {
    return root.children.flatMap((c) => (c.type === 'SECTION' ? collectFrames(c) : FRAME_TYPES.includes(c.type) ? [c] : []));
  }
  return [root];
}

async function loadFromApi(url, token, pageFilter) {
  const { key, nodeId } = parseFigmaUrl(url);
  if (nodeId) {
    const data = await api(`/files/${key}/nodes?ids=${encodeURIComponent(nodeId)}`, token);
    const entry = data.nodes[nodeId];
    if (!entry) throw new Error('Hittade inte noden ' + nodeId);
    return { key, name: data.name, roots: collectFrames(entry.document), components: entry.components || {} };
  }
  const data = await api(`/files/${key}`, token);
  return { key, name: data.name, roots: collectFrames(data.document, pageFilter), components: data.components || {} };
}

async function fetchImages(key, frames, token) {
  const images = {};
  for (const f of frames) {
    const b = f.absoluteBoundingBox;
    const scale = Math.min(2, 1600 / Math.max(b.width, b.height)).toFixed(2);
    const r = await api(`/images/${key}?ids=${encodeURIComponent(f.id)}&format=png&scale=${scale}&use_absolute_bounds=true`, token);
    const src = r.images[f.id];
    if (!src) continue;
    const png = Buffer.from(await (await fetch(src)).arrayBuffer());
    images[f.id] = 'data:image/png;base64,' + png.toString('base64');
  }
  return images;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = args.token || process.env.FIGMA_TOKEN;
  let file;
  if (args.fil) {
    const data = JSON.parse(fs.readFileSync(args.fil, 'utf8'));
    const doc = data.document || Object.values(data.nodes)[0].document;
    file = { name: data.name, roots: collectFrames(doc, args.sida), components: data.components || {} };
  } else {
    if (!args._[0]) throw new Error('Ange en Figma-länk eller --fil.');
    if (!token) throw new Error('Sätt FIGMA_TOKEN (personlig åtkomsttoken från Figma) eller använd --token.');
    file = await loadFromApi(args._[0], token, args.sida);
  }

  const frames = file.roots.map((r) => normalizeRestNode(r, file.components));
  const result = runRules(frames, {});
  console.log(`${result.stats.nodes} lager i ${result.stats.frames} frames: ` +
    `${result.stats.fel} fel, ${result.stats.varning} varningar, ${result.stats.info} förslag.`);

  const withIssues = frames.filter((f) => result.issues.some((i) => i.frameId === f.id));
  const images = args.fil || args['utan-bilder'] ? {} :
    await fetchImages(file.key, file.roots.filter((r) => withIssues.some((f) => f.id === r.id)), token);

  const doc = buildReport(jsPDF, {
    fileName: file.name,
    createdAt: new Date(),
    stats: result.stats,
    issues: result.issues,
    frames: withIssues.map((f) => ({ id: f.id, name: f.name, bbox: f.bbox, image: images[f.id] || null }))
  });
  const out = args.ut || 'granskning.pdf';
  fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
  console.log('PDF: ' + path.resolve(out));
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify(result, null, 2));
    console.log('JSON: ' + path.resolve(args.json));
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { parseFigmaUrl, collectFrames };
