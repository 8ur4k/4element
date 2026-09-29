// Küçük animasyon yardımcıları.

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Sekme arka plandayken requestAnimationFrame durur; animasyonun takılmaması için
// zamanlayıcı yedeği animasyonu süresi dolunca bitirir.
export function tween(dur, fn, ease = easeInOut) {
  return new Promise(resolve => {
    if (document.hidden) { fn(1, 1); resolve(); return; }
    const t0 = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      fn(1, 1);
      resolve();
    };
    const guard = setTimeout(finish, dur + 120);
    const step = (now) => {
      if (finished) return;
      const t = Math.min(1, (now - t0) / dur);
      if (t >= 1) { finish(); return; }
      fn(ease(t), t);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
