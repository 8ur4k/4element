// 4 Element — oyun akışı.
import { Solver } from './solver.js';
import { iconHTML, uiIcon } from './icons.js';
import { Workspace } from './workspace.js';
import { showTree, hideTree } from './tree.js';
import { sleep } from './anim.js';
import { AIWorld, AIEngine, AI_CATS, KINDS, pairKey, normName } from './ai.js';
import { chime, unlockAudio } from './sfx.js';

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

// ITEMS/N/CATS o anki moda göre ya külliyatı ya da yapay zeka dünyasını gösterir.
let LIB, SOLVER, ITEMS, N, CATS, ws, AIW, AIE, GOALS;
// Yapay zeka modunda hedef havuzu: külliyatta en az bu kadar adım uzaktaki öğeler
const AI_GOAL_MIN = 35;
const S = {
  settings: store.get('settings', { diff: 'orta', sort: 'order', ai: false, sound: true }),
  life: store.get('life', { rounds: 0, wins: 0, total: 0, best: 0, streak: 0, disc: [], recent: [] }),
  lifeDisc: null,
  aiLife: store.get('ailife', { disc: [], recent: [], rounds: 0, wins: 0 }),
  aiDisc: null,
  aiKey: store.get('aikey', { k: '' }).k,
  aiNext: store.get('ainext', { n: '' }).n,   // arka planda seçilmiş sıradaki hedef
  aiInfo: null,
  R: null,
  busy: false,
  skip: null,
};
const saveLife = () => store.set('life', S.life);
const saveSettings = () => store.set('settings', S.settings);
const saveAiLife = () => store.set('ailife', S.aiLife);
const aiReady = () => !!(S.aiInfo && S.aiInfo.ok && (S.aiInfo.hasKey || S.aiKey));

// ——— Başlangıç ———
async function boot() {
  const res = await fetch('library.json');
  if (!res.ok) throw new Error(await res.text());
  LIB = await res.json();
  ITEMS = LIB.items;
  N = ITEMS.length;
  CATS = LIB.cats;
  SOLVER = new Solver(N, LIB.recipes);
  S.lifeDisc = new Set(S.life.disc);

  // Yapay zeka dünyası: adı külliyatta geçen öğeler külliyatın ikonunu giyer, diğerleri emoji.
  const corpus = new Map(LIB.items.map(it => [normName(it.n), it]));
  const decorate = (it) => {
    const c = corpus.get(normName(it.n));
    if (c) Object.assign(it, { g: c.g, b: c.b, v: c.v, c: c.c });
    return it;
  };
  AIW = new AIWorld(LIB.base.map(id => LIB.items[id]), decorate);
  // Dünyadan ayıklanmış (ör. adı bozuk) öğeler keşif geçmişinden de düşer
  S.aiLife.disc = S.aiLife.disc.filter(n => AIW.byName.has(normName(n)));
  S.aiDisc = new Set(S.aiLife.disc);
  GOALS = LIB.items.filter(it => it.s >= AI_GOAL_MIN && it.n.length <= 24 && !it.n.includes('('));
  AIE = new AIEngine(AIW, {
    ctx: aiCtx,
    key: () => S.aiKey,
    onResult: aiResult,
    onStatus: aiStatus,
    onError: (err) => note(`Yapay zeka yanıt vermedi: ${err.message}`, 'err'),
  });
  S.aiInfo = await AIEngine.info();
  // İlk yapay zeka turu da seçilmiş bir hedefle başlasın (en çok birkaç saniye beklenir)
  if (S.settings.ai && aiReady() && !S.aiNext) await Promise.race([prepareNextGoal(), sleep(5000)]);
  unlockAudio();

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

  ws = new Workspace({
    board: $('#board'),
    world: $('#world'),
    links: $('#links'),
    render: (id) => `${iconHTML(ITEMS[id])}<div class="lbl">${esc(ITEMS[id].n)}</div>`,
    judge,
    onCombine: (d, t) => combine(d, t, false),
    onView: (z) => { $('#zoomLabel').textContent = Math.round(z * 100) + '%'; },
  });

  wireUI();
  newRound();
  if (new URLSearchParams(location.search).has('debug')) {
    window.__game = { S, ws, SOLVER, get ITEMS() { return ITEMS; }, LIB, AIW, AIE, combine, newRound, doHint, playSolution };
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

// Yapay zeka modu hedefi: külliyatta derin öğelerden rastgele 10 aday çekilir, model bunlardan
// dört elementten ulaşması en çok uğraştıracak olanı seçer. Seçim bir önceki tur başlarken
// arka planda yapılır. Külliyat yalnızca ad ve ikon için kullanılır; birleşimleri yapay zeka üretir.
function goalPool(exclude = '') {
  const recent = new Set(S.aiLife.recent);
  const pool = GOALS.filter(it => !recent.has(it.n) && it.n !== exclude);
  return pool.length ? pool : GOALS;
}

let goalReq = null;
function prepareNextGoal() {
  if (goalReq) return goalReq;
  const pool = goalPool(S.R && S.R.goal ? S.R.goal.n : '');
  const cands = [];
  while (cands.length < Math.min(10, pool.length)) {
    const it = pool[Math.floor(Math.random() * pool.length)];
    if (!cands.includes(it)) cands.push(it);
  }
  goalReq = AIE.chooseGoal(cands.map(it => it.n))
    .then((i) => { S.aiNext = cands[i >= 0 ? i : 0].n; store.set('ainext', { n: S.aiNext }); })
    .catch(() => {})
    .finally(() => { goalReq = null; });
  return goalReq;
}

function pickAIGoal() {
  const pool = goalPool();
  let goal = S.aiNext && pool.find(it => it.n === S.aiNext);
  if (!goal) goal = pool[Math.floor(Math.random() * pool.length)];
  S.aiNext = '';
  store.set('ainext', { n: '' });
  return goal;
}

function setMode(ai) {
  ITEMS = ai ? AIW.items : LIB.items;
  N = ITEMS.length;
  CATS = ai ? AI_CATS : LIB.cats;
  document.body.classList.toggle('ai', ai);
  $('#brandSub').textContent = ai ? 'yapay zeka modu' : 'simya külliyatı';
  $('#questLabel').textContent = ai ? 'GÖREV · YAPAY ZEKA' : 'GÖREV';
  $('#stScoreLbl').textContent = ai ? 'Dünya' : 'Olası puan';
  $('#btnGiveUp').innerHTML = `${uiIcon('flag')}<span>Pes Et</span>`;
  if (ai) AIE.start(); else AIE.stop();
}

function newRound() {
  hideModal();
  hideTree($('#treeView'));
  S.busy = false;
  ws.locked = false;
  $('#skipAnim').classList.add('hidden');
  ws.clear();
  const ai = !!S.settings.ai && aiReady();
  if (S.settings.ai && !ai) setTimeout(() => note('Yapay zeka modu için anahtar gerekli; menüden ekleyebilirsin. Şimdilik külliyatla oynuyorsun.', 'err'), 600);
  setMode(ai);
  const base = ai ? AIW.base : LIB.base;
  const round = { found: [...base], foundSet: new Set(base), tried: new Set(), attempts: 0, hints: 0, over: false, won: false };
  if (ai) {
    // Hedef dünyada henüz olmayabilir; bulunduğu an adından tanınır
    const goal = pickAIGoal();
    S.R = { ...round, ai: true, target: -1, goal, goalKey: normName(goal.n), opt: 0, counted: false };
    S.aiLife.recent.push(goal.n);
    if (S.aiLife.recent.length > 60) S.aiLife.recent.splice(0, S.aiLife.recent.length - 60);
    saveAiLife();
    prepareNextGoal();
  } else {
    const target = pickTarget();
    S.R = { ...round, ai: false, target, opt: ITEMS[target].s, counted: false };
    S.life.recent.push(ITEMS[target].n);
    if (S.life.recent.length > 60) S.life.recent.splice(0, S.life.recent.length - 60);
    saveLife();
  }
  $('#search').value = '';
  $('#quest').classList.remove('won');
  renderQuest();
  renderInventory();
  updateStats();
  ws.resetView(false);
  const offs = [-165, -55, 55, 165];
  base.forEach((id, i) => setTimeout(() => ws.spawn(id, offs[i] || i * 110, 0, { pop: true }), 80 + i * 70));
  if (ai) AIE.poke();
}

function renderQuest() {
  const R = S.R;
  if (R.ai) {
    $('#questIcon').innerHTML = iconHTML(R.goal);
    $('#questName').textContent = R.goal.n;
    renderAIMeta();
    return;
  }
  const t = ITEMS[R.target];
  $('#questIcon').innerHTML = iconHTML(t);
  $('#questName').textContent = t.n;
  const d = DIFFS[S.settings.diff] || DIFFS.orta;
  $('#questMeta').textContent = `${CATS[t.k]} · en kısa yol ≈ ${R.opt} birleştirme · ${d.name}`;
}

// Yapay zeka durumu: dünyadaki öğe sayısı ve arka planda hazır bekleyen birleşimler
let aiSt = { ready: 0, busy: false }, metaQueued = false;
function renderAIMeta() {
  if (!S.R || !S.R.ai) return;
  $('#questMeta').innerHTML = `yol bilinmiyor · dünyada ${fmt(AIW.items.length)} öğe · <span class="ai-st${aiSt.busy ? ' busy' : ''}"><i></i>${aiSt.ready} birleşim hazır</span>`;
}
function scheduleMeta() {
  if (metaQueued) return;
  metaQueued = true;
  requestAnimationFrame(() => { metaQueued = false; renderAIMeta(); if (S.R && S.R.ai) updateStats(); });
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
  if (R.ai) {
    $('#stScore').textContent = fmt(AIW.items.length);
    $('#discCount').textContent = fmt(R.found.length);
    return;
  }
  $('#stScore').textContent = R.over && !R.won ? '0' : fmt(scoreNow().total);
  $('#discCount').textContent = `${R.found.length} / ${fmt(N)}`;
}

function bump(id) {
  const el = $('#' + id).parentElement;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ——— Birleştirme ———
// Üstüne getirince çerçeve: 'new' bu turda yeni bir şey çıkar (yeşil), 'old' zaten bulunmuş
// bir şey çıkar (mavi), 'no' birleşmez (kırmızı). Yapay zeka modunda sonuçlar önceden
// hazırlanır; nadiren hazır değilse 'wait' (gri) gösterilir ve çift hemen sorulur.
function judge(a, b) {
  const R = S.R;
  if (a == null || b == null || !R) return 'new';
  let outs;
  if (!R.ai) outs = SOLVER.combine(a, b);
  else {
    const r = AIW.get(a, b);
    if (!r) { AIE.focus(a, b); return 'wait'; }
    outs = r.o >= 0 ? [r.o] : null;
  }
  if (!outs) return 'no';
  return outs.some(o => !R.foundSet.has(o)) ? 'new' : 'old';
}

function combine(d, t, fromHint) {
  const R = S.R;
  if (R.ai) return aiCombine(d, t, fromHint);
  const outs = SOLVER.combine(d.item, t.item);
  if (!outs) return null;              // birleşmiyor: bırakılan öğe olduğu yerde kalır
  countTry(SOLVER.key(d.item, t.item), fromHint);
  return merge(d, t, outs);
}

// Yalnızca birleşen, daha önce denenmemiş ikililer deneme sayılır.
function countTry(key, fromHint) {
  const R = S.R;
  if (R.over || R.tried.has(key)) return;
  R.tried.add(key);
  if (!fromHint) { R.attempts++; bump('stAttempts'); }
}

const isGoal = (o) => (S.R.ai ? normName(ITEMS[o].n) === S.R.goalKey : o === S.R.target);

function merge(d, t, outs, info) {
  const R = S.R;
  const x = t.x, y = t.y;
  ws.remove(d, 'merge');
  ws.remove(t, 'merge');
  ws.burst(x, y);
  const made = [];
  let fresh = false;
  outs.forEach((o, i) => {
    const isNew = !R.foundSet.has(o);
    const ox = x + (i - (outs.length - 1) / 2) * 100;
    if (isNew) ws.glow(ox, y);
    const inst = ws.spawn(o, ox, y, { pop: true, isNew });
    made.push(inst);
    if (isNew) { fresh = true; discover(o, d.item, t.item, info); }
    if (isGoal(o) && !R.over) { inst.el.classList.add('goal'); win(); }
  });
  if (fresh && S.settings.sound) chime();
  updateStats();
  if (R.ai) AIE.poke();
  return made;
}

function aiCombine(d, t, fromHint) {
  const rec = AIW.get(d.item, t.item);
  if (rec) return aiApply(d, t, rec, fromHint);
  // Sonuç henüz yok: öğeler üst üste bekler, yapay zekaya hemen sorulur
  const R = S.R;
  d.el.classList.add('thinking');
  t.el.classList.add('thinking');
  const settle = () => { d.el.classList.remove('thinking'); t.el.classList.remove('thinking'); };
  AIE.urgent(d.item, t.item).then((r) => {
    settle();
    if (S.R !== R || !ws.has(d) || !ws.has(t)) return;
    if (Math.hypot(d.x - t.x, d.y - t.y) > 60) return;    // bu arada ayrıldılar
    if (r.o < 0) ws.nope(t);
    aiApply(d, t, r, fromHint);
  }, settle);
  return null;
}

function aiApply(d, t, rec, fromHint) {
  if (rec.o < 0) return null;
  countTry(pairKey(d.item, t.item), fromHint);
  return merge(d, t, [rec.o], rec);
}

function discover(id, a, b, info) {
  const R = S.R;
  R.found.push(id);
  R.foundSet.add(id);
  const name = ITEMS[id].n;
  if (R.ai) {
    if (!S.aiDisc.has(name)) { S.aiDisc.add(name); S.aiLife.disc.push(name); saveAiLife(); }
  } else if (!S.lifeDisc.has(name)) { S.lifeDisc.add(name); S.life.disc.push(name); saveLife(); }
  renderInventory(id);
  toast(id, a, b, info);
}

function toast(id, a, b, info) {
  const box = $('#toasts');
  const el = document.createElement('div');
  const kind = info && KINDS[info.t] ? `<em class="kind k${info.t}">${KINDS[info.t]}</em>` : '';
  const why = info && info.r ? `<span class="why">${esc(info.r)}</span>` : '';
  el.className = 'toast' + (why ? ' long' : '');
  el.innerHTML = `${iconHTML(ITEMS[id])}<div><small>YENİ KEŞİF${kind}</small><b>${esc(ITEMS[id].n)}</b><span class="rc">${esc(ITEMS[a].n)} + ${esc(ITEMS[b].n)}</span>${why}</div>`;
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => el.remove(), why ? 3900 : 2700);
}

// Yalnızca metinden oluşan kısa bildirim
function note(text, cls = '') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast note long' + (cls ? ' ' + cls : '');
  el.textContent = text;
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => el.remove(), 3900);
}

// ——— Yapay zeka motoru bağlantıları ———
function aiCtx() {
  const R = S.R;
  if (!R || !R.ai) return null;
  const board = [];
  for (const i of ws.insts.values()) board.push(i.item);
  board.reverse();                     // en son konanlar önce
  return { found: R.found, board, tried: R.tried, target: R.goal.n };
}

function aiResult() {
  if (!S.R || !S.R.ai) return;
  ws.refreshHover();
  scheduleMeta();
}

function aiStatus(st) {
  if (st.ready === aiSt.ready && st.busy === aiSt.busy) return;
  aiSt = st;
  scheduleMeta();
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
      if (ITEMS[id].k !== last) { last = ITEMS[id].k; html += `<div class="inv-cat">${esc(CATS[last])}</div>`; }
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
    if (S.R.ai) AIE.prime(id, [...ws.insts.values()].map(i => i.item));
    const sx = e.clientX, sy = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) ghost = makeGhost(id);
      if (!ghost) return;
      moveGhost(ghost, ev.clientX, ev.clientY);
      if (ws.contains(ev.clientX, ev.clientY)) {
        const w = ws.toWorld(ev.clientX, ev.clientY);
        ws.setHover(ws.hitTest(w.x, w.y), id);
      } else ws.setHover(null);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!ghost) {
        const spot = ws.freeSpot();
        ws.spawn(id, spot.x, spot.y, { pop: true });
        if (S.R.ai) AIE.poke();
        return;
      }
      ghost.remove();
      const target = ws.hover;
      ws.setHover(null);
      if (!ws.contains(ev.clientX, ev.clientY)) return;
      const w = ws.toWorld(ev.clientX, ev.clientY);
      const inst = ws.spawn(id, w.x, w.y, { pop: !target });
      if (target) combine(inst, target, false);
      if (S.R.ai) AIE.poke();
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
    if (R.ai) {
      S.aiLife.rounds++; S.aiLife.wins++;
      saveAiLife();
    } else {
      S.life.rounds++; S.life.wins++; S.life.streak++;
      S.life.total += sc.total;
      S.life.best = Math.max(S.life.best, sc.total);
      saveLife();
    }
  }
  $('#quest').classList.add('won');
  $('#btnGiveUp').innerHTML = `${uiIcon('play')}<span>Sıradaki</span>`;
  setTimeout(() => showWin(sc), 950);
}

function showWin(sc) {
  const R = S.R;
  if (R.ai) {
    modal(`
      <div class="modal-hero">${iconHTML(R.goal)}<div><small class="win-title">GÖREV TAMAMLANDI</small><b>${esc(R.goal.n)}</b></div></div>
      <div class="score-rows">
        <div>Denediğin farklı birleşim <b>${R.attempts}</b></div>
        <div>Bu turdaki keşif <b>${R.found.length - AIW.base.length}</b></div>
        <div>Kullanılan ipucu <b>${R.hints}</b></div>
      </div>
      <p style="margin-top:12px">Yapay zeka modunda bulunan hedef: <b style="color:var(--text)">${S.aiLife.wins}</b> / ${S.aiLife.rounds} tur</p>
      <div class="modal-btns">
        <button class="btn ghost" data-act="close">Alanda kal</button>
        <button class="btn ok" data-act="next">Sıradaki hedef ${uiIcon('play')}</button>
      </div>`, { close: () => hideModal(), next: () => newRound() });
    return;
  }
  const t = ITEMS[R.target];
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
  if (R.ai) {
    modal(`
      <div class="modal-hero">${iconHTML(R.goal)}<div><small>HEDEF</small><b>${esc(R.goal.n)}</b></div></div>
      <h3>Pes mi ediyorsun?</h3>
      <p>Yapay zeka modunda hedefe giden yol önceden bilinmediği için çözüm gösterilemez. Yeni bir hedefle yeni tura geçersin; yapay zekanın kurduğu dünya korunur, aynı birleşimler yine aynı sonucu verir.</p>
      <div class="modal-btns">
        <button class="btn ghost" data-act="close">Vazgeç, devam et</button>
        <button class="btn primary" data-act="new">${uiIcon('refresh')}Yeni hedef</button>
      </div>`, { new: () => { countLoss(); newRound(); }, close: () => hideModal() });
    return;
  }
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
  if (R.ai) {
    S.aiLife.rounds++;
    saveAiLife();
  } else {
    S.life.rounds++; S.life.streak = 0;
    saveLife();
  }
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
// Yapay zeka modunda ipucu: hedef dünyada zaten ortaya çıkmışsa ve bilinen birleşimlerle
// ulaşılabiliyorsa ona doğru bir adım; değilse hazırda bekleyen, denenmemiş ve yeni bir öğe
// veren herhangi bir birleşim.
function aiHintStep() {
  const R = S.R, f = R.found;
  const g = AIW.byName.get(R.goalKey);
  if (g !== undefined) {
    const flat = [];
    for (const r of AIW.rec.values()) if (r.o >= 0) flat.push(r.a, r.b, r.o);
    const steps = new Solver(AIW.items.length, flat).plan(g, f);
    if (steps && steps.length) return steps[0];
  }
  for (let i = f.length - 1; i >= 0; i--) {
    for (let j = i; j >= 0; j--) {
      const k = pairKey(f[i], f[j]);
      if (R.tried.has(k)) continue;
      const r = AIW.rec.get(k);
      if (r && r.o >= 0 && !R.foundSet.has(r.o)) return { a: f[i], b: f[j] };
    }
  }
  return null;
}

async function doHint() {
  const R = S.R;
  if (S.busy || R.over) return;
  let s;
  if (R.ai) {
    s = aiHintStep();
    if (!s) { note('İpucu için birleşimler hazırlanıyor, birazdan tekrar dene.'); AIE.poke(); return; }
  } else {
    const steps = SOLVER.plan(R.target, R.found);
    if (!steps || !steps.length) return;
    s = steps[0];
  }
  R.hints++;
  bump('stHints');
  updateStats();
  // İki öğe görünen alanın ortasında belirir, hızla birbirine girip sonucu oluşturur
  S.busy = true;
  ws.locked = true;
  try {
    const at = ws.freeSpot();
    const A = ws.spawn(s.a, at.x - 62, at.y, { pop: true });
    const B = ws.spawn(s.b, at.x + 62, at.y, { pop: true });
    await sleep(220);
    await Promise.all([ws.tween(A, at, 190), ws.tween(B, at, 190)]);
    combine(B, A, true);
  } finally {
    ws.locked = false;
    S.busy = false;
  }
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

function aiConfigHTML() {
  const inf = S.aiInfo || {};
  if (!inf.ok) {
    return `<p class="ai-cfg-msg err">Yapay zeka sunucusuna ulaşılamadı. Oyunu <code>npm start</code> ile çalıştırman (Netlify'da ise <code>DEEPSEEK_API_KEY</code> ortam değişkenini tanımlaman) gerekiyor.</p>`;
  }
  if (inf.hasKey) {
    return `<p class="ai-cfg-msg ok">Sunucuda DeepSeek anahtarı tanımlı · model: <b>${esc(inf.model)}</b></p>`;
  }
  return `
    <p class="ai-cfg-msg">Sunucuda anahtar yok. DeepSeek API anahtarını buraya girebilirsin; yalnızca bu tarayıcıda saklanır ve yerel sunucu üzerinden DeepSeek'e iletilir. Kalıcı yol: proje kökündeki <code>.env</code> dosyasına <code>DEEPSEEK_API_KEY=…</code> yazmak.</p>
    <div class="key-row">
      <input id="aiKey" type="password" placeholder="sk-…" autocomplete="off" spellcheck="false" value="${esc(S.aiKey)}">
      <button class="btn" data-act="saveKey">Kaydet</button>
    </div>
    <p class="ai-cfg-msg ${S.aiKey ? 'ok' : ''}" id="aiKeyState">${S.aiKey ? 'Bu tarayıcıda kayıtlı anahtar kullanılacak.' : 'Anahtar girilmedi.'}</p>`;
}

function openMenu(tab = 'game') {
  const L = S.life;
  const diffBtns = Object.entries(DIFFS).map(([k, d]) =>
    `<button data-diff="${k}" class="${S.settings.diff === k ? 'on' : ''}"><b>${d.name}</b><small>${d.desc}</small></button>`).join('');
  let body = '';
  if (tab === 'game') {
    body = `
      <div class="menu-section"><h4>Oyun modu</h4>
        <button class="toggle-row ai-toggle ${S.settings.ai ? 'on' : ''}" data-act="toggleAI">
          <span class="tr-ico">${uiIcon('wand')}</span>
          <span class="tr-txt"><b>Yapay zeka modu</b><small>Hazır külliyat yerine her birleşimi yapay zeka (DeepSeek) üretir. Hedef zorlu ve rastgeledir; yolu kimse önceden bilmez.</small></span>
          <span class="switch"></span>
        </button>
        <div class="ai-cfg only-ai" id="aiCfg">${aiConfigHTML()}</div>
        <button class="toggle-row snd-toggle ${S.settings.sound ? 'on' : ''}" data-act="toggleSound">
          <span class="tr-ico">${uiIcon('bell')}</span>
          <span class="tr-txt"><b>Keşif sesi</b><small>Yeni bir şey bulduğunda kısa bir “trink”.</small></span>
          <span class="switch"></span>
        </button>
      </div>
      <div class="menu-section only-classic"><h4>Zorluk</h4><div class="seg" id="diffSeg">${diffBtns}</div></div>
      <div class="menu-section"><h4>İstatistik</h4>
        <div class="life-grid only-classic">
          <div><b>${fmt(L.total)}</b><span>toplam puan</span></div>
          <div><b>${L.wins}/${L.rounds}</b><span>kazanılan tur</span></div>
          <div><b>${fmt(L.best)}</b><span>en iyi tur</span></div>
          <div><b>${L.streak}</b><span>seri</span></div>
        </div>
        <div class="life-grid only-ai">
          <div><b>${fmt(S.aiLife.disc.length)}</b><span>keşfettiğin</span></div>
          <div><b>${fmt(AIW.items.length)}</b><span>dünyadaki öğe</span></div>
          <div><b>${fmt(AIW.rec.size)}</b><span>üretilen birleşim</span></div>
          <div><b>${S.aiLife.wins}/${S.aiLife.rounds}</b><span>bulunan hedef</span></div>
        </div>
      </div>
      <div class="menu-section"><h4>Nasıl oynanır?</h4>
        <ul class="help-list">
          <li class="only-classic">Her turda külliyattan rastgele bir <b>hedef</b> seçilir. Ateş, Su, Toprak ve Hava ile başlarsın.</li>
          <li class="only-ai">Ateş, Su, Toprak ve Hava ile başlarsın. Hazır külliyat yok: her birleşimi yapay zeka üretir.</li>
          <li class="only-ai">Her turda rastgele ve zorlu bir <b>hedef</b> seçilir. Yapay zeka hedefi bilir ama sana asla yardım etmez; hedef ancak bir birleşimin doğal sonucu olduğunda ortaya çıkar. Yol önceden bilinmez, genelde onlarca birleşim gerekir.</li>
          <li class="only-ai">Sonuç bariz bir birleşimse odur; değilse ikisinin ortak noktası, çağrıştırdığı şey ya da bir kelime oyunu aranır. Hiçbiri makul değilse birleşmezler. Sonuç bir nesne olduğu kadar bir kişi, yer, kavram ya da eylem de olabilir.</li>
          <li class="only-ai">Üretilen dünya kalıcıdır: aynı ikili hep aynı sonucu verir. Yapay zeka sıradaki olası birleşimleri arka planda önceden hazırlar.</li>
          <li>Sağdaki keşiflerden öğeleri ortadaki alana sürükle; bir öğeyi diğerinin üstüne bırakınca birleşirler.</li>
          <li>Bir öğeyi diğerinin üstüne getirdiğinde çerçeve rengi sonucu hemen söyler: <b class="c-ok">yeşil</b> bu turda yeni bir şey çıkar, <b class="c-old">mavi</b> zaten bulduğun bir şey çıkar, <b class="c-no">kırmızı</b> birleşmezler<span class="only-ai">; <b class="c-wait">gri</b> ise sonuç henüz hazırlanıyor demektir</span>. Birleşmeyen öğe bıraktığın yerde kalır ve deneme sayılmaz.</li>
          <li><kbd>Orta tuş</kbd> veya boş alanda sol tuşla kaydır, <kbd>tekerlek</kbd> ile yakınlaş.</li>
          <li><kbd>Sağ tık</kbd> öğeyi siler, <kbd>çift tık</kbd> kopyalar. Keşiflerdeki bir öğeye tıklamak onu alana koyar.</li>
          <li class="only-classic">Puan: hedefin derinliği × verimlilik (en kısa yol ÷ yaptığın farklı birleşim) × ipucu cezası (her ipucu puanı %20 azaltır).</li>
          <li class="only-classic"><b>İpucu</b> (<kbd>H</kbd>), elindekilerle hedefe bir adım yaklaştıran birleştirmeyi senin yerine yapar.</li>
          <li class="only-ai"><b>İpucu</b> (<kbd>H</kbd>), sana yeni bir şey kazandıracak, henüz denemediğin bir birleşimi senin yerine yapar. Hedef dünyada bir kez ortaya çıkmışsa ipucu ona doğru ilerler.</li>
        </ul>
      </div>
      <div class="modal-btns">
        <button class="btn ghost" data-act="close">Kapat</button>
        <button class="btn primary" data-act="restart">${uiIcon('refresh')}<span class="only-classic">Bu zorlukta yeni görev</span><span class="only-ai">Yapay zeka modunda yeni tur</span></button>
      </div>`;
  } else if (S.R.ai) {
    const ids = S.aiLife.disc.map(n => AIW.byName.get(normName(n))).filter(id => id !== undefined);
    const cells = ids.sort((a, b) => AIW.items[a].n.localeCompare(AIW.items[b].n, 'tr'))
      .map(id => `<div>${iconHTML(AIW.items[id])}<span>${esc(AIW.items[id].n)}</span></div>`).join('');
    body = `
      <p>Yapay zeka dünyasında keşfettiğin öğeler: <b style="color:var(--text)">${fmt(ids.length)}</b>. Dünyada şimdiye dek ${fmt(AIW.items.length)} öğe ve ${fmt(AIW.rec.size)} birleşim üretildi.</p>
      <div class="encyclo">${cells || '<div style="grid-column:1/-1">Henüz keşif yok.</div>'}</div>
      <div class="modal-btns"><button class="btn ghost" data-act="close">Kapat</button><button class="btn danger" data-act="wipe">Dünyayı sıfırla</button></div>`;
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
    restart: () => {
      if (S.settings.ai && !aiReady()) {
        const cfg = $('#aiCfg');
        cfg.classList.remove('attn'); void cfg.offsetWidth; cfg.classList.add('attn');
        const inp = $('#aiKey');
        if (inp) inp.focus();
        return;
      }
      if (!S.R.won && (S.R.attempts || S.R.hints)) countLoss();
      newRound();
    },
    toggleAI: () => {
      S.settings.ai = !S.settings.ai;
      saveSettings();
      if (S.settings.ai && aiReady() && !S.aiNext) prepareNextGoal();
      $('.ai-toggle').classList.toggle('on', S.settings.ai);
      $('#modalCard').classList.toggle('ai-on', S.settings.ai);
    },
    toggleSound: () => {
      S.settings.sound = !S.settings.sound;
      saveSettings();
      $('.snd-toggle').classList.toggle('on', S.settings.sound);
      if (S.settings.sound) chime();
    },
    saveKey: () => {
      S.aiKey = $('#aiKey').value.trim();
      store.set('aikey', { k: S.aiKey });
      const st = $('#aiKeyState');
      st.textContent = S.aiKey ? 'Kaydedildi; bu tarayıcıda kayıtlı anahtar kullanılacak.' : 'Anahtar silindi.';
      st.classList.toggle('ok', !!S.aiKey);
    },
    reset: () => {
      S.life = { rounds: 0, wins: 0, total: 0, best: 0, streak: 0, disc: [], recent: [] };
      S.lifeDisc = new Set();
      saveLife();
      openMenu('enc');
    },
    wipe: () => modal(`
      <h3>Yapay zeka dünyası silinsin mi?</h3>
      <p>Şimdiye dek üretilen ${fmt(AIW.items.length - AIW.base.length)} öğe ve ${fmt(AIW.rec.size)} birleşim silinir; birleşimler baştan, yeniden üretilir. Bu geri alınamaz.</p>
      <div class="modal-btns">
        <button class="btn ghost" data-act="back">Vazgeç</button>
        <button class="btn danger" data-act="yes">Dünyayı sil</button>
      </div>`, {
      back: () => openMenu('enc'),
      yes: () => {
        AIE.reset();
        AIW.reset();
        S.aiLife.disc = [];
        S.aiDisc = new Set();
        saveAiLife();
        newRound();
      },
    }),
  }, true);
  $('#modalCard').classList.toggle('ai-on', tab === 'game' ? !!S.settings.ai : !!S.R.ai);
  // Sunucu durumu değişmiş olabilir (ör. .env sonradan eklendi)
  if (tab === 'game') {
    AIEngine.info().then((inf) => {
      if (JSON.stringify(inf) === JSON.stringify(S.aiInfo)) return;
      S.aiInfo = inf;
      const cfg = $('#aiCfg');
      if (cfg) cfg.innerHTML = aiConfigHTML();
    });
  }
}

function wireUI() {
  $('#btnHint').onclick = doHint;
  $('#btnGiveUp').onclick = giveUp;
  $('#btnMenu').onclick = () => { if (!S.busy) openMenu('game'); };
  $('#brand').onclick = () => { if (!S.busy) openMenu('game'); };
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
  $('#modal').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'aiKey' && modalActions && modalActions.saveKey) modalActions.saveKey();
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
