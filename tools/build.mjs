// Külliyat derleyicisi: data/*.txt → library (JSON) + doğrulama raporu.
//
// Satır biçimi:
//   == Kategori Adı #renk            → sonraki öğelerin kategorisi ve varsayılan rengi
//   Ad {glif+rozet #renk} [etiket1 etiket2] = A + B | C + D
//   // yorum
// Tarif girdisi "#etiket" olabilir: o etiketi taşıyan her öğe için tarif üretilir.
// Aynı ikili iki farklı sonuç verecekse ilk tanım kazanır; bilinçli çoklu sonuç için
// tarifin sonuna * konur (ör. "Su + Elektrik*").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Solver, UNREACHABLE } from '../public/js/solver.js';
import { GLYPHS } from '../public/js/glyphs.js';

const lower = s => s.toLocaleLowerCase('tr-TR');
const norm = s => lower(s.trim().replace(/\s+/g, ' ')).replace(/[âÂ]/g, 'a').replace(/[îÎ]/g, 'i').replace(/[ûÛ]/g, 'u');

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

function jitter(hex, seed) {
  const [h, s, l] = hexToHsl(hex);
  const dh = ((seed & 255) / 255 - 0.5) * 26;
  const dl = (((seed >>> 8) & 255) / 255 - 0.5) * 0.12;
  const ds = (((seed >>> 16) & 255) / 255 - 0.5) * 0.12;
  return hslToHex(h + dh, s + ds, l + dl);
}

export function buildLibrary(dataDir) {
  const errors = [];
  const warnings = [];
  const conflicts = [];
  const overridden = [];
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.txt')).sort();
  const items = new Map();
  const order = [];
  const cats = [];
  const catIdx = new Map();
  const raws = [];
  const lineRe = /^([^{[=]+?)\s*(\{[^}]*\})?\s*(\[[^\]]*\])?\s*(?:=\s*(.+))?$/;

  const useCat = (name) => {
    if (!catIdx.has(name)) { catIdx.set(name, cats.length); cats.push(name); }
    return catIdx.get(name);
  };

  for (const file of files) {
    const text = fs.readFileSync(path.join(dataDir, file), 'utf8');
    let cat = 'Genel';
    let color = '#8b93a7';
    text.split(/\r?\n/).forEach((rawLine, i) => {
      const where = `${file}:${i + 1}`;
      let line = rawLine.trim();
      if (!line || line.startsWith('//')) return;
      const ci = line.indexOf(' //');
      if (ci >= 0) line = line.slice(0, ci).trim();
      if (line.startsWith('==')) {
        const h = line.replace(/^=+/, '').trim();
        const cm = h.match(/#([0-9a-fA-F]{6})/);
        if (cm) color = '#' + cm[1].toLowerCase();
        cat = h.replace(/#[0-9a-fA-F]{6}/, '').trim() || cat;
        useCat(cat);
        return;
      }
      const m = line.match(lineRe);
      if (!m) { errors.push(`${where}: satır anlaşılamadı → ${line}`); return; }
      const name = m[1].trim();
      const key = norm(name);
      let it = items.get(key);
      if (!it) {
        it = { key, name, cat: useCat(cat), catColor: color, glyph: null, badge: null, color: null, tags: new Set(), where, iconWhere: null };
        items.set(key, it);
        order.push(it);
      }
      if (m[2]) {
        const spec = m[2].slice(1, -1).trim();
        if (it.iconWhere) {
          if (spec) warnings.push(`${where}: "${name}" için ikon zaten ${it.iconWhere} satırında tanımlı`);
        } else if (spec) {
          for (const tok of spec.split(/\s+/)) {
            if (!tok) continue;
            if (tok.startsWith('#')) it.color = tok.toLowerCase();
            else { const [g, b] = tok.split('+'); it.glyph = g; it.badge = b || null; }
          }
          it.cat = useCat(cat); it.catColor = color; it.iconWhere = where;
        }
      }
      if (m[3]) for (const t of m[3].slice(1, -1).split(/[\s,]+/)) if (t) it.tags.add(lower(t));
      if (m[4]) {
        for (const part of m[4].split('|')) {
          const p = part.trim();
          if (!p) continue;
          const share = p.endsWith('*');
          const ab = (share ? p.slice(0, -1) : p).split('+').map(s => s.trim());
          if (ab.length !== 2 || !ab[0] || !ab[1]) { errors.push(`${where}: tarif hatalı → ${p}`); continue; }
          raws.push({ out: key, a: ab[0], b: ab[1], share, where });
        }
      }
    });
  }

  // Etiket dizini
  const tagMap = new Map();
  for (const it of order) for (const t of it.tags) {
    if (!tagMap.has(t)) tagMap.set(t, []);
    tagMap.get(t).push(it.key);
  }

  const allKeys = [...items.keys()];
  const suggest = (k) => {
    let best = null, bd = 99;
    for (const c of allKeys) {
      if (Math.abs(c.length - k.length) > 3) continue;
      const d = levenshtein(k, c);
      if (d < bd) { bd = d; best = c; }
    }
    return best && bd <= Math.max(1, Math.floor(k.length / 3)) ? ` (bunu mu demek istediniz: "${items.get(best).name}"?)` : '';
  };

  const resolveSide = (s, where) => {
    if (s.startsWith('#')) {
      const l = tagMap.get(lower(s.slice(1)));
      if (!l) { errors.push(`${where}: etiket bulunamadı → ${s}`); return null; }
      return { tag: true, keys: l };
    }
    const k = norm(s);
    if (!items.has(k)) { errors.push(`${where}: tanımsız öğe → "${s}"${suggest(k)}`); return null; }
    return { tag: false, keys: [k] };
  };

  const pairs = new Map();
  const pk = (a, b) => (a < b ? a + '\u0001' + b : b + '\u0001' + a);
  const nm = k => items.get(k).name;
  let explicitCount = 0, tagCount = 0, tagSkipped = 0, multiCount = 0;
  const tagged = [];

  for (const r of raws) {
    const A = resolveSide(r.a, r.where);
    const B = resolveSide(r.b, r.where);
    if (!A || !B) continue;
    if (A.tag || B.tag) { tagged.push({ r, A, B }); continue; }
    const a = A.keys[0], b = B.keys[0];
    if (a === r.out || b === r.out) { warnings.push(`${r.where}: sonuç kendi girdisi → ${r.a} + ${r.b}`); continue; }
    // Yıldızsız (asıl) tarif her zaman yıldızlı (paylaşımlı) olana üstün gelir;
    // iki yıldızlı tarif aynı ikiliyi paylaşırsa ikisi birden çıkar.
    const k = pk(a, b);
    const e = pairs.get(k);
    if (!e) {
      pairs.set(k, { a, b, outs: [r.out], explicit: true, share: r.share, where: r.where });
    } else if (e.outs.includes(r.out)) {
      // aynı tarif iki kez yazılmış — sorun değil
    } else if (r.share && e.share) {
      e.outs.push(r.out); multiCount++;
    } else if (!r.share && e.share) {
      overridden.push(`${r.where}: "${nm(a)} + ${nm(b)}" → ${nm(r.out)} (yıldızlı ${e.outs.map(nm).join(', ')} düşürüldü)`);
      pairs.set(k, { a, b, outs: [r.out], explicit: true, share: false, where: r.where });
    } else if (r.share && !e.share) {
      overridden.push(`${r.where}: yıldızlı "${nm(a)} + ${nm(b)}" → ${nm(r.out)} atlandı (asıl: ${e.outs.map(nm).join(', ')})`);
    } else {
      conflicts.push(`${r.where}: "${nm(a)} + ${nm(b)}" zaten → ${e.outs.map(nm).join(', ')} (${e.where}); "${nm(r.out)}" atlandı`);
    }
  }
  for (const e of pairs.values()) if (e.explicit) explicitCount += e.outs.length;
  const multis = [...pairs.values()].filter(e => e.outs.length > 1).map(e => `${nm(e.a)} + ${nm(e.b)} → ${e.outs.map(nm).join(' & ')}`);
  for (const { r, A, B } of tagged) {
    for (const a of A.keys) for (const b of B.keys) {
      if (a === r.out || b === r.out) continue;
      const k = pk(a, b);
      const e = pairs.get(k);
      if (e) { if (!e.outs.includes(r.out)) tagSkipped++; continue; }
      pairs.set(k, { a, b, outs: [r.out], explicit: false, share: false, where: r.where });
      tagCount++;
    }
  }

  // Kimlikler: temel öğeler önce
  const base = order.filter(it => it.tags.has('temel'));
  const rest = order.filter(it => !it.tags.has('temel'));
  const list = [...base, ...rest];
  const id = new Map(list.map((it, i) => [it.key, i]));
  const N = list.length;

  const produced = new Uint8Array(N);
  const recipes = [];
  for (const e of pairs.values()) {
    for (const o of e.outs) {
      recipes.push(id.get(e.a), id.get(e.b), id.get(o));
      produced[id.get(o)] = 1;
    }
  }
  for (const it of rest) {
    if (!produced[id.get(it.key)]) errors.push(`${it.where}: "${it.name}" hiçbir tarifle elde edilemiyor`);
  }

  const solver = new Solver(N, recipes);
  const baseIds = base.map(it => id.get(it.key));
  const { cost, via } = solver.search(baseIds);
  const unreachable = [];
  for (let i = 0; i < N; i++) if (cost[i] === UNREACHABLE && produced[i]) unreachable.push(list[i]);
  for (const it of unreachable) errors.push(`${it.where}: "${it.name}" 4 elementten ulaşılamıyor (döngüsel/kopuk tarif)`);

  // İkonlar
  const glyphOk = g => g && Object.prototype.hasOwnProperty.call(GLYPHS, g);
  const autoIcon = [];
  const byCost = [...list.keys()].sort((x, y) => cost[x] - cost[y]);
  const G = new Array(N), Bd = new Array(N);
  for (const i of byCost) {
    const it = list[i];
    let g = it.glyph, b = it.badge;
    if (g && !glyphOk(g)) { warnings.push(`${it.iconWhere}: bilinmeyen glif "${g}" (${it.name})`); g = null; }
    if (b && !glyphOk(b)) { warnings.push(`${it.iconWhere}: bilinmeyen rozet glifi "${b}" (${it.name})`); b = null; }
    if (!g) {
      const r = via[i];
      if (r >= 0) {
        const a = recipes[3 * r], bb = recipes[3 * r + 1];
        g = G[a] || 'sparkle';
        b = G[bb] && G[bb] !== g ? G[bb] : (G[a] ? 'sparkle' : null);
      } else g = 'sparkle';
      autoIcon.push(it.name);
    }
    G[i] = g; Bd[i] = b || null;
  }
  const iconGroups = new Map();
  const V = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const k = G[i] + '|' + (Bd[i] || '');
    const n = iconGroups.get(k) || 0;
    V[i] = n;
    iconGroups.set(k, n + 1);
  }
  const dupIcons = [];
  for (const [k, n] of iconGroups) if (n > 1) dupIcons.push(`${k} ×${n}`);

  const outItems = list.map((it, i) => ({
    n: it.name,
    g: G[i],
    b: Bd[i],
    c: it.color || jitter(it.catColor, hash(it.key)),
    k: it.cat,
    v: V[i],
    s: cost[i] === UNREACHABLE ? -1 : cost[i],
  }));

  // İstatistik
  const hist = {};
  let maxSteps = 0;
  for (const it of outItems) {
    if (it.s < 0) continue;
    const bucket = it.s === 0 ? '0' : it.s <= 3 ? '1-3' : it.s <= 6 ? '4-6' : it.s <= 12 ? '7-12' : it.s <= 20 ? '13-20' : it.s <= 30 ? '21-30' : '31+';
    hist[bucket] = (hist[bucket] || 0) + 1;
    if (it.s > maxSteps) maxSteps = it.s;
  }
  const deadEnds = list.filter((it, i) => solver.uses[i] === 0).length;

  const library = {
    version: 1,
    cats,
    base: baseIds,
    items: outItems,
    recipes,
  };
  const report = {
    files: files.length,
    items: N,
    recipes: recipes.length / 3,
    explicitCount, tagCount, tagSkipped, multiCount,
    maxSteps, hist, deadEnds,
    autoIcon, dupIcons,
    errors, warnings, conflicts, overridden, multis,
  };
  return { library, report };
}

export function formatReport(r, { short = false, all = false } = {}) {
  const lines = [];
  lines.push(`\n  Külliyat: ${r.items} öğe · ${r.recipes} tarif (${r.explicitCount} yazılı + ${r.tagCount} etiket kuralından) · ${r.files} dosya`);
  lines.push(`  En derin hedef: ${r.maxSteps} adım · çıkmaz öğe: ${r.deadEnds}`);
  const order = ['0', '1-3', '4-6', '7-12', '13-20', '21-30', '31+'];
  lines.push(`  Adım dağılımı: ${order.filter(k => r.hist[k]).map(k => `${k}: ${r.hist[k]}`).join('  ')}`);
  const lim = all ? Infinity : short ? 8 : 60;
  const sec = (title, arr) => {
    if (!arr.length) return;
    lines.push(`  ${title} (${arr.length}):`);
    for (const x of arr.slice(0, lim)) lines.push('    · ' + x);
    if (arr.length > lim) lines.push(`    … ${arr.length - lim} tane daha`);
  };
  sec('HATALAR', r.errors);
  sec('Çakışmalar', r.conflicts);
  sec('Uyarılar', r.warnings);
  if (!short) {
    sec('Çoklu sonuçlu ikililer', r.multis);
    if (all) sec('Yıldızlı tarif düşürmeleri', r.overridden);
    sec('Otomatik ikon verilenler', r.autoIcon);
    sec('Aynı glif+rozet (varyantla ayrıştırıldı)', r.dupIcons);
  } else {
    if (r.autoIcon.length) lines.push(`  Otomatik ikon: ${r.autoIcon.length}`);
  }
  return lines.join('\n');
}

// Doğrudan çalıştırılırsa: rapor yazdır.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const all = process.argv.includes('--all');
  const { library, report } = buildLibrary(path.join(root, 'data'));
  console.log(formatReport(report, { all }));
  if (process.argv.includes('--write')) {
    const out = path.join(root, 'public', 'library.json');
    fs.writeFileSync(out, JSON.stringify(library));
    console.log(`\n  → ${path.relative(root, out)} yazıldı`);
  }
  process.exitCode = report.errors.length ? 1 : 0;
}
