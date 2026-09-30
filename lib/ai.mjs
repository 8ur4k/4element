// Yapay zeka modu — DeepSeek ile anlık birleşim üretimi (sunucu tarafı).
// server.js ve Netlify fonksiyonu ortak kullanır. İstemci dünyanın öğe adlarını,
// geçmiş birleşimlerini, turun gizli hedefini ve çözülecek çiftleri gönderir; istem
// burada kurulur ve modelin çıktısı satır satır ayrıştırılıp { i, o, t, e, c, k, r }
// olarak akıtılır. Model düşünme modu kapalı çalışır: bu istemle düşünme modu çok uzun
// düşünüp çıktı sınırına takılıyor.
import { AI_CATS } from '../public/js/ai.js';

const API = 'https://api.deepseek.com/chat/completions';
const MAX_PAIRS = 12;
const MAX_ITEMS = 8000;
const MAX_HISTORY = 4000;

const model = () => process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
const mock = () => !!process.env.DEEPSEEK_MOCK;

const SYSTEM = `Sen "4 Element" adlı Türkçe simya oyununun kural motorusun. Oyuncu Ateş, Su, Toprak ve Hava ile başlar; iki öğeyi üst üste koyup yeni öğeler bulur. Sana numaralı öğe çiftleri verilir, her birinin sonucunu sen belirlersin.

NASIL KARAR VERİRSİN
1 = BARİZ BİRLEŞİM: İkisi bir araya gelince, biri diğerine uygulanınca ya da biri diğerinden yapılınca herkesin hemen söyleyeceği tek ve açık bir sonuç varsa odur.
    Su + Ateş = Buhar · Toprak + Su = Çamur · Kum + Ateş = Cam · Un + Su = Hamur · Kuş + Metal = Uçak
    Bariz bir birleşim yoksa zorlama (girdileri yan yana yapıştırmak birleşim değildir); aşağıdaki yollardan en akıllıcasını seç:
2 = ORTAK NOKTA / ÇAĞRIŞIM: İkisinin birlikte bulunduğu yer, ikisini birden çağrıştıran kavram, nesne, kişi, olay ya da eser.
    Kum + Deniz = Plaj · İnek + Tavuk = Çiftlik · Kitap + Sessizlik = Kütüphane · Elma + Yerçekimi = Newton · Fırtına + Dağ = Çığ
3 = KELİME OYUNU / ESPRİ: Adların birleşip gerçek bir kelime oluşturması, deyim, atasözü, ses benzerliği ya da herkesin bildiği kültürel bir gönderme; "hah, güzelmiş" dedirten sonuç.
    Ay + Çiçek = Ayçiçeği · Deve + Kuş = Devekuşu · Kara + Deniz = Karadeniz · Göz + Yaş = Gözyaşı · Kedi + Kutu = Schrödinger
0 = Üç yol da akla yatkın bir sonuç vermiyorsa "-". Bu son çaredir: önce 2 ve 3'ü gerçekten dene.

İLKELER
- ÖNGÖRÜLEBİLİRLİK: Düşünen bir oyuncu sonucu tahmin edebilmeli; görünce "tabii ya" ya da "hah, güzelmiş" demeli. Rastgele, uzak ya da saçma sonuç verme.
- YENİLİK: Dünya büyümeli. Bilinen bir öğeyi yalnızca açıkça en doğal cevap oysa ver; değilse yeni bir kavram üret. Aynı birkaç öğeye tekrar tekrar dönme.
- Var olan bir öğenin sıfatlı, büyütülmüş ya da ufak farklı türevini üretme ("Süper Kasırga", "Sisli Bataklık", "Büyük Dalga", "Yoğun Sis"); bunlar yeni sayılmaz. Bunun yerine farklı ve herkesin tanıdığı bir kavram bul.
- ÇEŞİTLİLİK: Öğeler karmaşıklaştıkça sonuçlar da zenginleşsin ve alan değiştirsin: canlılar, insanlar, meslekler, aletler, yapılar, icatlar, yiyecekler, sanat, spor, bilim, tarih, mitoloji, ünlü kişiler, yerler, duygular, eylemler. Hep aynı alanda (ör. yalnızca hava olayları) dönüp durma.
- Aynı mantık her yerde aynı işlesin: Ateş ısıtır ve yakar, Su ıslatır ve söndürür, Zaman eskitir ve büyütür, İnsan kullanır ve üretir. Benzer çiftler benzer mantıkla çözülsün.
- Sonuç girdilerden biriyle ASLA aynı olamaz (Maden + Uzay Madenciliği = Maden olmaz).
- Sonuç her türden olabilir: nesne, madde, canlı, yer, olay, meslek, duygu, kavram, eylem (mastar hâlinde: Yüzmek), ünlü kişi, efsanevi varlık, ünlü eser. Yeter ki herkesin bildiği bir şey olsun.
- Bir öğe kendisiyle de birleşebilir (Su + Su = Göl). Sıra önemsizdir: A + B ile B + A aynıdır.
- TUTARLILIK: "Bilinen birleşimler" bu dünyanın kanonudur; onunla çelişme. Bilinen bir öğeyi kastediyorsan adını listedeki gibi AYNEN yaz ("Buhar" varken "Su Buharı" yazma). Aynı kavramı iki farklı adla üretme.
- Adlar Türkçe, kısa (1–3 kelime), tekil ve ilk harfi büyük olsun (Kardan Adam, Newton, İstanbul). Uydurma kelime yok; yabancı özel adlar kendi yazımıyla.
- Müstehcen, nefret ya da aşağılama içeren sonuç yok.
- Kullanıcı mesajında bir GİZLİ HEDEF verilebilir; onunla ilgili kurala kesinlikle uy.

ÇIKTI — her çift için tam olarak bir satır yaz, başka hiçbir şey yazma (başlık, açıklama, kod bloğu yok):
NO|SONUÇ|TÜR|EMOJİ|RENK|KATEGORİ|NEDEN
- NO: çiftin numarası
- SONUÇ: YALNIZCA sonucun adı. Çifti, "+" ya da "=" asla yazma. Birleşmiyorsa tek başına -
- TÜR: 1, 2 ya da 3; birleşmiyorsa 0
- EMOJİ: sonucu en iyi anlatan tek emoji (her sonuç için, bilinen öğe olsa bile)
- RENK: sonucun doğal ya da çağrıştırdığı renk; # olmadan 6 haneli hex, orta tonda
- KATEGORİ: ${AI_CATS.join(', ')} içinden biri
- NEDEN: en fazla 8 kelimelik kısa gerekçe
- Birleşmiyorsa satır tam olarak şöyledir: NO|-|0||||

Örnek:
1|Buhar|1|💨|b8c6d4|Doğa|Ateş suyu ısıtıp buharlaştırır
2|Plaj|2|🏖️|e3c27a|Yer|Kum ve deniz kıyıda buluşur
3|-|0||||

YANLIŞ: 4|Angarya + Ev = -|0||||   DOĞRU: 4|-|0||||
YANLIŞ: 5|Maden|1|⛏️|8a7f70|Madde|...  (Maden + Uzay Madenciliği için; sonuç girdilerden biri olamaz)   DOĞRU: 5|-|0||||`;

// Geçmiş en başta ve yalnızca sona eklenerek büyür; böylece istemin başı istekler
// arasında aynı kalır ve DeepSeek'in önek önbelleğinden yararlanır.
// Gizli hedef istemin sonundadır; önek önbelleğini bozmaz.
function userPrompt({ items, pairs, history, target }) {
  const canon = history.length
    ? history.map(([a, b, o]) => `${items[a]} + ${items[b]} = ${items[o]}`).join('\n')
    : '(henüz yok)';
  const goal = target
    ? `GİZLİ HEDEF: "${target}"\n`
      + `Oyuncu bu turda bu öğeyi arıyor. Hedef kararlarını HİÇ etkilemesin: sonuçları ona yaklaştırma, ondan uzaklaştırma da. `
      + `Her çifti önce hedef hiç yokmuş gibi çöz. Bulduğun sonuç bu kavram ya da eş anlamlısıysa ondan kaçınma, `
      + `adını tam olarak "${target}" diye yaz.\n\n`
    : '';
  const ask = pairs.map(([a, b], i) => `${i + 1}. ${items[a]} + ${items[b]}   (sonuç ${a === b ? items[a] : `${items[a]} ya da ${items[b]}`} olamaz)`).join('\n');
  return `BİLİNEN BİRLEŞİMLER (bu dünyanın kanonu, eskiden yeniye):\n${canon}\n\n`
    + `BİLİNEN ÖĞELER: ${items.join(', ')}\n\n`
    + goal
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
  const target = typeof body.target === 'string' ? clean(body.target).replace(/"/g, '') : '';
  return { items, pairs, history, target };
}

// "3|Plaj|2|🏖️|e3c27a|Yer|Kum ve deniz kıyıda buluşur"
function parseLine(line, n) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 3) return null;
  const i = parseInt(parts[0].replace(/\D/g, ''), 10) - 1;
  if (!(i >= 0 && i < n)) return null;
  let o = parts[1];
  if (o.includes('=')) o = o.slice(o.lastIndexOf('=') + 1);        // "A + B = C" yazılmışsa yalnızca C
  o = o.replace(/^["'“”*`]+|["'“”*`.]+$/g, '').trim();
  if (!o || o === '-' || o.includes('+') || /^(yok|hiçbiri|none|null)$/i.test(o)) o = null;
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
      temperature: 0.4,
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

// Hedef seçimi: rastgele adayların her birine "uğraştırma puanı" verdirilir, en yükseği seçilir.
const GOAL_PROMPT = (cands) => `"4 Element" adlı Türkçe simya oyunu için tur hedefi seçiyorsun. Oyuncu Ateş, Su, Toprak ve Hava ile başlar; iki öğeyi birleştirerek adım adım yeni öğeler bulur.

Her adaya, bu dört elementten ona ulaşmanın oyuncuyu ne kadar uğraştıracağını gösteren 0–10 arası bir puan ver:
- 0: soyut kavram, sıfat, sayı, işlem, duygu ya da belirsiz şey (Belirsizlik, Acısız, Sıfır, Güven, Selam). Bunlar asla hedef olmamalı.
- 0: birden fazla anlama gelen, yanlış anlaşılabilecek ad (Meme, Yüz, Dolu, Kanun gibi). Bunlar da asla hedef olmamalı.
- 1–3: doğada hazır bulunan ya da birkaç birleşimde çıkan basit şey (Tepe, Göl, Bakla, Omlet).
- 4–6: birkaç ara ürün gerektiren yiyecek, giysi ya da eşya (Vişne Reçeli, Kaftan, Taze Sıkma Portakal).
- 7–10: uzun bir teknoloji, zanaat, kültür ya da tarih zinciri gerektiren, herkesin bildiği şey (Sürücüsüz Araba, Tanker, Hollywood, Sultanahmet Camii, Algoritma).

${cands.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Her aday için tam bir satır yaz, başka hiçbir şey yazma: NO|PUAN`;

async function chooseGoal(cands, key) {
  if (mock()) return Math.floor(Math.random() * cands.length);
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model(),
      thinking: { type: 'disabled' },
      temperature: 0.2,
      max_tokens: 12 * cands.length + 20,
      messages: [{ role: 'user', content: GOAL_PROMPT(cands) }],
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const j = await res.json();
  const score = new Array(cands.length).fill(-1);
  for (const line of String(j.choices?.[0]?.message?.content || '').split('\n')) {
    const m = line.match(/(\d+)\D+(\d+)/);
    if (m && m[1] - 1 < cands.length) score[m[1] - 1] = +m[2];
  }
  const best = Math.max(...score);
  if (best <= 0) return -1;
  const top = score.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0);
  return top[Math.floor(Math.random() * top.length)];
}

// Ortak istek işleyici: { status, json } ya da { status, lines(signal) } döner.
export async function handleAI({ method, text, key: userKey }) {
  if (method === 'GET') {
    return { status: 200, json: { ok: true, hasKey: !!process.env.DEEPSEEK_API_KEY || mock(), model: mock() ? 'deneme' : model() } };
  }
  if (method !== 'POST') return { status: 405, json: { error: 'POST bekleniyor.' } };
  const key = process.env.DEEPSEEK_API_KEY || userKey || '';
  if (!key && !mock()) return { status: 401, json: { error: 'DeepSeek API anahtarı tanımlı değil.' } };
  let body, req;
  try { body = JSON.parse(text); } catch (e) { return { status: 400, json: { error: 'Geçersiz istek: ' + e.message } }; }
  if (Array.isArray(body.goal)) {
    const cands = body.goal.slice(0, 20).map(c => String(c).replace(/[\r\n|]+/g, ' ').trim().slice(0, 48)).filter(Boolean);
    if (!cands.length) return { status: 400, json: { error: 'Aday yok.' } };
    try { return { status: 200, json: { pick: await chooseGoal(cands, key) } }; } catch (e) { return { status: 502, json: { error: e.message } }; }
  }
  try { req = parseRequest(body); } catch (e) { return { status: 400, json: { error: 'Geçersiz istek: ' + e.message } }; }
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
