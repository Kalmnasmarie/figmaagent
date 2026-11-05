// Gör om Figma Plugin API-noder till regelmotorns normaliserade format.
// Körs i pluginets sandbox (code.js).

function pluginPaints(paints, boundList) {
  if (!paints || paints === figma.mixed) return null;
  return paints.map(function (p, i) {
    var bound = !!(p.boundVariables && p.boundVariables.color) || !!(boundList && boundList[i]);
    return {
      type: p.type,
      visible: p.visible,
      opacity: p.opacity,
      color: p.type === 'SOLID' ? { r: p.color.r, g: p.color.g, b: p.color.b, a: 1 } : null,
      bound: bound
    };
  });
}

function hasStyle(id) {
  if (id === figma.mixed) return 'mixed';
  return !!id;
}

function boundAny(bv, keys) {
  if (!bv) return false;
  return keys.some(function (k) { return !!bv[k]; });
}

async function normalizePluginNode(node) {
  var bv = node.boundVariables || {};
  var bb = node.absoluteBoundingBox;
  var out = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    opacity: node.opacity,
    bbox: bb ? { x: bb.x, y: bb.y, width: bb.width, height: bb.height } : null,
    clipsContent: !!node.clipsContent,
    layoutMode: node.layoutMode || null
  };

  if ('fills' in node) {
    out.fills = pluginPaints(node.fills, bv.fills);
    var fs = hasStyle(node.fillStyleId);
    out.fillStyle = fs === true;
    if (fs === 'mixed') out.fillStyle = true; // blandade textfyllningar hanteras via textstil
  }
  if ('strokes' in node) {
    out.strokes = pluginPaints(node.strokes, bv.strokes);
    out.strokeStyle = !!node.strokeStyleId;
  }
  if ('effects' in node && node.effects !== figma.mixed) {
    out.effects = node.effects.map(function (e, i) {
      return { type: e.type, visible: e.visible, bound: !!(e.boundVariables && Object.keys(e.boundVariables).length) || !!(bv.effects && bv.effects[i]) };
    });
    out.effectStyle = !!node.effectStyleId;
  }
  if ('cornerRadius' in node && node.type !== 'TEXT') {
    var r = node.cornerRadius === figma.mixed ? node.topLeftRadius : node.cornerRadius;
    out.radius = r || 0;
    out.radiusBound = boundAny(bv, ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius', 'cornerRadius']);
  }
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    out.spacing = [
      { label: 'mellanrum', value: node.primaryAxisAlignItems === 'SPACE_BETWEEN' ? 0 : node.itemSpacing, bound: !!bv.itemSpacing },
      { label: 'padding vänster', value: node.paddingLeft, bound: !!bv.paddingLeft },
      { label: 'padding höger', value: node.paddingRight, bound: !!bv.paddingRight },
      { label: 'padding topp', value: node.paddingTop, bound: !!bv.paddingTop },
      { label: 'padding botten', value: node.paddingBottom, bound: !!bv.paddingBottom }
    ];
  }
  if (node.type === 'TEXT') {
    var ts = hasStyle(node.textStyleId);
    out.text = {
      fontSize: node.fontSize === figma.mixed ? null : node.fontSize,
      fontWeight: node.fontWeight === figma.mixed ? null : node.fontWeight,
      textStyle: ts,
      boundTypography: boundAny(bv, ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'lineHeight'])
    };
    if (out.text.fontSize === null) {
      // Blandade storlekar: använd minsta storleken för kontroll av läsbarhet.
      var segs = node.getStyledTextSegments(['fontSize', 'fontWeight']);
      out.text.fontSize = Math.min.apply(null, segs.map(function (s) { return s.fontSize; }));
      out.text.fontWeight = Math.min.apply(null, segs.map(function (s) { return s.fontWeight; }));
    }
  }
  if (node.type === 'INSTANCE') {
    var main = await node.getMainComponentAsync();
    if (main) {
      out.componentName = main.parent && main.parent.type === 'COMPONENT_SET'
        ? main.parent.name + ' / ' + main.name : main.name;
    }
  }
  if ('children' in node) {
    out.children = [];
    for (var i = 0; i < node.children.length; i++) {
      out.children.push(await normalizePluginNode(node.children[i]));
    }
  }
  return out;
}
