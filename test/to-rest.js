// Gör om fixturen till samma form som Figmas REST API svarar med.
const { build } = require('./fixture');
function conv(n) {
  const o = { id: n.id, name: n.name, type: n.type, absoluteBoundingBox: n.absoluteBoundingBox,
    fills: n.fills.map((p) => ({ type: p.type, visible: p.visible, color: Object.assign({ a: 1 }, p.color), boundVariables: p.boundVariables })),
    strokes: n.strokes.map((p) => ({ type: p.type, color: Object.assign({ a: 1 }, p.color) })),
    effects: n.effects, styles: {}, boundVariables: n.boundVariables, clipsContent: n.clipsContent };
  if (n.visible === false) o.visible = false;
  if (n.fillStyleId) o.styles.fill = n.fillStyleId;
  if (n.textStyleId) o.styles.text = n.textStyleId;
  if (n.cornerRadius) o.cornerRadius = n.cornerRadius;
  ['layoutMode', 'itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'].forEach((k) => { if (n[k] !== undefined) o[k] = n[k]; });
  if (n.type === 'TEXT') { o.characters = n.characters; o.style = { fontSize: n.fontSize, fontWeight: n.fontWeight }; }
  if (n.type === 'INSTANCE') o.componentId = 'C:1';
  if (n.children) o.children = n.children.map(conv);
  return o;
}
const doc = { type: 'DOCUMENT', children: [{ type: 'CANVAS', name: 'Mobil', children: [conv(build())] }] };
process.stdout.write(JSON.stringify({ name: 'Exempelfil', document: doc, components: { 'C:1': { name: 'Button/Primary' } } }));
