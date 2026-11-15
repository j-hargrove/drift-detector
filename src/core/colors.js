// Colors in a snippet: hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA) and rgb()/rgba(), comma or space
// syntax, with an optional alpha (0–1 or a percentage). Pure; explain, proposals and preview share it.

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const RGB = /\brgba?\(\s*(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*(?:(?:,|\/)\s*(\d*\.?\d+%?)\s*)?\)/i;

// The first color in `text`, or null. Fields:
//   text    as written in the snippet: "#3b82f6", "rgba(37, 99, 235, 0.08)"
//   label   for titles: hex uppercased, rgb() without spaces: "#3B82F6", "rgba(37,99,235,0.08)"
//   rgb     [r, g, b], 0–255;  alpha  0–1
//   css     safe for a style attribute, rebuilt from the parsed numbers: "#3B82F6", "rgba(37, 99, 235, 0.08)"
//   index   where it starts in `text`
export function findColor(text) {
  const s = String(text ?? '');
  const hex = HEX.exec(s);
  const rgb = RGB.exec(s);
  // Whichever comes first in the line.
  if (hex && (!rgb || hex.index < rgb.index)) return fromHex(hex[0], hex.index);
  if (rgb) return fromRgb(rgb);
  return null;
}

// A token value (always written as a value, e.g. "#2563EB") parsed the same way; null if it isn't a color.
export const parseColor = (value) => {
  const c = findColor(value);
  return c && c.text === String(value).trim() ? c : null;
};

// Euclidean RGB distance, ignoring alpha.
export const distance = (a, b) => Math.hypot(a.rgb[0] - b.rgb[0], a.rgb[1] - b.rgb[1], a.rgb[2] - b.rgb[2]);

// Same color on screen: same channels and both opaque.
export const sameColor = (a, b) => a.alpha === 1 && b.alpha === 1 && distance(a, b) === 0;

function fromHex(text, index) {
  let h = text.slice(1).toUpperCase();
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const alpha = h.length === 8 ? round(parseInt(h.slice(6, 8), 16) / 255) : 1;
  return { text, label: text.toUpperCase(), rgb, alpha, css: text.toUpperCase(), index };
}

function fromRgb(m) {
  const rgb = [m[1], m[2], m[3]].map(Number);
  if (rgb.some((n) => n > 255)) return null;
  let alpha = 1;
  if (m[4] !== undefined) alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (!(alpha >= 0 && alpha <= 1)) return null;
  alpha = round(alpha);
  const fn = m[4] === undefined ? 'rgb' : 'rgba';
  const parts = m[4] === undefined ? rgb : [...rgb, alpha];
  return { text: m[0], label: `${fn}(${parts.join(',')})`, rgb, alpha, css: `${fn}(${parts.join(', ')})`, index: m.index };
}

const round = (n) => Math.round(n * 1000) / 1000;
