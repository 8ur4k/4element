// 4 Element — oyun akışı.
import { Solver } from './solver.js';
import { iconHTML, uiIcon } from './icons.js';
import { Workspace } from './workspace.js';
import { showTree, hideTree } from './tree.js';
import { Hand, sleep } from './anim.js';

const $ = (s) => document.querySelector(s);
const lowerTR = (s) => s.toLocaleLowerCase('tr-TR');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => n.toLocaleString('tr-TR');

const DIFFS = {
  kolay: { name: 'Kolay', min: 3, max: 6, desc: '3–6 adımlık hedefler' },
  orta: { name: 'Orta', min: 7, max: 12, desc: '7–12 adımlık hedefler' },
  zor: { name: 'Zor', min: 13, max: 20, desc: '13–20 adımlık hedefler' },
  efsane: { name: 'Efsane', min: 21, max: 9999, desc: '21+ adımlık hedefler' },
  karisik: { name: 'Karışık', min: 4, max: 40, desc: 'her şey çıkabilir' },
};

const store = {
  get(k, d) { try { const v = localStorage.getItem('4e:' + k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('4e:' + k, JSON.stringify(v)); } catch { /* depolama kapalı */ } },
};

let LIB, SOLVER, ITEMS, N, ws, hand;
const S = {
  settings: store.get('settings', { diff: 'orta', sort: 'order' }),
  life: store.get('life', { rounds: 0, wins: 0, total: 0, best: 0, streak: 0, disc: [], recent: [] }),
  lifeDisc: null,
  R: null,
  busy: false,
  skip: null,
};
const saveLife = () => store.set('life', S.life);
const saveSettings = () => store.set('settings', S.settings);

// ——— Başlangıç ———
async function boot() {
  const res = await fetch('library.json');
  if (!res.ok) throw new Error(await res.text());
  LIB = await res.json();
  ITEMS = LIB.items;
  N = ITEMS.length;
  SOLVER = new Solver(N, LIB.recipes);
  S.lifeDisc = new Set(S.life.disc);

  $('#logo').innerHTML = LIB.base.map(id => iconHTML(ITEMS[id])).join('');
  $('#btnHint').innerHTML = `${uiIcon('bulb')}İpucu`;
  $('#btnGiveUp').innerHTML = `${uiIcon('flag')}<span>Pes Et</span>`;
  $('#btnMenu').innerHTML = uiIcon('list');
  $('#zoomIn').innerHTML = uiIcon('plus');
  $('#zoomOut').innerHTML = uiIcon('minus');
  $('#zoomFit').innerHTML = uiIcon('expand');
  $('#clearBoard').innerHTML = uiIcon('eraser');
  $('#tZoomIn').innerHTML = uiIcon('plus');
  $('#tZoomOut').innerHTML = uiIcon('minus');
  $('#tZoomFit').innerHTML = uiIcon('expand');
  $('#searchIco').innerHTML = uiIcon('search');
  $('#skipAnim').innerHTML = `${uiIcon('skip')}Atla`;

  hand = new Hand($('#hand'));
  ws = new Workspace({
    board: $('#board'),
    world: $('#world'),
    links: $('#links'),
    render: (id) => `${iconHTML(ITEMS[id])}<div class="lbl">${esc(ITEMS[id].n)}</div>`,
    onCombine: (d, t) => combine(d, t, false),
    onView: (z) => { $('#zoomLabel').textContent = Math.round(z * 100) + '%'; },
  });

  wireUI();
  newRound();
  if (new URLSearchParams(location.search).has('debug')) {
    window.__game = { S, ws, SOLVER, ITEMS, LIB, combine, newRound, doHint, playSolution };
  }
  $('#loading').classList.add('gone');
  setTimeout(() => $('#loading').remove(), 500);
}

// ——— Tur ———
function pickTarget() {
  const d = DIFFS[S.settings.diff] || DIFFS.orta;
  const recent = new Set(S.life.recent);
  const inRange = (i) => ITEMS[i].s >= d.min && ITEMS[i].s <= d.max;
  let pool = [];
  for (let i = 0; i < N; i++) if (inRange(i) && !recent.has(ITEMS[i].n)) pool.push(i);
  if (!pool.length) for (let i = 0; i < N; i++) if (inRange(i)) pool.push(i);
  if (!pool.length) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (ITEMS[i].s <= 0) continue;
      const dist = Math.abs(ITEMS[i].s - d.min);
      if (dist < bd) { bd = dist; best = i; }
    }
    return best;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function newRound() {
  hideModal();
  hideTree($('#treeView'));
  S.busy = false;
  ws.locked = false;
  $('#skipAnim').classList.add('hidden');
  ws.clear();
  const target = pickTarget();
  S.R = {
    target,
    opt: ITEMS[target].s,
    found: [...LIB.base],
    foundSet: new Set(LIB.base),
    tried: new Set(),
    attempts: 0,
    hints: 0,
    over: false,
    won: false,
    counted: false,
  };
  S.life.recent.push(ITEMS[target].n);
  if (S.life.recent.length > 60) S.life.recent.splice(0, S.life.recent.length - 60);
  saveLife();
  $('#search').value = '';
  $('#quest').classList.remove('won');
  $('#btnGiveUp').innerHTML = `${uiIcon('flag')}<span>Pes Et</span>`;
  renderQuest();
  renderInventory();
  updateStats();
  ws.resetView(false);
  const offs = [-165, -55, 55, 165];
  LIB.base.forEach((id, i) => setTimeout(() => ws.spawn(id, offs[i] || i * 110, 0, { pop: true }), 80 + i * 70));
}

function renderQuest() {
  const R = S.R, t = ITEMS[R.target];
  $('#questIcon').innerHTML = iconHTML(t);
  $('#questName').textContent = t.n;
  const d = DIFFS[S.settings.diff] || DIFFS.orta;
  $('#questMeta').textContent = `${LIB.cats[t.k]} · en kısa yol ≈ ${R.opt} birleştirme · ${d.name}`;
}

function scoreNow(R = S.R) {
  const base = R.opt * 100;
  const eff = R.opt / Math.max(R.opt, R.attempts, 1);
  const effMul = 0.35 + 0.65 * eff;
  const hintMul = Math.max(0.05, Math.pow(0.8, R.hints));
  return { base, eff, effMul, hintMul, total: Math.round(base * effMul * hintMul) };
}

function updateStats() {
  const R = S.R;
  $('#stAttempts').textContent = R.attempts;
  $('#stHints').textContent = R.hints;
  $('#stFound').textContent = R.found.length;
  $('#stScore').textContent = R.over && !R.won ? '0' : fmt(scoreNow().total);
  $('#discCount').textContent = `${R.found.length} / ${fmt(N)}`;
}

function bump(id) {
  const el = $('#' + id).parentElement;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ——— Birleştirme ———
function combine(d, t, fromHint) {
  const R = S.R;
  const outs = SOLVER.combine(d.item, t.item);
  const key = SOLVER.key(d.item, t.item);
  if (!R.over && !R.tried.has(key)) {
    R.tried.add(key);
    if (!fromHint) { R.attempts++; bump('stAttempts'); }
  }
  if (!outs) { ws.reject(d, t); updateStats(); return null; }
  const x = t.x, y = t.y;
  ws.remove(d, 'merge');
  ws.remove(t, 'merge');
  ws.burst(x, y);
  const made = [];
  outs.forEach((o, i) => {
    const isNew = !R.foundSet.has(o);
    const inst = ws.spawn(o, x + (i - (outs.length - 1) / 2) * 100, y, { pop: true, isNew });
    made.push(inst);
    if (isNew) discover(o, d.item, t.item);
    if (o === R.target && !R.over) { inst.el.classList.add('goal'); win(); }
  });
  updateStats();
  return made;
}

function discover(id, a, b) {
  const R = S.R;
  R.found.push(id);
  R.foundSet.add(id);
  const name = ITEMS[id].n;
  if (!S.lifeDisc.has(name)) { S.lifeDisc.add(name); S.life.disc.push(name); saveLife(); }
  renderInventory(id);
  toast(id, a, b);
}

function toast(id, a, b) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${iconHTML(ITEMS[id])}<div><small>YENİ KEŞİF</small><b>${esc(ITEMS[id].n)}</b><span class="rc">${esc(ITEMS[a].n)} + ${esc(ITEMS[b].n)}</span></div>`;
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => el.remove(), 2700);
}

// ——— Envanter ———
function renderInventory(freshId) {
  const R = S.R;
  const q = lowerTR($('#search').value.trim());
  let ids = R.found.slice();
  if (q) ids = ids.filter(id => lowerTR(ITEMS[id].n).includes(q));
  const mode = S.settings.sort;
  const byName = (a, b) => ITEMS[a].n.localeCompare(ITEMS[b].n, 'tr');
  let html = '';
  const cell = (id) => `<div class="inv-item" data-id="${id}" title="${esc(ITEMS[id].n)}">${iconHTML(ITEMS[id])}<span>${esc(ITEMS[id].n)}</span></div>`;
  if (mode === 'az') ids.sort(byName);
  if (mode === 'cat') {
    ids.sort((a, b) => (ITEMS[a].k - ITEMS[b].k) || byName(a, b));
    let last = -1;
    for (const id of ids) {
      if (ITEMS[id].k !== last) { last = ITEMS[id].k; html += `<div class="inv-cat">${esc(LIB.cats[last])}</div>`; }
      html += cell(id);
    }
  } else {
    html = ids.map(cell).join('');
  }
  if (!ids.length) html = `<div class="inv-empty">“${esc($('#search').value)}” ile eşleşen keşif yok.</div>`;
  const inv = $('#inventory');
  inv.innerHTML = html;
  document.querySelectorAll('.sort button').forEach(b => b.classList.toggle('on', b.dataset.sort === mode));
  if (freshId != null) {
    const el = inv.querySelector(`[data-id="${freshId}"]`);
    if (el) { el.classList.add('fresh'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
}

function makeGhost(id) {
  const g = document.createElement('div');
  g.className = 'drag-ghost';
  g.innerHTML = iconHTML(ITEMS[id]);
  document.body.appendChild(g);
  return g;
}
const moveGhost = (g, x, y) => { g.style.left = x + 'px'; g.style.top = y + 'px'; };

function wireInventory() {
  const inv = $('#inventory');
  inv.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.inv-item');
    if (!el || e.button !== 0 || S.busy) return;
    e.preventDefault();
    const id = +el.dataset.id;
    const sx = e.clientX, sy = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) ghost = makeGhost(id);
      if (!ghost) return;
      moveGhost(ghost, ev.clientX, ev.clientY);
      if (ws.contains(ev.clientX, ev.clientY)) {
        const w = ws.toWorld(ev.clientX, ev.clientY);
        ws.setHover(ws.hitTest(w.x, w.y));
      } else ws.setHover(null);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!ghost) {
        const spot = ws.freeSpot();
        ws.spawn(id, spot.x, spot.y, { pop: true });
        return;
      }
      ghost.remove();
      const target = ws.hover;
      ws.setHover(null);
      if (!ws.contains(ev.clientX, ev.clientY)) return;
      const w = ws.toWorld(ev.clientX, ev.clientY);
      const inst = ws.spawn(id, w.x, w.y, { pop: !target });
      if (target) combine(inst, target, false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

// ——— Kazanma ———
function win() {
  const R = S.R;
  R.over = true; R.won = true;
  const sc = scoreNow();
  if (!R.counted) {
    R.counted = true;
    S.life.rounds++; S.life.wins++; S.life.streak++;
    S.life.total += sc.total;
    S.life.best = Math.max(S.life.best, sc.total);
    saveLife();
  }
  $('#quest').classList.add('won');
  $('#btnGiveUp').innerHTML = `${uiIcon('play')}<span>Sıradaki</span>`;
  setTimeout(() => showWin(sc), 950);
}

function showWin(sc) {
  const R = S.R, t = ITEMS[R.target];
  modal(`
    <div class="modal-hero">${iconHTML(t)}<div><small class="win-title">GÖREV TAMAMLANDI</small><b>${esc(t.n)}</b></div></div>
    <div class="score-rows">
      <div>Hedefin derinliği <b>${R.opt} adım → ${fmt(sc.base)} puan</b></div>
      <div>Denediğin farklı birleşim <b>${R.attempts}</b></div>
      <div>Verimlilik <b>%${Math.round(sc.eff * 100)} → ×${sc.effMul.toFixed(2)}</b></div>
      <div>Kullanılan ipucu (${R.hints}) <b>×${sc.hintMul.toFixed(2)}</b></div>
      <div class="total">Tur puanı <b>${fmt(sc.total)}</b></div>
    </div>
    <p style="margin-top:12px">Toplam puan: <b style="color:var(--text)">${fmt(S.life.total)}</b> · Seri: <b style="color:var(--text)">${S.life.streak}</b></p>
    <div class="modal-btns">
      <button class="btn ghost" data-act="tree">${uiIcon('list')}En kısa yolu gör</button>
      <button class="btn ok" data-act="next">Sıradaki görev ${uiIcon('play')}</button>
    </div>`, {
    tree: () => { hideModal(); openTree(SOLVER.plan(R.target, LIB.base), false); },
    next: () => newRound(),
  });
}

// ——— Pes etme & çözüm ———
function giveUp() {
  if (S.busy) return;
  const R = S.R;
  if (R.over) { newRound(); return; }
  const t = ITEMS[R.target];
  modal(`
    <div class="modal-hero">${iconHTML(t)}<div><small>HEDEF</small><b>${esc(t.n)}</b></div></div>
    <h3>Pes mi ediyorsun?</h3>
    <p>İstersen doğrudan yeni bir göreve geç, istersen önce bu hedefe 4 elementten nasıl ulaşılabileceğini izle.</p>
    <div class="modal-btns">
      <button class="btn" data-act="new">${uiIcon('refresh')}Yeni görev</button>
      <button class="btn primary" data-act="solve">${uiIcon('eye')}Çözüme bak</button>
    </div>
    <div class="modal-btns"><button class="btn ghost" data-act="close">Vazgeç, devam et</button></div>`, {
    new: () => { countLoss(); newRound(); },
    solve: () => { countLoss(); playSolution(); },
    close: () => hideModal(),
  });
}

function countLoss() {
  const R = S.R;
  if (R.counted) return;
  R.counted = true;
  R.over = true;
  S.life.rounds++; S.life.streak = 0;
  saveLife();
  updateStats();
}

async function playSolution() {
  hideModal();
  hideTree($('#treeView'));
  const R = S.R;
  const steps = SOLVER.plan(R.target, LIB.base);
  if (!steps) return;
  S.busy = true;
  ws.locked = true;
  const skip = { v: false };
  const skipBtn = $('#skipAnim');
  skipBtn.classList.remove('hidden');
  skipBtn.onclick = () => { skip.v = true; };

  // Katmanlara yerleşim: 4 element altta, hedef tepede
  const lvl = new Map(LIB.base.map(b => [b, 0]));
  const used = new Set();
  for (const s of steps) { used.add(s.a); used.add(s.b); }
  for (const s of steps) lvl.set(s.o, 1 + Math.max(lvl.get(s.a), lvl.get(s.b)));
  const recipeOf = new Map(steps.map(s => [s.o, s]));
  const rows = new Map();
  for (const id of [...LIB.base.filter(b => used.has(b)), ...steps.map(s => s.o)]) {
    const L = lvl.get(id);
    if (!rows.has(L)) rows.set(L, []);
    rows.get(L).push(id);
  }
  const maxL = Math.max(...rows.keys());
  const pos = new Map();
  const GX = 118, GY = 150;
  for (let L = 0; L <= maxL; L++) {
    const ids = rows.get(L) || [];
    if (L > 0) {
      const bary = (id) => { const s = recipeOf.get(id); return (pos.get(s.a).x + pos.get(s.b).x) / 2; };
      ids.sort((p, q) => bary(p) - bary(q));
    }
    ids.forEach((id, i) => pos.set(id, { x: (i - (ids.length - 1) / 2) * GX, y: (maxL / 2 - L) * GY }));
  }
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of pos.values()) {
    box.minX = Math.min(box.minX, p.x); box.maxX = Math.max(box.maxX, p.x);
    box.minY = Math.min(box.minY, p.y); box.maxY = Math.max(box.maxY, p.y);
  }

  ws.clear();
  await ws.fitBox(box, 80, 1.1);
  for (const b of LIB.base) if (used.has(b)) { const p = pos.get(b); ws.spawn(b, p.x, p.y, { pop: true }); }
  await sleep(450);

  const dur = Math.max(150, Math.min(520, 9000 / Math.max(1, steps.length)));
  let i = 0;
  for (; i < steps.length && !skip.v; i++) {
    const s = steps[i];
    const pa = pos.get(s.a), pb = pos.get(s.b), po = pos.get(s.o);
    const fa = ws.spawn(s.a, pa.x, pa.y, { fly: true });
    const fb = ws.spawn(s.b, pb.x, pb.y, { fly: true });
    await Promise.all([ws.tween(fa, po, dur), ws.tween(fb, po, dur)]);
    ws.remove(fa, null); ws.remove(fb, null);
    ws.link(pa, po); ws.link(pb, po);
    const inst = ws.spawn(s.o, po.x, po.y, { pop: true });
    if (s.o === R.target) inst.el.classList.add('goal');
    ws.burst(po.x, po.y);
    await sleep(dur * 0.35);
  }
  for (; i < steps.length; i++) {
    const s = steps[i];
    const pa = pos.get(s.a), pb = pos.get(s.b), po = pos.get(s.o);
    ws.link(pa, po); ws.link(pb, po);
    const inst = ws.spawn(s.o, po.x, po.y);
    if (s.o === R.target) inst.el.classList.add('goal');
  }
  skipBtn.classList.add('hidden');
  await sleep(skip.v ? 250 : 1000);
  openTree(steps, true);
}

function openTree(steps, fromGiveUp) {
  const R = S.R;
  showTree({
    overlay: $('#treeView'),
    steps,
    target: R.target,
    items: ITEMS,
    base: LIB.base,
    subtitle: `4 elementten ${steps.length} birleştirmede`,
    nextLabel: `Sıradaki görev ${uiIcon('play')}`,
    onNext: () => newRound(),
    onReplay: fromGiveUp ? () => playSolution() : null,
  });
  $('#treeReplay').innerHTML = `${uiIcon('refresh')}Tekrar izle`;
}

// ——— İpucu ———
async function doHint() {
  const R = S.R;
  if (S.busy || R.over) return;
  const steps = SOLVER.plan(R.target, R.found);
  if (!steps || !steps.length) return;
  const s = steps[0];
  R.hints++;
  bump('stHints');
  updateStats();
  S.busy = true;
  ws.locked = true;
  $('#blocker').classList.remove('hidden');
  try {
    const hb = $('#btnHint').getBoundingClientRect();
    hand.show(hb.left + hb.width / 2, hb.bottom + 8);
    await sleep(120);
    let A = ws.findVisible(s.a);
    if (!A) A = await dragFromInventory(s.a, ws.freeSpot(), null);
    let B = ws.findVisible(s.b, A);
    if (B) await dragInstance(B, A);
    else B = await dragFromInventory(s.b, { x: A.x, y: A.y }, A);
    ws.setHover(null);
    combine(B, A, true);
    await sleep(380);
  } finally {
    hand.hide();
    $('#blocker').classList.add('hidden');
    ws.setHover(null);
    ws.locked = false;
    S.busy = false;
  }
}

async function dragFromInventory(id, dest, onto) {
  const inv = $('#inventory');
  let el = inv.querySelector(`.inv-item[data-id="${id}"]`);
  if (!el) { $('#search').value = ''; renderInventory(); el = inv.querySelector(`.inv-item[data-id="${id}"]`); }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  await sleep(380);
  const r = el.getBoundingClientRect();
  const sx = r.left + r.width / 2, sy = r.top + 30;
  await hand.moveTo(sx, sy, 520);
  el.classList.add('flash');
  await hand.press();
  const ghost = makeGhost(id);
  moveGhost(ghost, sx, sy);
  const to = ws.toScreen(dest.x, dest.y);
  await hand.moveTo(to.x, to.y, 700, (x, y) => {
    moveGhost(ghost, x, y);
    if (onto) ws.setHover(Math.hypot(x - to.x, y - to.y) < 60 ? onto : null);
  });
  await hand.release();
  ghost.remove();
  el.classList.remove('flash');
  return ws.spawn(id, dest.x, dest.y, { pop: !onto });
}

async function dragInstance(inst, onto) {
  const s = ws.toScreen(inst.x, inst.y);
  await hand.moveTo(s.x, s.y, 480);
  await hand.press();
  inst.el.classList.add('dragging');
  inst.el.style.zIndex = ++ws.z;
  const to = ws.toScreen(onto.x, onto.y);
  await hand.moveTo(to.x, to.y, 650, (x, y) => {
    const w = ws.toWorld(x, y);
    ws.moveTo(inst, w.x, w.y);
    ws.setHover(Math.hypot(x - to.x, y - to.y) < 60 ? onto : null);
  });
  inst.el.classList.remove('dragging');
  await hand.release();
}

// ——— Modal & menü ———
let modalActions = null;
function modal(html, actions = {}, wide = false) {
  const card = $('#modalCard');
  card.className = 'modal-card' + (wide ? ' wide' : '');
  card.innerHTML = html;
  modalActions = actions;
  $('#modal').classList.remove('hidden');
}
function hideModal() { $('#modal').classList.add('hidden'); modalActions = null; }

function openMenu(tab = 'game') {
  const L = S.life;
  const diffBtns = Object.entries(DIFFS).map(([k, d]) =>
    `<button data-diff="${k}" class="${S.settings.diff === k ? 'on' : ''}"><b>${d.name}</b><small>${d.desc}</small></button>`).join('');
  let body = '';
  if (tab === 'game') {
    body = `
      <div class="menu-section"><h4>Zorluk</h4><div class="seg" id="diffSeg">${diffBtns}</div></div>
      <div class="menu-section"><h4>İstatistik</h4>
        <div class="life-grid">
          <div><b>${fmt(L.total)}</b><span>toplam puan</span></div>
          <div><b>${L.wins}/${L.rounds}</b><span>kazanılan tur</span></div>
          <div><b>${fmt(L.best)}</b><span>en iyi tur</span></div>
          <div><b>${L.streak}</b><span>seri</span></div>
        </div>
      </div>
      <div class="menu-section"><h4>Nasıl oynanır?</h4>
        <ul class="help-list">
          <li>Her turda külliyattan rastgele bir <b>hedef</b> seçilir. Ateş, Su, Toprak ve Hava ile başlarsın.</li>
          <li>Sağdaki keşiflerden öğeleri ortadaki alana sürükle; bir öğeyi diğerinin üstüne bırakınca birleşirler.</li>
          <li><kbd>Orta tuş</kbd> veya boş alanda sol tuşla kaydır, <kbd>tekerlek</kbd> ile yakınlaş.</li>
          <li><kbd>Sağ tık</kbd> öğeyi siler, <kbd>çift tık</kbd> kopyalar. Keşiflerdeki bir öğeye tıklamak onu alana koyar.</li>
          <li>Puan: hedefin derinliği × verimlilik (en kısa yol ÷ denediğin farklı birleşim) × ipucu cezası (her ipucu puanı %20 azaltır).</li>
          <li><b>İpucu</b> (<kbd>H</kbd>), elindekilerle hedefe bir adım yaklaştıran birleştirmeyi senin yerine yapar.</li>
          <li>Aynı ikiliyi tekrar denemek deneme sayını artırmaz; yalnızca farklı birleşimler sayılır.</li>
        </ul>
      </div>
      <div class="modal-btns">
        <button class="btn ghost" data-act="close">Kapat</button>
        <button class="btn primary" data-act="restart">${uiIcon('refresh')}Bu zorlukta yeni görev</button>
      </div>`;
  } else {
    const disc = S.life.disc.filter(n => ITEMS.some(it => it.n === n));
    const byName = new Map(ITEMS.map((it, i) => [it.n, i]));
    const cells = disc.slice().sort((a, b) => a.localeCompare(b, 'tr'))
      .map(n => { const it = ITEMS[byName.get(n)]; return `<div>${iconHTML(it)}<span>${esc(it.n)}</span></div>`; }).join('');
    body = `
      <p>Tüm turlar boyunca keşfettiğin öğeler: <b style="color:var(--text)">${fmt(disc.length)}</b> / ${fmt(N)} (%${(disc.length / N * 100).toFixed(1)})</p>
      <div class="encyclo">${cells || '<div style="grid-column:1/-1">Henüz keşif yok.</div>'}</div>
      <div class="modal-btns"><button class="btn ghost" data-act="close">Kapat</button><button class="btn danger" data-act="reset">İstatistikleri sıfırla</button></div>`;
  }
  modal(`
    <div class="tabs"><button data-tab="game" class="${tab === 'game' ? 'on' : ''}">Oyun</button><button data-tab="enc" class="${tab === 'enc' ? 'on' : ''}">Ansiklopedi</button></div>
    ${body}`, {
    close: () => hideModal(),
    restart: () => { if (!S.R.won && (S.R.attempts || S.R.hints)) countLoss(); newRound(); },
    reset: () => {
      S.life = { rounds: 0, wins: 0, total: 0, best: 0, streak: 0, disc: [], recent: [] };
      S.lifeDisc = new Set();
      saveLife();
      openMenu('enc');
    },
  }, true);
}

function wireUI() {
  $('#btnHint').onclick = doHint;
  $('#btnGiveUp').onclick = giveUp;
  $('#btnMenu').onclick = () => { if (!S.busy) openMenu('game'); };
  $('#zoomIn').onclick = () => ws.zoomBy(1.25);
  $('#zoomOut').onclick = () => ws.zoomBy(0.8);
  $('#zoomFit').onclick = () => ws.fit();
  $('#clearBoard').onclick = () => { if (!S.busy) ws.clear(); };
  $('#search').addEventListener('input', () => renderInventory());
  document.querySelectorAll('.sort button').forEach(b => {
    b.onclick = () => { S.settings.sort = b.dataset.sort; saveSettings(); renderInventory(); };
  });
  $('#modal').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act && modalActions && modalActions[act.dataset.act]) { modalActions[act.dataset.act](); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) { openMenu(tab.dataset.tab); return; }
    const diff = e.target.closest('[data-diff]');
    if (diff) {
      S.settings.diff = diff.dataset.diff;
      saveSettings();
      document.querySelectorAll('#diffSeg button').forEach(x => x.classList.toggle('on', x === diff));
      return;
    }
    if (e.target === $('#modal') && !S.busy) hideModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) hideModal();
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'h' || e.key === 'H') doHint();
  });
  wireInventory();
}

boot().catch((err) => {
  console.error(err);
  $('#loading').innerHTML = `<p style="max-width:560px;white-space:pre-wrap;color:#ffb3b3">Yüklenemedi:\n${esc(err.message)}</p>`;
});
