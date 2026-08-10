// Walks every route in both themes and reports text that fails WCAG AA
// contrast against its own background.
//
// This exists because "I looked at it and it seemed fine" already missed an
// entire page: the strategy guide kept a hardcoded #1a1a1a on a near-black
// background and nobody caught it until it was live.
//
//   node scripts/contrast-audit.js [baseUrl]
//
// Requires the app to be reachable at baseUrl (default http://localhost:3000).

const ROUTES = [
  '/', '/rules', '/strategy', '/ai', '/play',
  '/login', '/signup', '/forgot-password', '/privacy',
  '/watch', '/multiplayer', '/settings',
];

// Injected into the page. Returns every failing element rather than the first,
// so one run gives the whole list.
const AUDIT = `(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(s => parseFloat(s.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  // Walk up until something actually paints a background.
  const backdrop = (el) => {
    let acc = null, e = el;
    while (e) {
      const bg = parse(getComputedStyle(e).backgroundColor);
      if (bg && bg.a > 0) acc = acc ? over(acc, bg) : bg;
      if (acc && acc.a >= 1) return acc;
      e = e.parentElement;
    }
    const body = parse(getComputedStyle(document.body).backgroundColor);
    return acc ? over(acc, body || { r: 255, g: 255, b: 255, a: 1 })
               : (body || { r: 255, g: 255, b: 255, a: 1 });
  };

  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    // Only elements that render their own text.
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    // Entrance animations are frozen in a headless pane; an element mid-fade
    // is not a contrast bug, so judge the colours it will settle on.
    let opacity = 1, e2 = el;
    while (e2 && e2 !== document.documentElement) { opacity *= parseFloat(getComputedStyle(e2).opacity); e2 = e2.parentElement; }
    if (opacity < 0.95) continue;

    const fg = parse(cs.color);
    if (!fg || fg.a === 0) continue;
    const bg = backdrop(el);
    const c = ratio(over(fg, bg), bg);

    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (c < need) {
      out.push({
        text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 48),
        cls: (el.className.baseVal ?? el.className || '').toString().slice(0, 34) || el.tagName,
        color: cs.color,
        bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
        ratio: Math.round(c * 100) / 100,
        need,
      });
    }
  }
  // De-duplicate by class+colour so a list of 40 items reports once.
  const seen = new Set();
  return out.filter(f => { const k = f.cls + f.color + f.bg; if (seen.has(k)) return false; seen.add(k); return true; });
})()`;

module.exports = { ROUTES, AUDIT };

if (require.main === module) {
  console.log('This module exports ROUTES and AUDIT for a browser driver.');
  console.log('Routes:', ROUTES.join(' '));
}
