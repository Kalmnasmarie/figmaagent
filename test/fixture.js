// Påhittad Figma-sida i Plugin API-format, för tester utan Figma.
const MIXED = Symbol('mixed');
const c = (hex) => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 });
const solid = (hex, extra) => Object.assign({ type: 'SOLID', visible: true, opacity: 1, color: c(hex) }, extra || {});
let n = 0;
function node(type, name, x, y, w, h, props, children) {
  const o = Object.assign({
    id: '1:' + (++n), type, name, visible: true, opacity: 1,
    absoluteBoundingBox: { x, y, width: w, height: h }, width: w, height: h,
    fills: [], strokes: [], effects: [], boundVariables: {},
    fillStyleId: '', strokeStyleId: '', effectStyleId: ''
  }, props || {});
  if (children) { o.children = children; children.forEach((ch) => (ch.parent = o)); }
  return o;
}
function text(name, x, y, w, h, chars, size, weight, color, props) {
  return node('TEXT', name, x, y, w, h, Object.assign({ characters: chars, fontSize: size, fontWeight: weight,
    textStyleId: '', fills: [solid(color)] }, props || {}));
}

function build() {
  n = 0;
  const btnText = text('Label', 140, 600, 95, 36, 'Kom igång', 15, 600, '#FFFFFF');
  const instance = node('INSTANCE', 'Button/Primary', 140, 600, 95, 36,
    { fills: [solid('#2563EB')], fillStyleId: 'S:primary', cornerRadius: 8, boundVariables: { topLeftRadius: {} },
      layoutMode: 'HORIZONTAL', itemSpacing: 8, paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8,
      boundVariables: { itemSpacing: {}, paddingLeft: {}, paddingRight: {}, paddingTop: {}, paddingBottom: {}, topLeftRadius: {} },
      _main: { name: 'Primary', parent: { type: 'COMPONENT_SET', name: 'Button' } } }, [btnText]);

  const frame = node('FRAME', 'Startsida', 0, 0, 375, 700, { fills: [solid('#FFFFFF', { boundVariables: { color: {} } })], clipsContent: true, layoutMode: 'NONE' }, [
    node('FRAME', 'Frame 12', 0, 0, 375, 96, { fills: [solid('#1E3A8A')], layoutMode: 'NONE' }, [
      text('Rubrik', 20, 44, 200, 32, 'Välkommen', 24, 700, '#FFFFFF', { textStyleId: 'S:h1', fillStyleId: 'S:onPrimary' }),
      node('FRAME', 'IconButton/Meny', 331, 50, 24, 20, { fills: [solid('#FFFFFF')], fillStyleId: 'S:onPrimary' })
    ]),
    text('Ingress', 20, 116, 335, 40, 'Här hittar du allt om dina beställningar och leveranser.', 14, 400, '#9CA3AF'),
    node('FRAME', 'Kort', 20, 172, 335, 260, {
      fills: [solid('#F9FAFB')], fillStyleId: 'S:surface', cornerRadius: 12, layoutMode: 'VERTICAL', itemSpacing: 12,
      paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16,
      effects: [{ type: 'DROP_SHADOW', visible: true }], strokes: [solid('#E5E7EB')]
    }, [
      node('RECTANGLE', 'Rectangle 3', 36, 188, 303, 160, { fills: [solid('#CBD5E1')], fillStyleId: 'S:placeholder', cornerRadius: 8, boundVariables: { topLeftRadius: {} } }),
      text('Bildtext', 36, 360, 303, 14, 'Leverans beräknad till fredag', 10, 400, '#6B7280', { textStyleId: 'S:caption', fillStyleId: 'S:muted' }),
      text('Korttitel', 36, 386, 303, 24, 'Order 4821', 18, 600, '#111827', { textStyleId: 'S:h3', fillStyleId: 'S:text' })
    ]),
    node('GROUP', 'Group 5', 20, 452, 335, 120, {}, [
      node('RECTANGLE', 'Rectangle 7', 20, 452, 160, 120, { fills: [solid('#FDE68A')] }),
      node('RECTANGLE', 'Rectangle 8', 195, 452, 160, 120, { fills: [solid('#BBF7D0')], fillStyleId: 'S:success' })
    ]),
    instance,
    node('FRAME', 'Gammal banner', 0, 640, 375, 60, { visible: false, fills: [solid('#FF0000')] }),
    node('FRAME', 'Frame 20', 300, 660, 40, 30, {}),
    text('Länk', 400, 620, 80, 20, 'Läs mer', 14, 400, '#2563EB', { textStyleId: 'S:body', fillStyleId: 'S:link' })
  ]);
  instance.getMainComponentAsync = async () => instance._main;
  return frame;
}

module.exports = { build, MIXED };
