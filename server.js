// 4 Element — bağımlılıksız yerel sunucu.
// Külliyat (data/*.txt) her istekte değişiklik kontrolüyle yeniden derlenir.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLibrary, formatReport } from './tools/build.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
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
  console.log(`\n  4 Element hazır →  http://localhost:${PORT}\n`);
});
