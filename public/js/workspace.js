// Serbest birleştirme alanı: kaydırma, yakınlaştırma, sürükle-bırak, silme, kopyalama.
import { tween } from './anim.js';

const HIT = 42;          // birleştirme için merkezler arası azami uzaklık (dünya px)
const GRID = 28;

export class Workspace {
  // judge(sürüklenen, hedef) → 'new' (bu turda yeni bir şey çıkar) | 'old' (zaten bulunmuş bir
  // şey çıkar) | 'no' (birleşmez) | 'wait' (sonuç henüz bilinmiyor)
  constructor({ board, world, links, render, judge, onCombine, onView }) {
    this.board = board;
    this.world = world;
    this.links = links;
    this.render = render;
    this.judge = judge;
    this.onCombine = onCombine;
    this.onView = onView;
    this.insts = new Map();
    this.seq = 1;
    this.z = 10;
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.locked = false;
    this.hover = null;
    this.bind();
    this.resetView(false);
  }

  // ——— Koordinatlar ———
  rect() { return this.board.getBoundingClientRect(); }
  toWorld(cx, cy) {
    const r = this.rect();
    return { x: (cx - r.left - this.pan.x) / this.zoom, y: (cy - r.top - this.pan.y) / this.zoom };
  }
  toScreen(x, y) {
    const r = this.rect();
    return { x: r.left + this.pan.x + x * this.zoom, y: r.top + this.pan.y + y * this.zoom };
  }
  contains(cx, cy) {
    const r = this.rect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }
  isVisible(x, y, margin = 60) {
    const s = this.toScreen(x, y), r = this.rect();
    return s.x > r.left + margin && s.x < r.right - margin && s.y > r.top + margin && s.y < r.bottom - margin - 30;
  }

  apply() {
    this.world.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    const g = GRID * this.zoom;
    this.board.style.backgroundSize = `${g}px ${g}px`;
    this.board.style.backgroundPosition = `${this.pan.x}px ${this.pan.y}px`;
    if (this.onView) this.onView(this.zoom);
  }

  resetView(animate = true) {
    const r = this.rect();
    if (animate) return this.animateView(1, r.width / 2, r.height / 2);
    this.zoom = 1; this.pan.x = r.width / 2; this.pan.y = r.height / 2;
    this.apply();
  }

  animateView(z, px, py, dur = 450) {
    const z0 = this.zoom, x0 = this.pan.x, y0 = this.pan.y;
    return tween(dur, (e) => {
      this.zoom = z0 + (z - z0) * e;
      this.pan.x = x0 + (px - x0) * e;
      this.pan.y = y0 + (py - y0) * e;
      this.apply();
    });
  }

  zoomAt(cx, cy, z) {
    z = Math.min(2.5, Math.max(0.15, z));
    const r = this.rect();
    const mx = cx - r.left, my = cy - r.top;
    const wx = (mx - this.pan.x) / this.zoom, wy = (my - this.pan.y) / this.zoom;
    this.zoom = z;
    this.pan.x = mx - wx * z;
    this.pan.y = my - wy * z;
    this.apply();
  }

  zoomBy(f) {
    const r = this.rect();
    const z = Math.min(2.5, Math.max(0.15, this.zoom * f));
    const mx = r.width / 2, my = r.height / 2;
    const wx = (mx - this.pan.x) / this.zoom, wy = (my - this.pan.y) / this.zoom;
    return this.animateView(z, mx - wx * z, my - wy * z, 220);
  }

  fitBox(box, pad = 90, maxZoom = 1.2) {
    const r = this.rect();
    const w = box.maxX - box.minX + pad * 2;
    const h = box.maxY - box.minY + pad * 2 + 30;
    const z = Math.min(maxZoom, Math.max(0.15, Math.min(r.width / w, r.height / h)));
    const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2 + 12;
    return this.animateView(z, r.width / 2 - cx * z, r.height / 2 - cy * z);
  }

  fit() {
    if (!this.insts.size) return this.resetView();
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const i of this.insts.values()) {
      box.minX = Math.min(box.minX, i.x); box.maxX = Math.max(box.maxX, i.x);
      box.minY = Math.min(box.minY, i.y); box.maxY = Math.max(box.maxY, i.y);
    }
    return this.fitBox(box);
  }

  // ——— Örnekler ———
  spawn(item, x, y, { pop = false, isNew = false, fly = false } = {}) {
    const el = document.createElement('div');
    el.className = 'inst' + (pop ? ' pop' : '') + (isNew ? ' isnew' : '') + (fly ? ' fly' : '');
    el.innerHTML = this.render(item);
    const inst = { id: this.seq++, item, x, y, el };
    el.dataset.id = inst.id;
    el.style.zIndex = ++this.z;
    this.world.appendChild(el);
    this.insts.set(inst.id, inst);
    this.place(inst);
    if (pop) setTimeout(() => el.classList.remove('pop'), 500);
    if (isNew) setTimeout(() => el.classList.remove('isnew'), 2600);
    return inst;
  }
  place(inst) { inst.el.style.transform = `translate(${inst.x}px, ${inst.y}px)`; }
  moveTo(inst, x, y) { inst.x = x; inst.y = y; this.place(inst); }
  has(inst) { return inst && this.insts.has(inst.id); }

  remove(inst, cls = 'bye') {
    if (!this.insts.has(inst.id)) return;
    this.insts.delete(inst.id);
    if (this.hover === inst) this.hover = null;
    if (!cls) { inst.el.remove(); return; }
    inst.el.classList.add(cls);
    setTimeout(() => inst.el.remove(), 240);
  }

  clear() {
    for (const i of this.insts.values()) i.el.remove();
    this.insts.clear();
    this.links.innerHTML = '';
    this.world.querySelectorAll('.burst, .glow').forEach(e => e.remove());
    this.hover = null;
  }

  hitTest(x, y, exclude) {
    let best = null, bd = HIT;
    for (const i of this.insts.values()) {
      if (i === exclude || i.el.classList.contains('fly')) continue;
      const d = Math.hypot(i.x - x, i.y - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Hedef çerçevesi: yeşil yeni bir şey, mavi zaten bulunmuş bir şey, kırmızı birleşmez.
  setHover(inst, item) {
    const state = inst ? (this.judge ? this.judge(item, inst.item) : 'new') : null;
    if (this.hover === inst && this.hoverState === state) return;
    if (this.hover) this.hover.el.classList.remove('target', 'hv-new', 'hv-old', 'hv-no', 'hv-wait');
    this.hover = inst;
    this.hoverItem = item;
    this.hoverState = state;
    if (inst) inst.el.classList.add('target', 'hv-' + state);
  }

  refreshHover() {
    if (this.hover) this.setHover(this.hover, this.hoverItem);
  }

  // Görünür alanda, verilen öğenin (tercihen merkeze yakın) bir örneği
  findVisible(item, exclude) {
    const r = this.rect();
    const c = this.toWorld(r.left + r.width / 2, r.top + r.height / 2);
    let best = null, bd = Infinity;
    for (const i of this.insts.values()) {
      if (i.item !== item || i === exclude || i.el.classList.contains('fly')) continue;
      if (!this.isVisible(i.x, i.y, 40)) continue;
      const d = Math.hypot(i.x - c.x, i.y - c.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  freeSpot(near) {
    const r = this.rect();
    const c = near || this.toWorld(r.left + r.width * 0.5, r.top + r.height * 0.48);
    for (let ring = 0; ring < 16; ring++) {
      const n = ring === 0 ? 1 : ring * 6;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.7;
        const d = ring * 92;
        const x = c.x + Math.cos(a) * d;
        const y = c.y + Math.sin(a) * d * 0.75;
        if (!this.isVisible(x, y, 70)) continue;
        let ok = true;
        for (const i of this.insts.values()) {
          if (Math.hypot(i.x - x, i.y - y) < 96) { ok = false; break; }
        }
        if (ok) return { x, y };
      }
    }
    return c;
  }

  tween(inst, to, dur) {
    const x0 = inst.x, y0 = inst.y;
    return tween(dur, (e) => this.moveTo(inst, x0 + (to.x - x0) * e, y0 + (to.y - y0) * e));
  }

  link(a, b) {
    const my = (a.y + b.y) / 2;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', `M${a.x} ${a.y - 10}C${a.x} ${my},${b.x} ${my},${b.x} ${b.y + 10}`);
    this.links.appendChild(p);
  }

  burst(x, y, color) {
    const b = document.createElement('div');
    b.className = 'burst';
    b.style.transform = `translate(${x}px, ${y}px)`;
    let h = '';
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const d = 40 + Math.random() * 26;
      h += `<i style="--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;${color ? `background:${color}` : ''}"></i>`;
    }
    b.innerHTML = h;
    this.world.appendChild(b);
    setTimeout(() => b.remove(), 700);
  }

  // Yeni keşifte öğenin arkasında bir anlık ışık halkası
  glow(x, y) {
    const g = document.createElement('div');
    g.className = 'glow';
    g.style.transform = `translate(${x}px, ${y}px)`;
    this.world.appendChild(g);
    setTimeout(() => g.remove(), 1000);
  }

  // Sonucu sonradan gelen (yapay zeka) birleşmeyen çift için kısa kırmızı parıltı
  nope(inst) {
    inst.el.classList.remove('nope-flash'); void inst.el.offsetWidth; inst.el.classList.add('nope-flash');
    setTimeout(() => inst.el.classList.remove('nope-flash'), 650);
  }

  // ——— Olaylar ———
  bind() {
    const b = this.board;
    b.addEventListener('pointerdown', (e) => this.down(e));
    b.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.locked) return;
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016));
      this.zoomAt(e.clientX, e.clientY, this.zoom * f);
    }, { passive: false });
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.locked) return;
      const inst = this.instFrom(e.target);
      if (inst) this.remove(inst);
    });
    b.addEventListener('dblclick', (e) => {
      if (this.locked) return;
      const inst = this.instFrom(e.target);
      if (!inst) return;
      const spot = this.nearFree(inst.x + 70, inst.y + 18);
      this.spawn(inst.item, spot.x, spot.y, { pop: true });
    });
    b.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    b.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    // Alan boyutu değişince görünen merkezi sabit tut
    let last = null;
    new ResizeObserver(() => {
      const r = this.rect();
      if (last) {
        this.pan.x += (r.width - last.w) / 2;
        this.pan.y += (r.height - last.h) / 2;
        this.apply();
      }
      last = { w: r.width, h: r.height };
    }).observe(b);
  }

  nearFree(x, y) {
    for (let k = 0; k < 10; k++) {
      let ok = true;
      for (const i of this.insts.values()) if (Math.hypot(i.x - x, i.y - y) < 60) { ok = false; break; }
      if (ok) return { x, y };
      y += 40; x += (k % 2 ? -1 : 1) * 30;
    }
    return { x, y };
  }

  instFrom(t) {
    const el = t.closest && t.closest('.inst');
    return el ? this.insts.get(+el.dataset.id) : null;
  }

  down(e) {
    if (this.locked) return;
    if (e.button === 1) { e.preventDefault(); this.startPan(e); return; }
    if (e.button !== 0) return;
    const inst = this.instFrom(e.target);
    if (inst) this.startDrag(inst, e); else this.startPan(e);
  }

  startPan(e) {
    const sx = e.clientX, sy = e.clientY, px = this.pan.x, py = this.pan.y;
    this.board.classList.add('panning');
    const move = (ev) => { this.pan.x = px + ev.clientX - sx; this.pan.y = py + ev.clientY - sy; this.apply(); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.board.classList.remove('panning');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  startDrag(inst, e) {
    const p = this.toWorld(e.clientX, e.clientY);
    const ox = inst.x - p.x, oy = inst.y - p.y;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    inst.el.style.zIndex = ++this.z;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      if (!moved) { moved = true; inst.el.classList.add('dragging'); }
      const q = this.toWorld(ev.clientX, ev.clientY);
      this.moveTo(inst, q.x + ox, q.y + oy);
      this.setHover(this.hitTest(inst.x, inst.y, inst), inst.item);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      inst.el.classList.remove('dragging');
      const t = this.hover;
      this.setHover(null);
      if (moved && t && this.has(inst) && this.has(t)) this.onCombine(inst, t);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}
