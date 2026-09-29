// Glif mini dilini SVG'ye çevirir ve öğe ikonlarını (renkli karo + glif + rozet) üretir.
import { GLYPHS } from './glyphs.js';

const svgCache = new Map();

function shape(tok) {
  const t = tok[0];
  if (t === 'M' || t === 'm') return `<path d="${tok}"/>`;
  const n = tok.slice(1).trim().split(/[\s,]+/).map(Number);
  if (t === 'c') return `<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}"/>`;
  if (t === 'e') {
    const rot = n[4] ? ` transform="rotate(${n[4]} ${n[0]} ${n[1]})"` : '';
    return `<ellipse cx="${n[0]}" cy="${n[1]}" rx="${n[2]}" ry="${n[3]}"${rot}/>`;
  }
  if (t === 'r') {
    const rx = n[4] ? ` rx="${n[4]}"` : '';
    const rot = n[5] ? ` transform="rotate(${n[5]} ${n[0] + n[2] / 2} ${n[1] + n[3] / 2})"` : '';
    return `<rect x="${n[0]}" y="${n[1]}" width="${n[2]}" height="${n[3]}"${rx}${rot}/>`;
  }
  return '';
}

export function glyphSVG(name) {
  let s = svgCache.get(name);
  if (s) return s;
  const dsl = GLYPHS[name] || GLYPHS.sparkle;
  let soft = '', main = '';
  for (let tok of dsl.split(';')) {
    tok = tok.trim();
    if (!tok) continue;
    const p = tok[0];
    if (p === '*') {
      const el = shape(tok.slice(1).trim());
      soft += el; main += el;
    } else if (p === '!') {
      main += shape(tok.slice(1).trim()).replace(/^<(\w+)/, '<$1 class="f"');
    } else if (p === '_') {
      main += shape(tok.slice(1).trim()).replace(/^<(\w+)/, '<$1 class="d"');
    } else if (p === '=') {
      main += shape(tok.slice(1).trim()).replace(/^<(\w+)/, '<$1 class="t"');
    } else {
      main += shape(tok);
    }
  }
  s = `<svg viewBox="0 0 24 24" class="gl" aria-hidden="true">${soft ? `<g class="s">${soft}</g>` : ''}${main}</svg>`;
  svgCache.set(name, s);
  return s;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function shade(hex, amt) {
  const [r, g, b] = rgb(hex);
  if (amt < 0) return toHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}

export function isLight(hex) {
  const [r, g, b] = rgb(hex).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

const styleCache = new Map();
function tileStyle(c) {
  let s = styleCache.get(c);
  if (!s) {
    s = `--c:${c};--c1:${shade(c, 0.22)};--c2:${shade(c, -0.22)};--d:${shade(c, -0.45)};--g:${isLight(c) ? '#1c1e26' : '#ffffff'}`;
    styleCache.set(c, s);
  }
  return s;
}

// it: { g, b, c, v }
export function iconHTML(it, cls = '') {
  const v = it.v ? ` v${((it.v - 1) % 8) + 1}` : '';
  let h = `<div class="ico${v}${cls ? ' ' + cls : ''}" style="${tileStyle(it.c)}">${glyphSVG(it.g)}`;
  if (it.b) h += `<span class="bdg">${glyphSVG(it.b)}</span>`;
  return h + '</div>';
}

export function uiIcon(name, cls = '') {
  return `<span class="ui-ico${cls ? ' ' + cls : ''}">${glyphSVG(name)}</span>`;
}
