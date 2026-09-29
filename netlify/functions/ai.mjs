// Netlify fonksiyonu: yapay zeka modu için DeepSeek aracısı (/api/ai).
// Site ayarlarında DEEPSEEK_API_KEY ortam değişkeni tanımlanmalı.
import { handleAI } from '../../lib/ai.mjs';

export default async (request) => {
  const out = await handleAI({
    method: request.method,
    text: request.method === 'POST' ? await request.text() : '',
    key: request.headers.get('x-deepseek-key'),
  });
  if (out.json) return Response.json(out.json, { status: out.status, headers: { 'Cache-Control': 'no-store' } });
  const enc = new TextEncoder();
  const it = out.lines(request.signal);
  const body = new ReadableStream({
    async pull(ctrl) {
      const { value, done } = await it.next();
      if (done) ctrl.close(); else ctrl.enqueue(enc.encode(value));
    },
    cancel() { it.return(); },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
};

export const config = { path: '/api/ai' };
