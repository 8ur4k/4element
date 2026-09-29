// Küçük animasyon yardımcıları ve ipucu için "sanal el".
import { glyphSVG } from './icons.js';

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

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

// Parmak ucu, glifin (9, 3.5) noktasında; 42px boyutta ≈ (16, 6).
const TIP_X = 16, TIP_Y = 6;

export class Hand {
  constructor(el) {
    this.el = el;
    el.innerHTML = `<div class="hand-in">${glyphSVG('pointer')}</div>`;
    this.x = innerWidth / 2;
    this.y = innerHeight / 2;
  }
  set(x, y) {
    this.x = x; this.y = y;
    this.el.style.transform = `translate(${x - TIP_X}px, ${y - TIP_Y}px)`;
  }
  show(x, y) { this.set(x, y); this.el.classList.remove('hidden', 'press'); }
  hide() { this.el.classList.add('hidden'); this.el.classList.remove('press'); }
  moveTo(x, y, dur, onStep, arc = 26) {
    const x0 = this.x, y0 = this.y;
    const dist = Math.hypot(x - x0, y - y0);
    const lift = Math.min(arc, dist * 0.15);
    return tween(dur, (e) => {
      const cx = x0 + (x - x0) * e;
      const cy = y0 + (y - y0) * e - Math.sin(e * Math.PI) * lift;
      this.set(cx, cy);
      if (onStep) onStep(cx, cy);
    });
  }
  async press() { this.el.classList.add('press'); await sleep(170); }
  async release() { this.el.classList.remove('press'); await sleep(90); }
}
