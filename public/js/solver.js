// Tarif çözücü — hem tarayıcıda hem Node'da (derleyici) kullanılır.
//
// Tarifler hiper-graf oluşturur: (a + b) → o. Bir hedefe giden en kısa yolu
// "kaç farklı yeni öğe keşfetmek gerekir" ölçüsüyle ararız. Bunun için Knuth'un
// Dijkstra genellemesini, her öğe için gereken öğe kümesini bit dizisi olarak
// taşıyan bir maliyetle kullanıyoruz: maliyet(o) = |küme(a) ∪ küme(b) ∪ {o}|.

function popcnt(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

class Heap {
  constructor() { this.p = []; this.v = []; }
  get size() { return this.p.length; }
  push(pri, val) {
    const p = this.p, v = this.v;
    let i = p.length;
    p.push(pri); v.push(val);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] <= pri) break;
      p[i] = p[j]; v[i] = v[j]; i = j;
    }
    p[i] = pri; v[i] = val;
  }
  pop() {
    const p = this.p, v = this.v;
    const top = v[0];
    const lp = p.pop(), lv = v.pop();
    const n = p.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && p[c + 1] < p[c]) c++;
        if (p[c] >= lp) break;
        p[i] = p[c]; v[i] = v[c]; i = c;
      }
      p[i] = lp; v[i] = lv;
    }
    return top;
  }
}

const INF = 0x3fffffff;

export class Solver {
  // n: öğe sayısı, recipes: düz dizi [a0, b0, o0, a1, b1, o1, ...]
  constructor(n, recipes) {
    this.N = n;
    this.rec = recipes;
    this.R = recipes.length / 3;
    this.W = (n + 31) >>> 5;
    const N = n, R = this.R, rec = recipes;

    const deg = new Int32Array(N + 1);
    for (let r = 0; r < R; r++) {
      const a = rec[3 * r], b = rec[3 * r + 1];
      deg[a]++; if (b !== a) deg[b]++;
    }
    const start = new Int32Array(N + 1);
    for (let i = 0; i < N; i++) start[i + 1] = start[i] + deg[i];
    const list = new Int32Array(start[N]);
    const fill = start.slice(0, N);
    for (let r = 0; r < R; r++) {
      const a = rec[3 * r], b = rec[3 * r + 1];
      list[fill[a]++] = r; if (b !== a) list[fill[b]++] = r;
    }
    this.start = start;
    this.list = list;

    this.pairs = new Map();
    this.uses = new Int32Array(N);      // öğenin girdi olduğu tarif sayısı
    this.makes = new Int32Array(N);     // öğeyi üreten tarif sayısı
    for (let r = 0; r < R; r++) {
      const a = rec[3 * r], b = rec[3 * r + 1], o = rec[3 * r + 2];
      const k = this.key(a, b);
      const arr = this.pairs.get(k);
      if (arr) { if (!arr.includes(o)) arr.push(o); } else this.pairs.set(k, [o]);
      this.makes[o]++;
    }
    for (let i = 0; i < N; i++) this.uses[i] = start[i + 1] - start[i];
  }

  key(a, b) { return a < b ? a * this.N + b : b * this.N + a; }

  combine(a, b) { return this.pairs.get(this.key(a, b)) || null; }

  // Sahip olunan öğelerden başlayarak herkese (veya hedefe) en ucuz yolları bulur.
  search(owned, target = -1) {
    const { N, R, W, rec, start, list } = this;
    const cost = new Int32Array(N).fill(INF);
    const via = new Int32Array(N).fill(-1);
    const sets = new Array(N);
    const done = new Uint8Array(N);
    const need = new Uint8Array(R);
    for (let r = 0; r < R; r++) need[r] = rec[3 * r] === rec[3 * r + 1] ? 1 : 2;
    const heap = new Heap();
    const empty = new Uint32Array(W);
    const scratch = new Uint32Array(W);
    for (const x of owned) {
      if (cost[x] !== 0) { cost[x] = 0; sets[x] = empty; heap.push(0, x); }
    }
    while (heap.size) {
      const x = heap.pop();
      if (done[x]) continue;
      done[x] = 1;
      if (x === target) break;
      for (let i = start[x], e = start[x + 1]; i < e; i++) {
        const r = list[i];
        if (--need[r] !== 0) continue;
        const o = rec[3 * r + 2];
        if (done[o]) continue;
        const A = sets[rec[3 * r]], B = sets[rec[3 * r + 1]];
        let c = 0;
        for (let w = 0; w < W; w++) { const v = A[w] | B[w]; scratch[w] = v; c += popcnt(v); }
        const ow = o >>> 5, ob = 1 << (o & 31);
        if (!(scratch[ow] & ob)) c++;
        if (c < cost[o]) {
          const S = scratch.slice();
          S[ow] |= ob;
          cost[o] = c; via[o] = r; sets[o] = S;
          heap.push(c, o);
        }
      }
    }
    return { cost, via };
  }

  // Sahip olunanlardan hedefe adım listesi (uygulanabilir sırayla). Zaten varsa [], yoksa null.
  plan(target, owned) {
    const { N, rec } = this;
    const own = new Uint8Array(N);
    for (const x of owned) own[x] = 1;
    if (own[target]) return [];
    const { via } = this.search(owned, target);
    if (via[target] < 0) return null;
    const steps = [];
    const seen = new Uint8Array(N);
    const visit = (x) => {
      if (own[x] || seen[x]) return;
      seen[x] = 1;
      const r = via[x];
      const a = rec[3 * r], b = rec[3 * r + 1];
      visit(a); visit(b);
      steps.push({ a, b, o: x });
    };
    visit(target);
    return steps;
  }
}

export const UNREACHABLE = INF;
