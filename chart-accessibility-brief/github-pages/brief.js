/* Interactive parts of the accessible-charts brief: headline tabs and the three ChartMuseum charts. Content only, no data calls. */
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };

  // Headline result tabs (same behaviour as the Lab brief)
  var hb = Array.prototype.slice.call(document.querySelectorAll('.hero-tabs button'));
  function show(n) {
    hb.forEach(function (b, i) {
      b.setAttribute('aria-selected', i === n);
      b.tabIndex = i === n ? 0 : -1;
      $(b.getAttribute('aria-controls')).hidden = i !== n;
    });
  }
  hb.forEach(function (b, i) {
    b.addEventListener('click', function () { show(i); });
    b.addEventListener('keydown', function (e) {
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].indexOf(e.key) < 0) return;
      e.preventDefault();
      var n = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + hb.length) % hb.length;
      show(n); hb[n].focus();
    });
  });

  // ChartMuseum test set, Table 3: visual, synthesis, visual/text, text, overall
  var GROUPS = [
    { name: 'Open models, 2B to 3B', rows: [['InternVL3-2B', 12.2, 13.5, 18.4, 30.1, 16.0], ['Qwen2.5-VL-3B', 16.7, 21.1, 26.5, 28.5, 21.0]] },
    { name: 'Open and specialized, 7B to 8B', rows: [['Qwen2.5-VL-7B', 19.4, 24.8, 36.3, 41.5, 26.8], ['InternVL3-8B', 23.5, 24.8, 32.9, 42.3, 28.2], ['Bespoke-MiniChart-7B', 26.3, 32.3, 41.0, 54.5, 34.0]] },
    { name: 'Open models, 32B and up', rows: [['InternVL3-38B', 26.3, 30.8, 35.0, 52.0, 32.1], ['InternVL3-78B', 26.9, 34.6, 41.0, 59.3, 35.2], ['Qwen2.5-VL-32B', 29.0, 36.1, 46.2, 62.6, 38.1], ['Pixtral-Large-124B', 31.6, 36.1, 40.6, 65.9, 38.5], ['Qwen2.5-VL-72B', 30.4, 35.3, 42.3, 68.3, 38.5]] },
    { name: 'Proprietary', rows: [['Gemini-1.5-Flash', 22.7, 30.8, 36.3, 56.1, 31.1], ['Gemini-1.5-Pro', 31.0, 43.6, 49.6, 65.9, 41.3], ['GPT-4o', 31.8, 45.1, 50.9, 65.9, 42.2], ['GPT-4.1', 37.1, 53.4, 54.3, 78.9, 48.4], ['GPT-4.1-mini', 43.9, 48.1, 59.8, 80.5, 52.7], ['Claude-3.5-Sonnet', 45.7, 53.4, 61.5, 78.0, 54.4], ['Claude-3.7-Sonnet', 50.6, 55.6, 69.2, 88.6, 60.3]] },
    { name: 'Proprietary, reasoning', rows: [['o3 (high)', 50.4, 63.2, 69.7, 85.4, 60.9], ['o4-mini (high)', 51.2, 66.2, 68.4, 86.2, 61.5], ['Claude-3.7-Sonnet (think)', 52.5, 56.4, 71.8, 86.2, 61.7], ['Gemini-2.5-Pro', 53.3, 64.7, 70.1, 87.8, 63.0]] }
  ];
  var HUMAN = 93.0;
  var C = { ink: '#142b36', muted: '#58666b', line: '#d9ded8', track: '#e4e8e1', teal: '#386d68', soft: '#9fb0ab', amber: '#8a4c28' };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function bar(label, v, cls) {
    return '<div class="' + (cls || '') + '"><span>' + esc(label) + '</span><strong>' + v.toFixed(1) + '%</strong>' +
      '<i' + (cls === 'muted-row' ? ' class="muted"' : '') + ' style="--bar:' + v + '%"><span class="base" style="left:' + HUMAN + '%"></span></i></div>';
  }

  // Chart 1: overall accuracy, people as the dashed amber baseline
  var host1 = $('overall-chart');
  if (host1) {
    var best = 0;
    GROUPS.forEach(function (g) { g.rows.forEach(function (r) { if (r[5] > best) best = r[5]; }); });
    var html = '<div class="human"><span>People</span><strong>93.0%</strong><i style="--bar:93%"></i></div>';
    GROUPS.forEach(function (g) {
      html += '<p class="group-label">' + esc(g.name) + '</p>';
      g.rows.forEach(function (r) { html += bar(r[0], r[5], r[5] === best ? '' : 'muted-row'); });
    });
    host1.innerHTML = html;
  }

  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  // Chart 2: visual vs text accuracy per model, drawn at the container's real width
  function drawGap() {
    var host = $('gap-chart');
    if (!host) return;
    var all = [];
    GROUPS.forEach(function (g) { g.rows.forEach(function (r) { all.push(r); }); });
    all.sort(function (a, b) { return b[5] - a[5]; });
    var W = Math.max(300, Math.min(host.clientWidth || 900, 1000));
    var narrow = W < 560;
    var left = narrow ? 150 : 190, right = narrow ? 30 : 64, y0 = 30, step = narrow ? 22 : 25, H = y0 + all.length * step + 10;
    var x = function (v) { return left + v / 100 * (W - left - right); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'font-family': 'DM Sans, Arial, sans-serif', 'font-size': narrow ? 10.5 : 12 });
    [0, 25, 50, 75, 100].forEach(function (t) {
      svg.appendChild(el('line', { x1: x(t), x2: x(t), y1: y0 - 10, y2: H - 6, stroke: C.line }));
      svg.appendChild(el('text', { x: x(t), y: 14, fill: C.muted, 'text-anchor': 'middle', 'font-size': '11' }, t + '%'));
    });
    all.forEach(function (r, i) {
      var y = y0 + i * step, g = el('g', {});
      g.appendChild(el('title', {}, r[0] + ': visual ' + r[1] + '%, text ' + r[4] + '%, gap ' + (r[4] - r[1]).toFixed(1) + ' points'));
      g.appendChild(el('text', { x: left - 10, y: y + 4, fill: C.ink, 'text-anchor': 'end' }, r[0]));
      g.appendChild(el('line', { x1: x(r[1]), x2: x(r[4]), y1: y, y2: y, stroke: C.track, 'stroke-width': '5' }));
      g.appendChild(el('circle', { cx: x(r[4]), cy: y, r: narrow ? 4.5 : 5.5, fill: C.soft }));
      g.appendChild(el('circle', { cx: x(r[1]), cy: y, r: narrow ? 4.5 : 5.5, fill: C.teal }));
      svg.appendChild(g);
    });
    var top = all[0];
    svg.appendChild(el('text', { x: x(top[4]) + 9, y: y0 + 4, fill: C.muted, 'font-size': '11' }, top[4] + '%'));
    svg.appendChild(el('text', { x: x(top[1]) - 9, y: y0 + 4, fill: C.teal, 'font-size': '11', 'font-weight': '700', 'text-anchor': 'end' }, top[1] + '%'));
    host.innerHTML = '';
    host.appendChild(svg);
  }
  drawGap();
  var lastW = 0, timer;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var h = $('gap-chart'); if (!h) return;
      if (Math.abs(h.clientWidth - lastW) > 20) { lastW = h.clientWidth; drawGap(); }
    }, 150);
  });

  // Chart 3: clutter test, values read from ChartMuseum Figure 2 (approximate)
  var CLUTTER = {
    subplot: { ai: [[4, 88], [5, 84], [6, 86.5], [7, 83.5], [8, 79.5], [9, 79]], people: [[4, 100], [6, 99], [9, 92.5]] },
    overlay: { ai: [[4, 43], [5, 25], [6, 16], [7, 16], [8, 8], [9, 6]], people: [[4, 100], [6, 97.5], [9, 86]] }
  };
  function lineChart(id, d) {
    var host = $(id); if (!host) return;
    var W = 340, H = 240, l = 40, r = 16, t = 14, b = 40;
    var x = function (n) { return l + (n - 4) / 5 * (W - l - r); };
    var y = function (v) { return t + (1 - v / 100) * (H - t - b); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', 'font-family': 'DM Sans, Arial, sans-serif', 'font-size': '11' });
    [0, 25, 50, 75, 100].forEach(function (v) {
      svg.appendChild(el('line', { x1: l, x2: W - r, y1: y(v), y2: y(v), stroke: C.line }));
      svg.appendChild(el('text', { x: l - 8, y: y(v) + 4, fill: C.muted, 'text-anchor': 'end' }, v + '%'));
    });
    [4, 5, 6, 7, 8, 9].forEach(function (n) { svg.appendChild(el('text', { x: x(n), y: H - b + 18, fill: C.muted, 'text-anchor': 'middle' }, n)); });
    svg.appendChild(el('text', { x: (l + W - r) / 2, y: H - 5, fill: C.muted, 'text-anchor': 'middle' }, 'Number of histograms'));
    [['people', C.amber, 'People', '5 4'], ['ai', C.teal, 'Claude 3.7 Sonnet', '']].forEach(function (s) {
      var pts = d[s[0]];
      var attrs = { points: pts.map(function (p) { return x(p[0]) + ',' + y(p[1]); }).join(' '), fill: 'none', stroke: s[1], 'stroke-width': '2.5' };
      if (s[3]) attrs['stroke-dasharray'] = s[3];
      svg.appendChild(el('polyline', attrs));
      pts.forEach(function (p) {
        var c = el('circle', { cx: x(p[0]), cy: y(p[1]), r: 4, fill: s[1] });
        c.appendChild(el('title', {}, s[2] + ', ' + p[0] + ' histograms: about ' + p[1] + '%'));
        svg.appendChild(c);
      });
      var last = pts[pts.length - 1];
      svg.appendChild(el('text', { x: x(last[0]) - 2, y: y(last[1]) + (s[0] === 'ai' ? 18 : -10), fill: s[1], 'text-anchor': 'end', 'font-weight': '700' }, '~' + Math.round(last[1]) + '%'));
    });
    host.appendChild(svg);
  }
  lineChart('subplot-chart', CLUTTER.subplot);
  lineChart('overlay-chart', CLUTTER.overlay);
})();
