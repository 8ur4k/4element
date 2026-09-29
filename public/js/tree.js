// Çözüm ağacı görünümü: hedef tepede, 4 element yapraklarda; kaydırılabilir/yakınlaştırılabilir.
import { iconHTML } from './icons.js';
import { tween } from './anim.js';

const GAPX = 112;
const GAPY = 158;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let view = null;

function layout(steps, target, baseSet) {
  const recipe = new Map(steps.map((s, i) => [s.o, { ...s, n: i + 1 }]));
  const expanded = new Set();
  const nodes = [];
  let leaf = 0;
  const build = (id, depth) => {
    const r = recipe.get(id);
    const node = { id, depth, kids: [], x: 0, ref: false, base: baseSet.has(id), n: r ? r.n : 0 };
    nodes.push(node);
    if (!r || expanded.has(id)) {
      node.ref = !!r;
      node.x = leaf++;
      return node;
    }
    expanded.add(id);
    node.kids = [build(r.a, depth + 1), build(r.b, depth + 1)];
    node.x = (node.kids[0].x + node.kids[1].x) / 2;
    return node;
  };
  const root = build(target, 0);
  return { root, nodes, leaves: leaf };
}

function initView(canvas, world) {
  const v = { canvas, world, zoom: 1, x: 0, y: 0 };
  const apply = () => {
    world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    const g = 26 * v.zoom;
    canvas.style.backgroundSize = `${g}px ${g}px`;
    canvas.style.backgroundPosition = `${v.x}px ${v.y}px`;
  };
  v.apply = apply;
  v.zoomAt = (mx, my, z) => {
    z = Math.min(2, Math.max(0.12, z));
    const wx = (mx - v.x) / v.zoom, wy = (my - v.y) / v.zoom;
    v.zoom = z; v.x = mx - wx * z; v.y = my - wy * z;
    apply();
  };
  v.animate = (z, x, y, dur = 350) => {
    const z0 = v.zoom, x0 = v.x, y0 = v.y;
    return tween(dur, (e) => { v.zoom = z0 + (z - z0) * e; v.x = x0 + (x - x0) * e; v.y = y0 + (y - y0) * e; apply(); });
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, px = v.x, py = v.y;
    canvas.classList.add('panning');
    const move = (ev) => { v.x = px + ev.clientX - sx; v.y = py + ev.clientY - sy; apply(); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      canvas.classList.remove('panning');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    v.zoomAt(e.clientX - r.left, e.clientY - r.top, v.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)));
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return v;
}

export function showTree({ overlay, steps, target, items, base, subtitle, onNext, onReplay, nextLabel }) {
  const $ = (s) => overlay.querySelector(s);
  const canvas = $('#treeCanvas'), world = $('#treeWorld');
  if (!view) {
    view = initView(canvas, world);
    const zoomBy = (f) => {
      const r = canvas.getBoundingClientRect();
      const z = Math.min(2, Math.max(0.12, view.zoom * f));
      const mx = r.width / 2, my = r.height / 2;
      const wx = (mx - view.x) / view.zoom, wy = (my - view.y) / view.zoom;
      view.animate(z, mx - wx * z, my - wy * z, 200);
    };
    $('#tZoomIn').onclick = () => zoomBy(1.25);
    $('#tZoomOut').onclick = () => zoomBy(0.8);
  }

  const baseSet = new Set(base);
  const t = items[target];
  $('#treeTitle').innerHTML = `${iconHTML(t)}<div><small>ÇÖZÜM YOLU</small><b>${esc(t.n)}</b><span>${subtitle}</span></div>`;

  // Adım listesi
  const list = $('#treeSteps');
  list.innerHTML = steps.map((s, i) => {
    const A = items[s.a], B = items[s.b], O = items[s.o];
    return `<li data-o="${s.o}" class="${i === steps.length - 1 ? 'last' : ''}">
      <span class="n">${i + 1}</span>
      ${iconHTML(A)}<span class="nm" title="${esc(A.n)}">${esc(A.n)}</span>
      <span class="op">+</span>
      ${iconHTML(B)}<span class="nm" title="${esc(B.n)}">${esc(B.n)}</span>
      <span class="op">=</span>
      ${iconHTML(O)}<span class="nm res" title="${esc(O.n)}">${esc(O.n)}</span>
    </li>`;
  }).join('');

  // Ağaç
  const { nodes, leaves } = layout(steps, target, baseSet);
  const W = Math.max(1, leaves) * GAPX;
  let maxDepth = 0;
  for (const n of nodes) maxDepth = Math.max(maxDepth, n.depth);
  const pos = (n) => ({ x: n.x * GAPX - (W - GAPX) / 2, y: n.depth * GAPY });
  let paths = '', html = '';
  for (const n of nodes) {
    const p = pos(n);
    const cls = ['tnode'];
    if (n.depth === 0) cls.push('root');
    if (n.ref) cls.push('ref');
    if (n.base) cls.push('base');
    const label = n.ref ? `${esc(items[n.id].n)} ↑${n.n}` : esc(items[n.id].n);
    html += `<div class="${cls.join(' ')}" data-id="${n.id}" data-exp="${n.kids.length ? 1 : 0}" style="left:${p.x}px;top:${p.y - (n.depth === 0 ? 32 : 25)}px">
      ${n.kids.length ? `<span class="num">${n.n}</span>` : ''}${iconHTML(items[n.id])}<div class="lbl">${label}</div></div>`;
    if (n.kids.length) {
      const jy = p.y + 80;
      paths += `<path data-p="${n.id}" d="M${p.x} ${p.y + 52}L${p.x} ${jy}"/>`;
      for (const k of n.kids) {
        const q = pos(k);
        const top = q.y - 30;
        paths += `<path data-p="${n.id}" d="M${q.x} ${top}C${q.x} ${top - 36},${p.x} ${jy + 34},${p.x} ${jy}"/>`;
      }
      html += `<div class="tree-plus" style="left:${p.x}px;top:${jy}px">+</div>`;
    }
  }
  world.innerHTML = `<svg width="1" height="1">${paths}</svg>${html}`;

  // Vurgulama
  const highlight = (id, on) => {
    world.querySelectorAll(`.tnode[data-id="${id}"][data-exp="1"]`).forEach(e => e.classList.toggle('hl', on));
    world.querySelectorAll(`path[data-p="${id}"]`).forEach(e => e.classList.toggle('hl', on));
    list.querySelectorAll(`li[data-o="${id}"]`).forEach(e => e.classList.toggle('hl', on));
  };
  list.onmouseover = (e) => { const li = e.target.closest('li'); if (li) highlight(li.dataset.o, true); };
  list.onmouseout = (e) => { const li = e.target.closest('li'); if (li) highlight(li.dataset.o, false); };
  world.onmouseover = (e) => { const n = e.target.closest('.tnode[data-exp="1"]'); if (n) highlight(n.dataset.id, true); };
  world.onmouseout = (e) => { const n = e.target.closest('.tnode[data-exp="1"]'); if (n) highlight(n.dataset.id, false); };
  list.onclick = (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const node = world.querySelector(`.tnode[data-id="${li.dataset.o}"][data-exp="1"]`);
    if (!node) return;
    const r = canvas.getBoundingClientRect();
    const x = parseFloat(node.style.left), y = parseFloat(node.style.top) + 25;
    const z = Math.max(view.zoom, 0.8);
    view.animate(z, r.width / 2 - x * z, r.height / 2 - y * z);
  };

  $('#treeNext').innerHTML = nextLabel;
  $('#treeNext').onclick = onNext;
  const rp = $('#treeReplay');
  rp.classList.toggle('hidden', !onReplay);
  rp.onclick = onReplay || null;

  overlay.classList.remove('hidden');

  const fit = (animate) => {
    const r = canvas.getBoundingClientRect();
    const tw = W + 60, th = maxDepth * GAPY + 150;
    let z = Math.min(1.1, (r.width - 40) / tw, (r.height - 40) / th);
    z = Math.max(0.3, z);
    const x = r.width / 2;
    const contentH = th * z;
    const y = contentH < r.height ? (r.height - contentH) / 2 + 50 * z : 60 * z;
    if (animate) view.animate(z, x, y); else { view.zoom = z; view.x = x; view.y = y; view.apply(); }
  };
  $('#tZoomFit').onclick = () => fit(true);
  requestAnimationFrame(() => fit(false));
}

export function hideTree(overlay) {
  overlay.classList.add('hidden');
}
