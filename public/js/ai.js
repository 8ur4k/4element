// Yapay zeka modu: dünya (öğeler + tarifler), kalıcı kayıt ve arka planda ön-üretim.
//
// Dünya turlar boyunca korunur: bir kez üretilen birleşim hep aynı sonucu verir ve
// sonraki üretimlere "kanon" olarak gönderilir.
//
// Ön-üretim, oyuncunun elindeki "sıcak" öğelerin (alandakiler, son keşifler, 4 element)
// birbirleriyle bütün birleşimlerini ve bu birleşimlerden çıkacak öğelerin birkaç adım
// sonrasını önceden hazırlar; böylece bir öğe diğerinin üstüne getirildiğinde sonuç
// çoğu zaman zaten bilinir. Bu pencerede hazır bekleyen (denenmemiş) birleşim sayısı ALT sınırın altına
// düşünce ÜST sınıra kadar yeniden doldurulur; oyuncu çoğu zaman hiç beklemez.

export const AI_CATS = ['Doğa', 'Gök', 'Madde', 'Bitki', 'Hayvan', 'İnsan', 'Toplum', 'Yapı', 'Araç', 'Teknoloji', 'Yemek', 'Sanat', 'Spor', 'Kavram', 'Eylem', 'Kişi', 'Yer', 'Mitoloji'];
export const KINDS = { 1: 'Birleşim', 2: 'Ortak nokta', 3: 'Kelime oyunu' };

const LOW = 50, HIGH = 100;      // hazır birleşim: ALT'ın altına düşünce ÜST'e kadar doldur
const BOARD = 40, RECENT = 12;    // sıcak öğe: alandakiler (en çok) + son keşifler
const HOT = 24, AHEAD = 16;      // sıcak öğe alt sınırı (oyun başında bütün keşifler) / ileride bulunacak öğe sayısı
const BATCH = 8, CONC = 4, URGENT_CONC = 4;
const MISS_LIMIT = 3;            // model bir çifti bu kadar kez atlarsa "birleşmez" say
const CANON_HEAD = 600, CANON_MAX = 1800, CANON_STEP = 300;
const STORE = '4e:aiworld';

export const pairKey = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);

export const normName = (s) => String(s).toLocaleLowerCase('tr-TR')
  .replace(/[â]/g, 'a').replace(/[î]/g, 'i').replace(/[û]/g, 'u')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function cleanName(s) {
  s = String(s || '').replace(/[“”"'`*_]/g, '').replace(/\s+/g, ' ').trim().replace(/[.,;:!?]+$/, '');
  if (!s || s.length > 32 || !/\p{L}/u.test(s)) return null;
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}

function pickEmoji(s) {
  s = String(s || '').trim();
  const first = typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter().segment(s)[Symbol.iterator]().next().value?.segment
    : [...s][0];
  return first && /\p{Extended_Pictographic}/u.test(first) ? first : '✨';
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function hsl2hex(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

// Modelin verdiği rengi karolara uygun bir aralığa çeker (çok soluk/koyu olmasın).
function tidyColor(hex, name) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return hsl2hex(hashStr(name) % 360, 0.55, 0.5);
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return hsl2hex(h, Math.min(0.8, s < 0.12 ? s : Math.max(0.3, s)), Math.min(0.62, Math.max(0.36, l)));
}

// ——— Dünya ———
export class AIWorld {
  // base: 4 elementin öğe nesneleri; decorate: öğeye (varsa) külliyat ikonunu giydirir
  constructor(base, decorate) {
    this.baseDefs = base;
    this.decorate = decorate;
    this.reset(false);
    this.load();
  }

  reset(save = true) {
    this.items = [];
    this.byName = new Map();
    this.rec = new Map();
    this.log = [];
    for (const b of this.baseDefs) this.addItem({ n: b.n, e: '', c: b.c, k: 0 });
    this.base = this.baseDefs.map((_, i) => i);
    if (save) this.save(true);
  }

  addItem({ n, e, c, k }) {
    const id = this.items.length;
    this.items.push(this.decorate({ n, e: e || '✨', c, k: k >= 0 ? k : AI_CATS.indexOf('Kavram') }));
    if (!this.byName.has(normName(n))) this.byName.set(normName(n), id);
    return id;
  }

  get(a, b) { return this.rec.get(pairKey(a, b)); }

  // Modelin ham yanıtını dünyaya işler. İlk gelen yanıt kazanır.
  set(a, b, raw) {
    const key = pairKey(a, b);
    const old = this.rec.get(key);
    if (old) return old;
    let o = -1, t = 0;
    const name = raw.o && cleanName(raw.o);
    if (name) {
      const nk = normName(name);
      if (nk && nk !== normName(this.items[a].n) && nk !== normName(this.items[b].n)) {
        o = this.byName.get(nk);
        if (o === undefined) {
          o = this.addItem({ n: name, e: pickEmoji(raw.e), c: tidyColor(raw.c, name), k: AI_CATS.indexOf(String(raw.k || '').trim()) });
        }
        t = [1, 2, 3].includes(raw.t) ? raw.t : 1;
      }
    }
    const rec = { a, b, o, t, r: o >= 0 ? String(raw.r || '').slice(0, 100) : '' };
    this.rec.set(key, rec);
    this.log.push(key);
    this.save();
    return rec;
  }

  // İsteme giden kanon: başarılı birleşimler, eskiden yeniye. Çok büyürse baştaki temel
  // kısım ve sondaki güncel kısım tutulur; kesim noktası adım adım kaydığından istemin
  // başı çoğu istekte aynı kalır.
  canon() {
    const all = [];
    for (const key of this.log) {
      const r = this.rec.get(key);
      if (r.o >= 0) all.push([r.a, r.b, r.o]);
    }
    if (all.length <= CANON_MAX) return all;
    const tail = all.length - CANON_HEAD;
    const cut = CANON_HEAD + Math.ceil((tail - (CANON_MAX - CANON_HEAD)) / CANON_STEP) * CANON_STEP;
    return all.slice(0, CANON_HEAD).concat(all.slice(cut));
  }

  save(now = false) {
    clearTimeout(this.saveTimer);
    const write = () => {
      const data = {
        v: 1,
        items: this.items.slice(this.base.length).map(i => [i.n, i.e, i.c, i.k]),
        rec: this.log.map(k => { const r = this.rec.get(k); return [r.a, r.b, r.o, r.t, r.r]; }),
      };
      try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* depolama dolu ya da kapalı */ }
    };
    if (now) write(); else this.saveTimer = setTimeout(write, 700);
  }

  load() {
    let d;
    try { d = JSON.parse(localStorage.getItem(STORE)); } catch { return; }
    if (!d || d.v !== 1) return;
    for (const [n, e, c, k] of d.items || []) this.addItem({ n, e, c, k });
    const n = this.items.length;
    for (const [a, b, o, t, r] of d.rec || []) {
      if (!(a < n && b < n && o < n)) continue;
      const key = pairKey(a, b);
      if (this.rec.has(key)) continue;
      this.rec.set(key, { a, b, o, t, r: r || '' });
      this.log.push(key);
    }
  }
}

// ——— Üretim motoru ———
export class AIEngine {
  // ctx(): { found, board, tried } ya da null · key(): tarayıcıda kayıtlı anahtar
  constructor(world, { ctx, key, onResult, onStatus, onError }) {
    this.w = world;
    this.ctx = ctx;
    this.key = key;
    this.onResult = onResult;
    this.onStatus = onStatus;
    this.onError = onError;
    this.gen = 0;
    this.on = false;
    this.inflight = new Map();   // çift → uçuştaki istek sayısı
    this.uk = new Set();         // acil istekte olan çiftler
    this.uq = [];                // acil sıra (eşzamanlılık doluysa)
    this.waiters = new Map();    // çift → { p, res, rej }
    this.miss = new Map();
    this.bg = 0;
    this.urg = 0;
    this.refill = true;
    this.ready = 0;
    this.fails = 0;
    this.backoff = 0;
    this.lastErr = 0;
  }

  static async info() {
    try {
      const r = await fetch('api/ai', { cache: 'no-store' });
      if (!r.ok) return { ok: false };
      return await r.json();
    } catch { return { ok: false }; }
  }

  start() {
    this.on = true;
    if (!this.timer) this.timer = setInterval(() => this.pump(), 1200);
    this.poke();
  }

  stop() {
    this.on = false;
    clearInterval(this.timer);
    this.timer = null;
  }

  reset() {
    this.gen++;
    for (const wt of this.waiters.values()) wt.rej(new Error('Dünya sıfırlandı'));
    this.waiters.clear();
    this.inflight.clear();
    this.uk.clear();
    this.uq = [];
    this.miss.clear();
    this.bg = this.urg = 0;
    this.refill = true;
    this.ready = 0;
  }

  poke() {
    if (this.pk) return;
    this.pk = setTimeout(() => { this.pk = null; this.pump(); }, 30);
  }

  // Oyuncu bir öğeyi sürüklerken bilinmeyen bir çiftin üstünde bir an durursa hemen sor.
  focus(a, b) {
    const k = pairKey(a, b);
    if (this.w.rec.has(k) || this.fk === k) return;
    this.fk = k;
    clearTimeout(this.ft);
    this.ft = setTimeout(() => {
      if (this.fk === k && !this.w.rec.has(k)) this.urgent(a, b).catch(() => {});
      this.fk = null;
    }, 160);
  }

  // Keşiflerden sürüklenmeye başlanan öğenin alandaki her şeyle birleşimini hemen hazırla;
  // öğe hedefe varana kadar sonuçlar çoğunlukla gelmiş olur.
  prime(a, others) {
    const pairs = [];
    const seen = new Set();
    for (const b of others) {
      const k = pairKey(a, b);
      if (seen.has(k) || this.w.rec.has(k) || this.inflight.has(k)) continue;
      seen.add(k);
      pairs.push([a, b]);
    }
    // Küçük paketler paralel gider: ilk sonuçlar daha çabuk gelir
    for (let i = 0; i < pairs.length; i += 3) this.send(pairs.slice(i, i + 3), true);
  }

  // Sonucu hemen gereken çift (bırakıldı ya da üstünde bekleniyor).
  urgent(a, b) {
    const k = pairKey(a, b);
    const r = this.w.rec.get(k);
    if (r) return Promise.resolve(r);
    let wt = this.waiters.get(k);
    if (!wt) {
      wt = {};
      wt.p = new Promise((res, rej) => { wt.res = res; wt.rej = rej; });
      this.waiters.set(k, wt);
    }
    if (!this.uk.has(k)) {
      if (this.urg < URGENT_CONC) this.send([[a, b]], true);
      else if (!this.uq.some(([x, y]) => pairKey(x, y) === k)) this.uq.push([a, b]);
    }
    return wt.p;
  }

  // Ön-üretim planı: hangi çiftler, hangi sırayla?
  plan() {
    const c = this.on && this.ctx();
    if (!c) return [];
    const { found, board, tried } = c;
    const w = this.w;
    const fs = new Set(found);

    // Sıcak öğeler: alandakilerin hepsi, son keşifler, 4 element. Bunların kendi
    // aralarındaki her birleşim hazır tutulur ki üstüne gelince sonuç hemen bilinsin.
    const H = [];
    const inH = new Set();
    const add = (x) => { if (fs.has(x) && !inH.has(x)) { inH.add(x); H.push(x); } };
    for (const x of board) { if (H.length >= BOARD) break; add(x); }
    for (let i = found.length - 1, n = 0; i >= 0 && n < RECENT; i--, n++) add(found[i]);
    for (const x of w.base) add(x);
    for (let i = found.length - 1; i >= 0 && H.length < HOT; i--) add(found[i]);
    const MAXW = H.length + AHEAD;

    // Pencere: sıcak öğeler + birleşimlerinden çıkacak, henüz bulunmamış öğeler.
    // Önbellekteki sonuçlar izlenerek dallar birkaç adım ileriye kadar genişletilir.
    const W = H.slice();
    const inW = new Set(W);
    for (let depth = 0; depth < 4 && W.length < MAXW; depth++) {
      const next = [];
      for (let i = 0; i < W.length; i++) {
        for (let j = i; j < W.length; j++) {
          const r = w.get(W[i], W[j]);
          if (r && r.o >= 0 && !fs.has(r.o) && !inW.has(r.o)) next.push([r.o, i + j]);
        }
      }
      if (!next.length) break;
      next.sort((x, y) => x[1] - y[1]);
      for (const [o] of next) {
        if (W.length >= MAXW) break;
        if (!inW.has(o)) { inW.add(o); W.push(o); }
      }
    }

    // Penceredeki hazır (denenmemiş) birleşimleri say, eksikleri sıcaklığa göre sırala.
    // Sıcak öğelerin kendi aralarındaki birleşimler her zaman üretilir; ötesi bütçeyle.
    let ready = 0;
    const cand = [];
    for (let i = 0; i < W.length; i++) {
      for (let j = i; j < W.length; j++) {
        const k = pairKey(W[i], W[j]);
        if (w.rec.has(k)) { if (!tried.has(k)) ready++; continue; }
        cand.push({ a: W[i], b: W[j], s: i + j, must: j < H.length || (i < 6 && j < H.length + 3) });
      }
    }
    this.ready = ready;

    let flying = 0;
    for (const n of this.inflight.values()) flying += n;
    if (ready < LOW) this.refill = true;
    else if (ready >= HIGH) this.refill = false;
    let budget = this.refill ? HIGH - ready - flying : 0;

    cand.sort((x, y) => x.s - y.s);
    const todo = [];
    for (const cd of cand) {
      const k = pairKey(cd.a, cd.b);
      if (this.inflight.has(k) || (this.miss.get(k) || 0) >= MISS_LIMIT) continue;
      if (!cd.must) { if (budget <= 0) continue; budget--; }
      todo.push(cd);
    }
    return todo;
  }

  pump() {
    if (!this.on || (typeof document !== 'undefined' && document.hidden) || Date.now() < this.backoff) {
      this.status();
      return;
    }
    const todo = this.plan();
    while (this.bg < CONC && todo.length) {
      this.send(todo.splice(0, BATCH).map(c => [c.a, c.b]), false);
    }
    this.status();
  }

  status() {
    if (this.onStatus) this.onStatus({ ready: this.ready, busy: this.bg + this.urg > 0 });
  }

  done(k, rec) {
    const wt = this.waiters.get(k);
    if (wt) { this.waiters.delete(k); wt.res(rec); }
    if (this.onResult) this.onResult(k, rec);
  }

  async send(pairs, urgent) {
    const gen = this.gen, w = this.w;
    const keys = pairs.map(([a, b]) => pairKey(a, b));
    for (const k of keys) {
      this.inflight.set(k, (this.inflight.get(k) || 0) + 1);
      if (urgent) this.uk.add(k);
    }
    if (urgent) this.urg++; else this.bg++;
    this.status();

    const got = new Set();
    let err = null;
    try {
      await this.request({ items: w.items.map(i => i.n), history: w.canon(), pairs }, (r) => {
        if (gen !== this.gen || !pairs[r.i]) return;
        const k = keys[r.i];
        if (got.has(k)) return;
        got.add(k);
        this.done(k, w.set(pairs[r.i][0], pairs[r.i][1], r));
      });
    } catch (e) { err = e; }
    if (gen !== this.gen) return;

    if (urgent) this.urg--; else this.bg--;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const n = this.inflight.get(k) - 1;
      if (n > 0) this.inflight.set(k, n); else this.inflight.delete(k);
      if (urgent) this.uk.delete(k);
      if (got.has(k) || w.rec.has(k)) continue;
      if (!err) {
        // Yanıt geldi ama bu çift atlanmış
        const m = (this.miss.get(k) || 0) + 1;
        this.miss.set(k, m);
        if (m >= MISS_LIMIT) { this.done(k, w.set(pairs[i][0], pairs[i][1], { o: null })); continue; }
      }
      const wt = this.waiters.get(k);
      if (wt && !this.inflight.has(k)) {
        if (err) { this.waiters.delete(k); wt.rej(err); } else this.urgent(pairs[i][0], pairs[i][1]);
      }
    }
    if (err) {
      this.fails++;
      this.backoff = Date.now() + Math.min(30000, 1000 * 2 ** this.fails);
      if (Date.now() - this.lastErr > 8000) { this.lastErr = Date.now(); if (this.onError) this.onError(err); }
    } else this.fails = 0;

    while (this.uq.length && this.urg < URGENT_CONC) {
      const [a, b] = this.uq.shift();
      if (!w.rec.has(pairKey(a, b))) this.urgent(a, b);
    }
    this.poke();
  }

  // Sunucuya sorar; sonuçlar geldikçe (akış) onItem ile tek tek iletilir.
  async request(payload, onItem) {
    const headers = { 'Content-Type': 'application/json' };
    const key = this.key && this.key();
    if (key) headers['X-DeepSeek-Key'] = key;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60000);
    try {
      const res = await fetch('api/ai', { method: 'POST', headers, body: JSON.stringify(payload), signal: ac.signal });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { msg = (await res.json()).error || msg; } catch { /* gövde yok */ }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const line = (s) => {
        s = s.trim();
        if (!s) return;
        const j = JSON.parse(s);
        if (j.error) throw new Error(j.error);
        onItem(j);
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) { line(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
      }
      line(buf);
    } catch (e) {
      throw e.name === 'AbortError' ? new Error('Yanıt zaman aşımına uğradı') : e;
    } finally {
      clearTimeout(timer);
    }
  }
}
