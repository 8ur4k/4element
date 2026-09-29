// 4 Element — bağımlılıksız yerel sunucu.
// Külliyat (data/*.txt) her istekte değişiklik kontrolüyle yeniden derlenir.
// /api/ai: yapay zeka modu için DeepSeek aracısı (anahtar .env ya da ortamdan okunur).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLibrary, formatReport } from './tools/build.mjs';
import { handleAI } from './lib/ai.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, '.env'));
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let cache = null;
let stamp = '';

// Basit .env okuyucu: KEY=değer satırları; ortamda zaten tanımlı olanlar ezilmez.
function loadEnv(file) {
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function readBody(req, limit = 4e6) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('İstek çok büyük')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveAI(req, res) {
  const text = req.method === 'POST' ? await readBody(req) : '';
  const out = await handleAI({ method: req.method, text, key: req.headers['x-deepseek-key'] });
  if (out.json) {
    res.writeHead(out.status, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(out.json));
    return;
  }
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  for await (const chunk of out.lines(ac.signal)) {
    if (res.destroyed) break;
    res.write(chunk);
  }
  res.end();
}

function dataStamp() {
  return fs.readdirSync(DATA)
    .filter(f => f.endsWith('.txt'))
    .map(f => f + ':' + fs.statSync(path.join(DATA, f)).mtimeMs)
    .join('|');
}

function getLibrary() {
  const s = dataStamp();
  if (!cache || s !== stamp) {
    const t0 = Date.now();
    const { library, report } = buildLibrary(DATA);
    console.log(formatReport(report, { short: true }));
    console.log(`  (derleme ${Date.now() - t0} ms)`);
    cache = JSON.stringify(library);
    stamp = s;
  }
  return cache;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(url.pathname);
  if (p === '/api/ai') {
    serveAI(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': TYPES['.json'] });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }
  if (p === '/library.json') {
    try {
      const body = getLibrary();
      res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Külliyat derlenemedi: ' + err.message);
    }
    return;
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Bulunamadı'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => {
  getLibrary();
  const ai = process.env.DEEPSEEK_MOCK ? 'deneme (DEEPSEEK_MOCK)' : process.env.DEEPSEEK_API_KEY ? 'açık' : 'anahtar yok (.env → DEEPSEEK_API_KEY)';
  console.log(`\n  4 Element hazır →  http://localhost:${PORT}\n  Yapay zeka modu: ${ai}\n`);
});
