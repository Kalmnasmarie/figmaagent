// Pluginets huvudkod (körs i Figmas sandbox). build.js lägger in
// regelmotorn och normaliseringen före den här filen.

figma.showUI(__html__, { width: 440, height: 640, themeColors: true });

var lastFrames = [];

function framesInScope(scope) {
  if (scope === 'selection') {
    return figma.currentPage.selection.slice();
  }
  var out = [];
  figma.currentPage.children.forEach(function (n) {
    if (n.type === 'SECTION') {
      n.children.forEach(function (c) { if (c.type !== 'SECTION') out.push(c); });
    } else if (['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'].indexOf(n.type) >= 0) {
      out.push(n);
    }
  });
  return out;
}

async function review(scope) {
  var roots = framesInScope(scope);
  if (!roots.length) {
    figma.ui.postMessage({
      type: 'error',
      message: scope === 'selection' ? 'Markera en eller flera frames först.' : 'Sidan har inga frames att granska.'
    });
    return;
  }
  figma.ui.postMessage({ type: 'progress', message: 'Läser ' + roots.length + ' frames…' });
  var normalized = [];
  for (var i = 0; i < roots.length; i++) {
    normalized.push(await normalizePluginNode(roots[i]));
  }
  var result = runRules(normalized, {});
  lastFrames = roots;
  figma.ui.postMessage({
    type: 'result',
    fileName: figma.root.name + ' – ' + figma.currentPage.name,
    stats: result.stats,
    issues: result.issues,
    frames: normalized.map(function (f) { return { id: f.id, name: f.name, bbox: f.bbox }; })
  });
}

async function exportImages(frameIds) {
  var images = {};
  for (var i = 0; i < frameIds.length; i++) {
    var node = await figma.getNodeByIdAsync(frameIds[i]);
    if (!node || !('exportAsync' in node)) continue;
    var w = node.width, h = node.height;
    var scale = Math.min(2, 1600 / Math.max(w, h));
    figma.ui.postMessage({ type: 'progress', message: 'Exporterar bild ' + (i + 1) + ' av ' + frameIds.length + '…' });
    images[node.id] = await node.exportAsync({
      format: 'PNG',
      useAbsoluteBounds: true,
      constraint: { type: 'SCALE', value: scale }
    });
  }
  figma.ui.postMessage({ type: 'images', images: images });
}

figma.ui.onmessage = async function (msg) {
  try {
    if (msg.type === 'run') await review(msg.scope);
    if (msg.type === 'export') await exportImages(msg.frameIds);
    if (msg.type === 'select') {
      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) return;
      var page = node;
      while (page && page.type !== 'PAGE') page = page.parent;
      if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
    }
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: 'Något gick fel: ' + (e && e.message ? e.message : e) });
  }
};
