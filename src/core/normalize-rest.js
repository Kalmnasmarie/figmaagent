// Gör om noder från Figmas REST API (GET /v1/files/:key) till regelmotorns
// normaliserade format. Används av kommandoradsverktyget.

function restPaints(paints, boundList) {
  if (!paints) return null;
  return paints.map(function (p, i) {
    return {
      type: p.type,
      visible: p.visible,
      opacity: p.opacity,
      color: p.type === 'SOLID' && p.color ? { r: p.color.r, g: p.color.g, b: p.color.b, a: p.color.a } : null,
      bound: !!(p.boundVariables && p.boundVariables.color) || !!(boundList && boundList[i])
    };
  });
}

function normalizeRestNode(node, components) {
  var bv = node.boundVariables || {};
  var styles = node.styles || {};
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
  if (node.fills) {
    out.fills = restPaints(node.fills, bv.fills);
    out.fillStyle = !!(styles.fill || styles.fills);
  }
  if (node.strokes) {
    out.strokes = restPaints(node.strokes, bv.strokes);
    out.strokeStyle = !!(styles.stroke || styles.strokes);
  }
  if (node.effects) {
    out.effects = node.effects.map(function (e, i) {
      return { type: e.type, visible: e.visible, bound: !!(e.boundVariables && Object.keys(e.boundVariables).length) || !!(bv.effects && bv.effects[i]) };
    });
    out.effectStyle = !!(styles.effect || styles.effects);
  }
  if (node.cornerRadius !== undefined || node.rectangleCornerRadii) {
    out.radius = node.cornerRadius || (node.rectangleCornerRadii ? node.rectangleCornerRadii[0] : 0);
    out.radiusBound = !!(bv.topLeftRadius || bv.topRightRadius || bv.bottomLeftRadius || bv.bottomRightRadius);
  }
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    out.spacing = [
      { label: 'mellanrum', value: node.primaryAxisAlignItems === 'SPACE_BETWEEN' ? 0 : (node.itemSpacing || 0), bound: !!bv.itemSpacing },
      { label: 'padding vänster', value: node.paddingLeft || 0, bound: !!bv.paddingLeft },
      { label: 'padding höger', value: node.paddingRight || 0, bound: !!bv.paddingRight },
      { label: 'padding topp', value: node.paddingTop || 0, bound: !!bv.paddingTop },
      { label: 'padding botten', value: node.paddingBottom || 0, bound: !!bv.paddingBottom }
    ];
  }
  if (node.type === 'TEXT') {
    var st = node.style || {};
    var overrides = node.styleOverrideTable ? Object.keys(node.styleOverrideTable) : [];
    var mixedStyle = overrides.some(function (k) {
      var o = node.styleOverrideTable[k];
      return o.fontSize !== undefined || o.fontWeight !== undefined || o.fontFamily !== undefined;
    });
    out.text = {
      fontSize: st.fontSize,
      fontWeight: st.fontWeight,
      textStyle: styles.text ? (mixedStyle ? 'mixed' : true) : false,
      boundTypography: !!(bv.fontSize || bv.fontFamily || bv.fontWeight || bv.lineHeight)
    };
  }
  if (node.type === 'INSTANCE' && node.componentId && components && components[node.componentId]) {
    out.componentName = components[node.componentId].name;
  }
  if (node.children) {
    out.children = node.children.map(function (c) { return normalizeRestNode(c, components); });
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeRestNode: normalizeRestNode };
}
