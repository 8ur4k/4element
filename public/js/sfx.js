// Keşif sesi: WebAudio ile anında üretilen kısa, parlak bir "trink" (ses dosyası yok).
let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Tarayıcılar sesi ilk kullanıcı etkileşimine kadar kilitler; ilk tıklamada aç.
export function unlockAudio() {
  const once = () => { try { audio(); } catch { /* ses yok */ } };
  window.addEventListener('pointerdown', once, { once: true });
}

export function chime() {
  try {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime + 0.01;
    const out = ac.createGain();
    out.gain.value = 0.2;
    out.connect(ac.destination);
    // İki vuruş (Sol → Mi), çan benzeri kısmi seslerle
    for (const [f, d] of [[1567.98, 0], [2637.02, 0.075]]) {
      for (const [mul, amp, dec] of [[1, 1, 0.6], [2.76, 0.25, 0.25], [5.4, 0.07, 0.12]]) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        const s = t0 + d;
        o.type = 'sine';
        o.frequency.value = f * mul;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(amp, s + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, s + dec);
        o.connect(g).connect(out);
        o.start(s);
        o.stop(s + dec + 0.02);
      }
    }
  } catch { /* ses desteklenmiyor */ }
}
