// Bygger PDF-rapporten med jsPDF. Används av både pluginet (i UI-fönstret)
// och kommandoradsverktyget (i Node).
//
// data = {
//   fileName, createdAt (Date), stats, issues,
//   frames: [{ id, name, bbox, image (data-URL för PNG) }]
// }

var REPORT_COLORS = {
  fel: [217, 45, 32],
  varning: [220, 104, 3],
  info: [46, 144, 250],
  text: [24, 29, 39],
  muted: [102, 112, 133],
  line: [228, 231, 236]
};

var SEVERITY_LABEL = { fel: 'FEL', varning: 'VARNING', info: 'INFO' };
var CATEGORY_LABEL = { designsystem: 'Designsystem', tillganglighet: 'Tillgänglighet', struktur: 'Struktur' };

function buildReport(JsPDF, data) {
  var doc = new JsPDF({ unit: 'pt', format: 'a4' });
  var W = doc.internal.pageSize.getWidth();
  var H = doc.internal.pageSize.getHeight();
  var M = 40;
  var y = M;

  function color(c, kind) {
    if (kind === 'fill') doc.setFillColor(c[0], c[1], c[2]);
    else if (kind === 'draw') doc.setDrawColor(c[0], c[1], c[2]);
    else doc.setTextColor(c[0], c[1], c[2]);
  }

  function ensure(h) {
    if (y + h > H - M) { doc.addPage(); y = M; }
  }

  function text(str, size, opts) {
    opts = opts || {};
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    color(opts.color || REPORT_COLORS.text);
    var width = opts.width || (W - 2 * M);
    var lines = doc.splitTextToSize(String(str), width);
    var lh = size * 1.3;
    lines.forEach(function (l) {
      ensure(lh);
      doc.text(l, opts.x || M, y + size);
      y += lh;
    });
  }

  function badge(sev, x, yy) {
    var label = SEVERITY_LABEL[sev];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    var w = doc.getTextWidth(label) + 10;
    color(REPORT_COLORS[sev], 'fill');
    doc.roundedRect(x, yy, w, 13, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, x + 5, yy + 9.3);
    return w;
  }

  function marker(n, sev, x, yy) {
    color(REPORT_COLORS[sev], 'fill');
    doc.circle(x, yy, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(n > 99 ? 5.5 : 7);
    doc.setTextColor(255, 255, 255);
    doc.text(String(n), x, yy + 2.4, { align: 'center' });
  }

  // --- Sammanfattning ---
  text('Granskningsrapport', 22, { bold: true });
  y += 2;
  text(data.fileName || 'Figma-fil', 12, { color: REPORT_COLORS.muted });
  var d = data.createdAt || new Date();
  text('Skapad ' + d.toISOString().slice(0, 10) + ' · ' + data.stats.frames + ' frames · ' +
    data.stats.nodes + ' lager granskade', 9, { color: REPORT_COLORS.muted });
  y += 16;

  var boxW = (W - 2 * M - 20) / 3;
  ['fel', 'varning', 'info'].forEach(function (sev, i) {
    var x = M + i * (boxW + 10);
    color(REPORT_COLORS.line, 'draw');
    doc.setLineWidth(1);
    doc.roundedRect(x, y, boxW, 58, 4, 4, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    color(REPORT_COLORS[sev]);
    doc.text(String(data.stats[sev]), x + 12, y + 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    color(REPORT_COLORS.muted);
    doc.text({ fel: 'Fel', varning: 'Varningar', info: 'Förbättringsförslag' }[sev], x + 12, y + 46);
  });
  y += 78;

  text('Per område', 12, { bold: true });
  y += 2;
  Object.keys(CATEGORY_LABEL).forEach(function (cat) {
    var n = data.stats.perCategory[cat] || 0;
    text(CATEGORY_LABEL[cat] + ': ' + n + ' anmärkningar', 10);
  });
  y += 10;

  // Vanligaste problemen, grupperade per regel.
  var byRule = {};
  data.issues.forEach(function (i) {
    if (!byRule[i.ruleId]) byRule[i.ruleId] = { n: 0, sample: i };
    byRule[i.ruleId].n++;
  });
  var top = Object.keys(byRule).sort(function (a, b) { return byRule[b].n - byRule[a].n; }).slice(0, 8);
  if (top.length) {
    text('Vanligaste anmärkningarna', 12, { bold: true });
    y += 2;
    top.forEach(function (rid) {
      var s = byRule[rid].sample;
      ensure(18);
      badge(s.severity, M, y + 1);
      text(byRule[rid].n + ' st · ' + CATEGORY_LABEL[s.category] + ' · ' + s.suggestion, 9.5,
        { x: M + 62, width: W - 2 * M - 62 });
      y += 3;
    });
  }

  // --- En sektion per frame ---
  var counter = 0;
  data.frames.forEach(function (frame) {
    var frameIssues = data.issues.filter(function (i) { return i.frameId === frame.id; });
    if (!frameIssues.length) return;
    frameIssues.forEach(function (i) { i.number = ++counter; });

    doc.addPage();
    y = M;
    text(frame.name, 16, { bold: true });
    text(frameIssues.length + ' anmärkningar', 9, { color: REPORT_COLORS.muted });
    y += 6;

    var fb = frame.bbox;
    var maxW = W - 2 * M, maxH = H * 0.55;
    var scale = Math.min(maxW / fb.width, maxH / fb.height);
    var iw = fb.width * scale, ih = fb.height * scale;
    var ix = M + (maxW - iw) / 2, iy = y;
    if (frame.image) {
      doc.addImage(frame.image, 'PNG', ix, iy, iw, ih, 'frame-' + frame.id, 'FAST');
    }
    color(REPORT_COLORS.line, 'draw');
    doc.setLineWidth(0.5);
    doc.rect(ix, iy, iw, ih, 'S');

    frameIssues.forEach(function (i) {
      if (!i.bbox || i.nodeId === frame.id) return;
      var rx = ix + (i.bbox.x - fb.x) * scale, ry = iy + (i.bbox.y - fb.y) * scale;
      color(REPORT_COLORS[i.severity], 'draw');
      doc.setLineWidth(1);
      doc.rect(rx, ry, Math.max(2, i.bbox.width * scale), Math.max(2, i.bbox.height * scale), 'S');
    });
    frameIssues.forEach(function (i) {
      if (!i.bbox) return;
      var mx = Math.min(Math.max(ix + (i.bbox.x - fb.x) * scale, ix + 7), ix + iw - 7);
      var my = Math.min(Math.max(iy + (i.bbox.y - fb.y) * scale, iy + 7), iy + ih - 7);
      marker(i.number, i.severity, mx, my);
    });
    y = iy + ih + 18;

    frameIssues.forEach(function (i) {
      var withCrop = frame.image && i.bbox && i.severity !== 'info' && i.nodeId !== frame.id;
      var cropW = 150, cropH = 96;
      var textX = withCrop ? M + cropW + 14 : M + 22;
      var textW = W - M - textX;

      doc.setFontSize(9.5);
      var msgLines = doc.splitTextToSize(i.message, textW).length;
      var est = Math.max(withCrop ? cropH + 10 : 0, 34 + msgLines * 12.5 + 24);
      ensure(est);
      var top = y;

      if (withCrop) {
        drawCrop(i, frame, M, top, cropW, cropH);
        marker(i.number, i.severity, M + 9, top + 9);
      } else {
        marker(i.number, i.severity, M + 8, top + 8);
      }

      y = top;
      var bw = badge(i.severity, textX, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      color(REPORT_COLORS.muted);
      doc.text(CATEGORY_LABEL[i.category], textX + bw + 6, y + 9.3);
      y += 17;
      text(i.message, 9.5, { x: textX, width: textW, bold: true });
      text('Förslag: ' + i.suggestion, 9, { x: textX, width: textW });
      text('Lager: ' + i.path, 7.5, { x: textX, width: textW, color: REPORT_COLORS.muted });

      y = Math.max(y, withCrop ? top + cropH : y) + 8;
      color(REPORT_COLORS.line, 'draw');
      doc.setLineWidth(0.5);
      doc.line(M, y, W - M, y);
      y += 10;
    });
  });

  // Inzoomad skärmdump av ett fel: beskär frame-bilden med en klippyta.
  function drawCrop(issue, frame, bx, by, bw, bh) {
    var fb = frame.bbox, b = issue.bbox;
    var pad = Math.max(24, Math.max(b.width, b.height) * 0.25);
    var cw = b.width + pad * 2, ch = b.height + pad * 2;
    if (cw / ch > bw / bh) ch = cw * bh / bw; else cw = ch * bw / bh;
    // Håll utsnittet inom framen när det får plats, annars centrera det.
    function place(center, size, total) {
      if (size >= total) return (total - size) / 2;
      return Math.min(Math.max(center - size / 2, 0), total - size);
    }
    var cx = place(b.x - fb.x + b.width / 2, cw, fb.width);
    var cy = place(b.y - fb.y + b.height / 2, ch, fb.height);
    var s = bw / cw;

    doc.saveGraphicsState();
    doc.setFillColor(242, 244, 247);
    doc.rect(bx, by, bw, bh, 'F');
    doc.rect(bx, by, bw, bh, null);
    doc.clip();
    doc.discardPath();
    doc.addImage(frame.image, 'PNG', bx - cx * s, by - cy * s, fb.width * s, fb.height * s, 'frame-' + frame.id, 'FAST');
    doc.restoreGraphicsState();

    color(REPORT_COLORS[issue.severity], 'draw');
    doc.setLineWidth(1.5);
    doc.rect(bx + (b.x - fb.x - cx) * s, by + (b.y - fb.y - cy) * s, b.width * s, b.height * s, 'S');
    color(REPORT_COLORS.line, 'draw');
    doc.setLineWidth(0.5);
    doc.rect(bx, by, bw, bh, 'S');
  }

  var pages = doc.internal.getNumberOfPages();
  for (var p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    color(REPORT_COLORS.muted);
    doc.text('Figma-granskning · sida ' + p + ' av ' + pages, W - M, H - 20, { align: 'right' });
  }
  return doc;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildReport: buildReport };
}
