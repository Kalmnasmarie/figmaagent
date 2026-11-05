// Regelmotor för Figma-granskning. Arbetar på ett normaliserat nodträd
// (se normalize-plugin.js och normalize-rest.js) så att samma regler
// används både i Figma-pluginet och i kommandoradsverktyget.

var DEFAULT_CONFIG = {
  // Hoppa över stilkontroller inuti instanser: de ärver från huvudkomponenten,
  // och fel där rapporteras redan på komponenten.
  skipInsideInstances: true,
  minFontSize: 12,
  minTargetAA: 24,
  minTargetRecommended: 44,
  maxDepth: 8,
  interactivePattern: /(button|knapp|btn|checkbox|radio|toggle|switch|chip)|\b(link|länk|tab)\b/i
};

var CATEGORIES = {
  designsystem: 'Designsystem',
  tillganglighet: 'Tillgänglighet',
  struktur: 'Struktur'
};

var SEVERITY_ORDER = { fel: 0, varning: 1, info: 2 };

var DEFAULT_NAME = /^(Frame|Rectangle|Ellipse|Group|Vector|Line|Polygon|Star|Union|Subtract|Intersect|Exclude|Image|Component|Section|Slice|Arrow|Boolean)( \d+)?$/;

function isVisiblePaint(p) {
  return p && p.visible !== false && (p.opacity === undefined || p.opacity > 0);
}

function isColorPaint(p) {
  return p.type === 'SOLID' || (p.type && p.type.indexOf('GRADIENT') === 0);
}

function contains(outer, inner) {
  return outer && inner &&
    outer.x <= inner.x + 0.5 && outer.y <= inner.y + 0.5 &&
    outer.x + outer.width >= inner.x + inner.width - 0.5 &&
    outer.y + outer.height >= inner.y + inner.height - 0.5;
}

function overlaps(a, b) {
  return a && b && a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}

// --- Färg och kontrast (WCAG 2.x) ---

function channel(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(c) {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function blend(fg, alpha, bg) {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha)
  };
}

function contrastRatio(a, b) {
  var la = luminance(a), lb = luminance(b);
  var hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function hex(c) {
  function h(v) { var s = Math.round(v * 255).toString(16); return s.length === 1 ? '0' + s : s; }
  return '#' + (h(c.r) + h(c.g) + h(c.b)).toUpperCase();
}

// Översta synliga heltäckande färgfyllningen, sammansatt mot vitt om den är halvgenomskinlig.
function solidColorOf(node) {
  if (!node || !node.fills || node.visible === false) return null;
  for (var i = node.fills.length - 1; i >= 0; i--) {
    var p = node.fills[i];
    if (!isVisiblePaint(p)) continue;
    if (p.type !== 'SOLID') return null; // bild eller gradient: kan inte avgöras
    var a = (p.color.a === undefined ? 1 : p.color.a) * (p.opacity === undefined ? 1 : p.opacity) *
      (node.opacity === undefined ? 1 : node.opacity);
    return { color: p.color, alpha: a };
  }
  return null;
}

// Letar bakgrunden bakom en textnod: först tidigare syskon som täcker texten,
// sedan föräldern själv, uppåt i trädet.
function findBackground(textNode, ancestors) {
  var child = textNode;
  for (var i = ancestors.length - 1; i >= 0; i--) {
    var parent = ancestors[i];
    var idx = parent.children.indexOf(child);
    for (var j = idx - 1; j >= 0; j--) {
      var sib = parent.children[j];
      if (sib.visible === false || !contains(sib.bbox, textNode.bbox)) continue;
      var c = solidColorOf(sib);
      if (c) return c;
      if (sib.fills && sib.fills.some(isVisiblePaint)) return null;
    }
    var pc = solidColorOf(parent);
    if (pc) return pc;
    if (parent.fills && parent.fills.some(isVisiblePaint)) return null;
    child = parent;
  }
  return null;
}

// --- Regler ---
// Varje regel får (node, ctx) och anropar ctx.report(...) för varje fynd.

var RULES = [
  {
    id: 'ds-fyllning',
    category: 'designsystem',
    check: function (node, ctx) {
      if (ctx.insideInstance && ctx.config.skipInsideInstances) return;
      if (node.fillStyle || !node.fills) return;
      var loose = node.fills.filter(function (p) { return isVisiblePaint(p) && isColorPaint(p) && !p.bound; });
      if (!loose.length) return;
      var what = node.type === 'TEXT' ? 'Textfärgen' : 'Fyllningen';
      var desc = loose[0].type === 'SOLID' ? ' (' + hex(loose[0].color) + ')' : '';
      ctx.report('fel', what + desc + ' är hårdkodad.',
        'Koppla färgen till en färgvariabel eller en färgstil från designsystemet.');
    }
  },
  {
    id: 'ds-kantlinje',
    category: 'designsystem',
    check: function (node, ctx) {
      if (ctx.insideInstance && ctx.config.skipInsideInstances) return;
      if (node.strokeStyle || !node.strokes) return;
      var loose = node.strokes.filter(function (p) { return isVisiblePaint(p) && isColorPaint(p) && !p.bound; });
      if (!loose.length) return;
      var desc = loose[0].type === 'SOLID' ? ' (' + hex(loose[0].color) + ')' : '';
      ctx.report('fel', 'Kantlinjens färg' + desc + ' är hårdkodad.',
        'Koppla kantlinjen till en färgvariabel eller färgstil.');
    }
  },
  {
    id: 'ds-textstil',
    category: 'designsystem',
    check: function (node, ctx) {
      if (node.type !== 'TEXT' || !node.text) return;
      if (ctx.insideInstance && ctx.config.skipInsideInstances) return;
      if (node.text.textStyle === 'mixed') {
        ctx.report('varning', 'Textlagret blandar flera textstilar eller har delar utan stil.',
          'Dela upp texten eller se till att varje del använder en textstil.');
      } else if (!node.text.textStyle && !node.text.boundTypography) {
        ctx.report('fel', 'Texten saknar textstil (' + node.text.fontSize + ' px, vikt ' + node.text.fontWeight + ').',
          'Använd en textstil eller typografivariabler från designsystemet.');
      }
    }
  },
  {
    id: 'ds-effekt',
    category: 'designsystem',
    check: function (node, ctx) {
      if (ctx.insideInstance && ctx.config.skipInsideInstances) return;
      if (node.effectStyle || !node.effects) return;
      var loose = node.effects.filter(function (e) { return e.visible !== false && !e.bound; });
      if (!loose.length) return;
      ctx.report('varning', 'Effekten (' + loose[0].type.toLowerCase().replace(/_/g, ' ') + ') saknar effektstil.',
        'Använd en effektstil, till exempel för skuggor.');
    }
  },
  {
    id: 'ds-radie',
    category: 'designsystem',
    check: function (node, ctx) {
      if (ctx.insideInstance && ctx.config.skipInsideInstances) return;
      if (node.radius && node.radius > 0 && !node.radiusBound) {
        ctx.report('info', 'Hörnradien (' + node.radius + ' px) är hårdkodad.',
          'Koppla hörnradien till en radievariabel.');
      }
    }
  },
  {
    id: 'ds-avstand',
    category: 'designsystem',
    check: function (node, ctx) {
      if (ctx.insideInstance && ctx.config.skipInsideInstances) return;
      if (!node.spacing || !node.layoutMode || node.layoutMode === 'NONE') return;
      var loose = node.spacing.filter(function (s) { return s.value > 0 && !s.bound; });
      if (!loose.length) return;
      ctx.report('info', 'Avstånd i auto layout är hårdkodade (' +
        loose.map(function (s) { return s.label + ' ' + s.value; }).join(', ') + ').',
        'Koppla avstånd och padding till avståndsvariabler.');
    }
  },
  {
    id: 'a11y-kontrast',
    category: 'tillganglighet',
    check: function (node, ctx) {
      if (node.type !== 'TEXT' || !node.text || !node.bbox) return;
      var fg = solidColorOf(node);
      if (!fg) return;
      var bg = findBackground(node, ctx.ancestors);
      if (!bg) return;
      var white = { r: 1, g: 1, b: 1 };
      var bgColor = blend(bg.color, bg.alpha, white);
      var fgColor = blend(fg.color, fg.alpha, bgColor);
      var ratio = contrastRatio(fgColor, bgColor);
      var size = node.text.fontSize || 0;
      var large = size >= 24 || (size >= 18.66 && (node.text.fontWeight || 400) >= 700);
      var needed = large ? 3 : 4.5;
      if (ratio < needed) {
        ctx.report('fel', 'Kontrasten är ' + ratio.toFixed(2) + ':1 (' + hex(fgColor) + ' mot ' + hex(bgColor) +
          '). WCAG AA kräver ' + needed + ':1 för ' + (large ? 'stor' : 'normal') + ' text.',
          'Välj en mörkare/ljusare färg ur paletten så att kontrasten når minst ' + needed + ':1.');
      }
    }
  },
  {
    id: 'a11y-textstorlek',
    category: 'tillganglighet',
    check: function (node, ctx) {
      if (node.type !== 'TEXT' || !node.text || !node.text.fontSize) return;
      if (node.text.fontSize < ctx.config.minFontSize) {
        ctx.report('varning', 'Textstorleken ' + node.text.fontSize + ' px är mindre än ' + ctx.config.minFontSize + ' px.',
          'Öka textstorleken för läsbarhet, särskilt för brödtext.');
      }
    }
  },
  {
    id: 'a11y-klickyta',
    category: 'tillganglighet',
    check: function (node, ctx) {
      if (!node.bbox || node.type === 'TEXT') return;
      var label = node.name + ' ' + (node.componentName || '');
      if (!ctx.config.interactivePattern.test(label)) return;
      // Rapportera bara den yttersta interaktiva nivån.
      for (var i = 0; i < ctx.ancestors.length; i++) {
        var a = ctx.ancestors[i];
        if (ctx.config.interactivePattern.test(a.name + ' ' + (a.componentName || ''))) return;
      }
      var w = Math.round(node.bbox.width), h = Math.round(node.bbox.height);
      var min = Math.min(w, h);
      if (min < ctx.config.minTargetAA) {
        ctx.report('fel', 'Klickytan är ' + w + 'x' + h + ' px, under WCAG-minimum ' +
          ctx.config.minTargetAA + 'x' + ctx.config.minTargetAA + ' px.',
          'Gör ytan större eller lägg till padding runt elementet.');
      } else if (min < ctx.config.minTargetRecommended) {
        ctx.report('varning', 'Klickytan är ' + w + 'x' + h + ' px. Rekommenderat är minst ' +
          ctx.config.minTargetRecommended + 'x' + ctx.config.minTargetRecommended + ' px.',
          'Överväg en större klickyta, särskilt för mobil.');
      }
    }
  },
  {
    id: 'struktur-namn',
    category: 'struktur',
    check: function (node, ctx) {
      if (ctx.insideInstance) return;
      if (!DEFAULT_NAME.test(node.name)) return;
      var container = node.children && node.children.length > 0;
      ctx.report(container ? 'varning' : 'info', 'Lagret har standardnamnet "' + node.name + '".',
        'Ge lagret ett beskrivande namn som säger vad det är, till exempel "Kort/Produkt" eller "Header".');
    }
  },
  {
    id: 'struktur-grupp',
    category: 'struktur',
    check: function (node, ctx) {
      if (ctx.insideInstance) return;
      if (node.type === 'GROUP' && node.children && node.children.length > 1) {
        ctx.report('info', 'Gruppen innehåller ' + node.children.length + ' lager men är ingen frame.',
          'Gör om gruppen till en frame med auto layout så att innehållet anpassar sig.');
      }
    }
  },
  {
    id: 'struktur-autolayout',
    category: 'struktur',
    check: function (node, ctx) {
      if (ctx.insideInstance || ctx.depth === 0) return;
      if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return;
      if (node.layoutMode && node.layoutMode !== 'NONE') return;
      var visible = (node.children || []).filter(function (c) { return c.visible !== false; });
      if (visible.length >= 2) {
        ctx.report('varning', 'Framen har ' + visible.length + ' lager men saknar auto layout.',
          'Använd auto layout så att avstånd och ordning blir konsekventa.');
      }
    }
  },
  {
    id: 'struktur-djup',
    category: 'struktur',
    check: function (node, ctx) {
      if (ctx.insideInstance) return;
      if (ctx.depth === ctx.config.maxDepth + 1 && node.children && node.children.length) {
        ctx.report('varning', 'Lagret ligger ' + ctx.depth + ' nivåer ner i hierarkin.',
          'Platta till strukturen och ta bort onödiga wrapper-frames.');
      }
    }
  },
  {
    id: 'struktur-tom',
    category: 'struktur',
    check: function (node, ctx) {
      if (ctx.insideInstance) return;
      if ((node.type === 'FRAME' || node.type === 'GROUP') && (!node.children || !node.children.length) &&
          !(node.fills && node.fills.some(isVisiblePaint)) && !(node.strokes && node.strokes.some(isVisiblePaint))) {
        ctx.report('info', 'Framen är tom och syns inte.', 'Ta bort den om den inte behövs.');
      }
    }
  },
  {
    id: 'struktur-dold',
    category: 'struktur',
    check: function (node, ctx) {
      if (ctx.insideInstance) return;
      if (node.visible === false) {
        ctx.report('info', 'Lagret är dolt.', 'Ta bort dolda lager som inte används, eller lägg dem i en variant.');
      }
    }
  },
  {
    id: 'struktur-utanfor',
    category: 'struktur',
    check: function (node, ctx) {
      if (ctx.insideInstance || !ctx.ancestors.length || !node.bbox) return;
      var parent = ctx.ancestors[ctx.ancestors.length - 1];
      if (parent.type !== 'FRAME' && parent.type !== 'COMPONENT') return;
      if (parent.layoutMode && parent.layoutMode !== 'NONE') return;
      if (!overlaps(parent.bbox, node.bbox)) {
        ctx.report('varning', 'Lagret ligger helt utanför sin förälder "' + parent.name + '".',
          'Flytta in lagret eller lägg det i rätt frame.');
      } else if (parent.clipsContent && !contains(parent.bbox, node.bbox)) {
        ctx.report('info', 'Lagret beskärs av föräldern "' + parent.name + '".',
          'Kontrollera att det är avsiktligt.');
      }
    }
  }
];

// Kör alla regler på en lista av toppnivå-frames (normaliserade).
// Returnerar { issues, stats }.
function runRules(frames, userConfig) {
  var config = {};
  var k;
  for (k in DEFAULT_CONFIG) config[k] = DEFAULT_CONFIG[k];
  for (k in (userConfig || {})) config[k] = userConfig[k];
  var disabled = config.disabledRules || [];
  var rules = RULES.filter(function (r) { return disabled.indexOf(r.id) < 0; });

  var issues = [];
  var nodeCount = 0;

  function visit(node, ancestors, frame, insideInstance) {
    nodeCount++;
    var ctx = {
      config: config,
      ancestors: ancestors,
      depth: ancestors.length,
      insideInstance: insideInstance,
      report: null
    };
    var active = node.visible === false
      ? rules.filter(function (r) { return r.id === 'struktur-dold'; })
      : rules;
    active.forEach(function (rule) {
      ctx.report = function (severity, message, suggestion) {
        issues.push({
          ruleId: rule.id,
          category: rule.category,
          severity: severity,
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          path: ancestors.map(function (a) { return a.name; }).concat(node.name).join(' / '),
          bbox: node.bbox,
          frameId: frame.id,
          frameName: frame.name,
          message: message,
          suggestion: suggestion
        });
      };
      rule.check(node, ctx);
    });
    // Dolda lager rapporteras en gång, inte deras innehåll.
    if (node.visible === false) return;
    var nextInside = insideInstance || node.type === 'INSTANCE';
    (node.children || []).forEach(function (c) {
      visit(c, ancestors.concat(node), frame, nextInside);
    });
  }

  frames.forEach(function (f) { visit(f, [], f, f.type === 'INSTANCE'); });

  issues.sort(function (a, b) {
    return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  });

  var stats = { nodes: nodeCount, frames: frames.length, fel: 0, varning: 0, info: 0, perCategory: {} };
  issues.forEach(function (i) {
    stats[i.severity]++;
    stats.perCategory[i.category] = (stats.perCategory[i.category] || 0) + 1;
  });
  return { issues: issues, stats: stats };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runRules: runRules, RULES: RULES, CATEGORIES: CATEGORIES, contrastRatio: contrastRatio, DEFAULT_CONFIG: DEFAULT_CONFIG };
}
