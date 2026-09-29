// Yapay zeka modu — DeepSeek ile anlık birleşim üretimi (sunucu tarafı).
// server.js ve Netlify fonksiyonu ortak kullanır. İstemci dünyanın öğe adlarını,
// geçmiş birleşimlerini ve çözülecek çiftleri gönderir; istem burada kurulur ve
// modelin çıktısı satır satır ayrıştırılıp { i, o, t, e, c, k, r } olarak akıtılır.
import { AI_CATS } from '../public/js/ai.js';

const API = 'https://api.deepseek.com/chat/completions';
const MAX_PAIRS = 12;
const MAX_ITEMS = 8000;
const MAX_HISTORY = 4000;

const model = () => process.env.DEEPSEEK_MODEL || 'deepseek-flash';
const mock = () => !!process.env.DEEPSEEK_MOCK;

const SYSTEM = `Sen "4 Element" adlı Türkçe simya oyununun kural motorusun. Oyuncu Ateş, Su, Toprak ve Hava ile başlar; iki öğeyi üst üste koyup yeni öğeler bulur. Sana numaralı öğe çiftleri verilir, her birinin sonucunu sen belirlersin.

KARAR SIRASI — her çift için yukarıdan aşağı dene, ilk uyan kuralı kullan:
1 = GERÇEK BİRLEŞİM: İkisi karışınca, biri diğerine uygulanınca, biri diğerinden yapılınca ya da ikisi birlikte kullanılınca doğrudan ortaya çıkan şey.
    Su + Ateş = Buhar · Toprak + Su = Çamur · Kum + Ateş = Cam · Un + Su = Hamur · Kuş + Metal = Uçak
2 = ORTAK NOKTA: İkisinin birlikte bulunduğu yer, ikisini de kapsayan üst kavram ya da ikisini bağlayan en bilinen şey veya kişi.
    Kum + Deniz = Plaj · İnek + Tavuk = Çiftlik · Kitap + Sessizlik = Kütüphane · Doktor + Hasta = Hastane · Elma + Yerçekimi = Newton
3 = KELİME OYUNU / ESPRİ: Adların birleşip gerçek bir kelime oluşturması, bir deyim ya da atasözü, ses benzerliği ya da herkesin bildiği kültürel bir gönderme; esprili ama "hah, tabii" dedirten sonuç.
    Ay + Çiçek = Ayçiçeği · Deve + Kuş = Devekuşu · Kara + Deniz = Karadeniz · Göz + Yaş = Gözyaşı · Kedi + Kutu = Schrödinger
0 = Üçü de doğal değilse birleşmez; sonuç "-".

İLKELER
- ÖNGÖRÜLEBİLİRLİK en önemli kuraldır. Düşünen bir oyuncu "bunu bununla birleştirirsem şuna giderim" diye tahmin edebilmeli, sonucu görünce "tabii ya" demeli. Rastgele, uzak çağrışımlı, zorlama ya da saçma sonuç verme. Emin değilsen "-" yaz; her çiftin birleşmesi gerekmez.
- Aynı mantık her yerde aynı işlesin: Ateş ısıtır ve yakar, Su ıslatır ve söndürür, Zaman eskitir ve büyütür, İnsan kullanır ve üretir. Benzer çiftler benzer sonuçlar versin.
- Sonuç çoğunlukla girdilerden bir adım ileri, daha gelişmiş ya da daha özel bir şeydir. Ama mantıklıysa zaten bilinen bir öğe de olabilir (Taş + Taş = Kaya gibi); her seferinde yeni bir şey üretmek zorunda değilsin.
- Sonuç girdilerden biriyle aynı olamaz. Girdileri yan yana yazıp uydurma ad yapma ("Kumlu Deniz" değil, Plaj); kural 3'teki gibi gerçekten var olan bileşik kelimeler serbesttir.
- Sonuç her türden olabilir: nesne, madde, canlı, yer, olay, meslek, duygu, kavram, eylem (mastar hâlinde: Yüzmek), ünlü kişi, efsanevi varlık, ünlü eser. Yeter ki herkesin bildiği bir şey olsun.
- Bir öğe kendisiyle de birleşebilir (Su + Su = Göl). Sıra önemsizdir: A + B ile B + A aynıdır.
- TUTARLILIK: "Bilinen birleşimler" bu dünyanın kanonudur; onunla çelişme, aynı mantığı sürdür. Bilinen bir öğeyi kastediyorsan adını listedeki gibi AYNEN yaz ("Buhar" varken "Su Buharı" yazma). Aynı kavramı iki farklı adla üretme.
- Adlar Türkçe, kısa (1–3 kelime), tekil ve ilk harfi büyük olsun (Kardan Adam, Newton, İstanbul). Uydurma kelime yok; yabancı özel adlar kendi yazımıyla.
- Müstehcen, nefret ya da aşağılama içeren sonuç yok.

ÇIKTI — her çift için tam olarak bir satır yaz, başka hiçbir şey yazma (başlık, açıklama, kod bloğu yok):
NO|SONUÇ|TÜR|EMOJİ|RENK|KATEGORİ|NEDEN
- NO: çiftin numarası
- SONUÇ: öğenin adı; birleşmiyorsa -
- TÜR: 1, 2 ya da 3; birleşmiyorsa 0
- EMOJİ, RENK, KATEGORİ yalnızca sonuç YENİ bir öğeyse doldurulur; bilinen bir öğeyse boş bırakılır.
  EMOJİ: sonucu en iyi anlatan tek emoji
  RENK: sonucun doğal ya da çağrıştırdığı renk; # olmadan 6 haneli hex, orta tonda
  KATEGORİ: ${AI_CATS.join(', ')} içinden biri
- NEDEN: en fazla 8 kelimelik kısa gerekçe; birleşmiyorsa boş

Örnek (Buhar biliniyor, Plaj henüz yok):
1|Buhar|1||||Ateş suyu ısıtıp buharlaştırır
2|Plaj|2|🏖️|e3c27a|Yer|Kum ve deniz kıyıda buluşur
3|-|0||||`;

// Geçmiş en başta ve yalnızca sona eklenerek büyür; böylece istemin başı istekler
// arasında aynı kalır ve DeepSeek'in önek önbelleğinden yararlanır.
function userPrompt({ items, pairs, history }) {
  const canon = history.length
    ? history.map(([a, b, o]) => `${items[a]} + ${items[b]} = ${items[o]}`).join('\n')
    : '(henüz yok)';
  const ask = pairs.map(([a, b], i) => `${i + 1}. ${items[a]} + ${items[b]}`).join('\n');
  return `BİLİNEN BİRLEŞİMLER (bu dünyanın kanonu, eskiden yeniye):\n${canon}\n\n`
    + `BİLİNEN ÖĞELER: ${items.join(', ')}\n\n`
    + `ÇÖZÜLECEK ÇİFTLER (${pairs.length}):\n${ask}`;
}

function parseRequest(body) {
  const clean = (s) => String(s).replace(/[\r\n|]+/g, ' ').trim().slice(0, 48);
  if (!body || !Array.isArray(body.items) || !Array.isArray(body.pairs)) throw new Error('eksik alan');
  const items = body.items.slice(0, MAX_ITEMS).map(clean);
  const ok = (x) => Number.isInteger(x) && x >= 0 && x < items.length;
  const pairs = body.pairs.slice(0, MAX_PAIRS).filter(p => Array.isArray(p) && ok(p[0]) && ok(p[1]));
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-MAX_HISTORY)
    .filter(h => Array.isArray(h) && ok(h[0]) && ok(h[1]) && ok(h[2]));
  if (!pairs.length) throw new Error('çift yok');
  return { items, pairs, history };
}

// "3|Plaj|2|🏖️|e3c27a|Yer|Kum ve deniz kıyıda buluşur"
function parseLine(line, n) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 3) return null;
  const i = parseInt(parts[0].replace(/\D/g, ''), 10) - 1;
  if (!(i >= 0 && i < n)) return null;
  let o = parts[1].replace(/^["'“”*`]+|["'“”*`.]+$/g, '').trim();
  if (!o || o === '-' || /^(yok|hiçbiri|none|null)$/i.test(o)) o = null;
  const t = parseInt(parts[2], 10);
  return {
    i,
    o,
    t: o ? (t >= 1 && t <= 3 ? t : 1) : 0,
    e: parts[3] || '',
    c: (parts[4] || '').replace(/^#/, ''),
    k: parts[5] || '',
    r: o ? parts.slice(6).join(' ').slice(0, 100) : '',
  };
}

async function* solve(req, key, signal) {
  if (mock()) { yield* solveMock(req); return; }
  const n = req.pairs.length;
  const res = await fetch(API, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model(),
      thinking: { type: 'disabled' },
      stream: true,
      temperature: 0.3,
      max_tokens: 90 * n + 60,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt(req) },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    let msg = txt;
    try { msg = JSON.parse(txt).error.message || txt; } catch { /* düz metin */ }
    const err = new Error(`DeepSeek ${res.status}: ${String(msg).slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const seen = new Set();
  let sse = '', text = '';
  function* take(final) {
    for (;;) {
      const nl = text.indexOf('\n');
      if (nl < 0 && !(final && text)) return;
      const line = nl < 0 ? text : text.slice(0, nl);
      text = nl < 0 ? '' : text.slice(nl + 1);
      const r = parseLine(line, n);
      if (r && !seen.has(r.i)) { seen.add(r.i); yield r; }
    }
  }
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    sse += dec.decode(value, { stream: true });
    let nl;
    while ((nl = sse.indexOf('\n')) >= 0) {
      const line = sse.slice(0, nl).trim();
      sse = sse.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      const piece = j.choices?.[0]?.delta?.content;
      if (piece) { text += piece; yield* take(false); }
    }
  }
  yield* take(true);
}

// DEEPSEEK_MOCK=1: anahtarsız deneme için sahte ama tutarlı sonuçlar.
async function* solveMock({ items, pairs }) {
  const EMO = ['🌋', '🌊', '🌪️', '🪨', '🌱', '⚡', '🧪', '🏺', '🐉', '🌈', '🧊', '🔮'];
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  for (let i = 0; i < pairs.length; i++) {
    await new Promise(r => setTimeout(r, 90));
    const [A, B] = pairs[i].map(x => items[x]).sort();
    const h = hash(A + '+' + B);
    if (h % 10 < 3) { yield { i, o: null, t: 0, e: '', c: '', k: '', r: '' }; continue; }
    if (h % 10 < 5 && items.length > 8) {
      const o = items[4 + ((h >>> 4) % (items.length - 4))];
      if (o !== A && o !== B) { yield { i, o, t: 2, e: '', c: '', k: '', r: 'deneme: bilinen öğe' }; continue; }
    }
    const o = A.slice(0, 3) + B.slice(-3).toLocaleLowerCase('tr-TR');
    yield { i, o, t: 1 + (h % 3), e: EMO[h % EMO.length], c: (h & 0xffffff).toString(16).padStart(6, '0'), k: AI_CATS[h % AI_CATS.length], r: 'deneme modu sonucu' };
  }
}

// Ortak istek işleyici: { status, json } ya da { status, lines(signal) } döner.
export async function handleAI({ method, text, key: userKey }) {
  if (method === 'GET') {
    return { status: 200, json: { ok: true, hasKey: !!process.env.DEEPSEEK_API_KEY || mock(), model: mock() ? 'deneme' : model() } };
  }
  if (method !== 'POST') return { status: 405, json: { error: 'POST bekleniyor.' } };
  let req;
  try { req = parseRequest(JSON.parse(text)); } catch (e) { return { status: 400, json: { error: 'Geçersiz istek: ' + e.message } }; }
  const key = process.env.DEEPSEEK_API_KEY || userKey || '';
  if (!key && !mock()) return { status: 401, json: { error: 'DeepSeek API anahtarı tanımlı değil.' } };
  return {
    status: 200,
    async* lines(signal) {
      try {
        for await (const r of solve(req, key, signal)) yield JSON.stringify(r) + '\n';
      } catch (e) {
        if (!signal?.aborted) yield JSON.stringify({ error: e.message, status: e.status || 0 }) + '\n';
      }
    },
  };
}
