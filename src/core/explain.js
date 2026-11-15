// Plain-language explanations of a flag, built from the contract and the lint
// data. Written for a designer who doesn't read code and a developer who
// doesn't know the design system: name the property, the value, and the
// contract value it should have been.

import { resolveToken } from './proposals.js';

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PX = /\b\d+(?:\.\d+)?px\b/g;
const VARIANT = /variant=["']([^"']+)["']/;
const PROPERTY = /^\s*([a-z-]+)\s*:/i;

// Within this RGB distance a color reads as "a shade off" its token.
const NEAR_COLOR = 60;

const PROPERTY_LABEL = {
  background: 'Fill',
  'background-color': 'Fill',
  color: 'Text color',
  'border-color': 'Border color',
  border: 'Border',
  fill: 'Icon fill',
  stroke: 'Icon stroke',
  padding: 'Padding',
  margin: 'Margin',
  gap: 'Gap',
};

// One line saying what was flagged, e.g.
// "Fill #3B82F6 is a shade off color.primary (#2563EB)".
export function flagTitle(deviation, contract) {
  const { rule, snippet, suggestedToken } = deviation;
  const component = contract.component?.name ?? 'The component';
  const label = propertyLabel(snippet);

  if (rule === 'no-hardcoded-color') {
    const hex = snippet.match(HEX)?.[0]?.toUpperCase();
    if (hex) {
      const same = sameValueAsToken(deviation, contract);
      if (same) return `Hard-coded ${hex} instead of ${suggestedToken} (same value)`;
      const named = tokenWithValue(contract, 'color', hex);
      if (named) return `${label ?? 'Color'} ${hex} is ${named}, which ${component} doesn’t use`;
      const target = resolveToken(contract, suggestedToken);
      if (target && distance(hex, target) <= NEAR_COLOR) {
        return `${label ?? 'Color'} ${hex} is a shade off ${suggestedToken} (${target.toUpperCase()})`;
      }
      return `${label ?? 'Color'} ${hex} isn’t a ${component} color${target ? `; the fix is ${suggestedToken} (${target.toUpperCase()})` : ''}`;
    }
  }

  if (rule === 'no-arbitrary-spacing') {
    const scale = allowedScale(contract, 'spacing');
    const value = (snippet.match(PX) ?? []).find((v) => !scale.some((s) => s.px === px(v)));
    if (value && scale.length) {
      const n = px(value);
      const below = scale.filter((s) => s.px < n).at(-1);
      const above = scale.find((s) => s.px > n);
      const name = label ?? 'Spacing';
      if (below && above) return `${name} ${value} falls between ${fmt(below)} and ${fmt(above)}`;
      if (above) return `${name} ${value} is below the smallest ${component} spacing, ${fmt(above)}`;
      return `${name} ${value} is above the largest ${component} spacing, ${fmt(below)}`;
    }
  }

  if (rule === 'no-off-contract-variant') {
    const variant = snippet.match(VARIANT)?.[1];
    if (variant) return `${component} has no “${variant}” variant`;
  }

  return `This line breaks the rule ${rule}`;
}

// The contract rule behind the flag, in plain language.
export function flagRule(deviation, contract) {
  const component = contract.component?.name ?? 'The component';
  const allowed = contract.component?.allowedTokens ?? {};

  if (deviation.rule === 'no-hardcoded-color') {
    const tokens = allowed.color ?? [];
    return tokens.length
      ? `${component} may only use the ${tokens.length} color tokens in the contract, such as ${tokens[0]}. A hard-coded color skips them, so it won’t change when the tokens do.`
      : `${component} colors must come from the contract’s tokens. A hard-coded color skips them, so it won’t change when the tokens do.`;
  }
  if (deviation.rule === 'no-arbitrary-spacing') {
    const scale = allowedScale(contract, 'spacing');
    return scale.length
      ? `${component} spacing must come from the scale: ${list(scale.map(fmt))}. Values in between make components drift apart.`
      : `${component} spacing must come from the contract’s spacing tokens.`;
  }
  if (deviation.rule === 'no-off-contract-variant') {
    const variants = contract.component?.variants ?? [];
    return `${component} comes in ${list(variants)}. Any other variant has no agreed design, so nobody has decided how it should look or behave.`;
  }
  return `The lint rule ${deviation.rule} flagged this line. The contract doesn’t describe this rule.`;
}

// When a hard-coded color is exactly its suggested token's value (#FFFFFF for color.surface),
// Reject changes nothing on screen, only the reference. Returns { token, value }, or null.
export function sameValueAsToken(deviation, contract) {
  if (deviation.rule !== 'no-hardcoded-color') return null;
  const hex = deviation.snippet.match(HEX)?.[0];
  const target = resolveToken(contract, deviation.suggestedToken);
  if (!hex || !HEX.test(String(target ?? ''))) return null;
  return fullHex(hex) === fullHex(target) ? { token: deviation.suggestedToken, value: fullHex(target) } : null;
}

// A long path shortened in the middle for a narrow header: the first two folders, an ellipsis,
// and the file name (itself shortened in the middle if long). Short paths come back unchanged.
// "src/features/billing/components/UpgradePlanBannerWithAnnualDiscountCallout.tsx"
//   -> "src/features/…/UpgradePlanBanner…Callout.tsx"
export function shortPath(path, { max = 40, name = 28 } = {}) {
  const text = String(path);
  if (text.length <= max) return text;
  const parts = text.split('/');
  let file = parts.pop();
  if (file.length > name) {
    const dot = file.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [file.slice(0, dot), file.slice(dot)] : [file, ''];
    file = `${stem.slice(0, 17)}…${stem.slice(-7)}${ext}`;
  }
  const head = parts.slice(0, 2);
  return [...head, ...(parts.length > head.length ? ['…'] : []), file].join('/');
}

function fullHex(value) {
  let h = String(value).replace('#', '').toUpperCase();
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  return `#${h}`;
}

function propertyLabel(snippet) {
  const prop = snippet.match(PROPERTY)?.[1]?.toLowerCase();
  if (!prop) return null;
  return PROPERTY_LABEL[prop] ?? prop.charAt(0).toUpperCase() + prop.slice(1).replace(/-/g, ' ');
}

function tokenWithValue(contract, group, hex) {
  const entry = Object.entries(contract.tokens?.[group] ?? {}).find(([, v]) => String(v).toUpperCase() === hex);
  if (!entry) return null;
  const path = `${group}.${entry[0]}`;
  return (contract.component?.allowedTokens?.[group] ?? []).includes(path) ? null : path;
}

// Allowed tokens for a group with px values, smallest first.
function allowedScale(contract, group) {
  return (contract.component?.allowedTokens?.[group] ?? [])
    .map((path) => ({ path, value: resolveToken(contract, path) }))
    .filter((t) => /^\d+(\.\d+)?px$/.test(String(t.value)))
    .map((t) => ({ ...t, px: px(t.value) }))
    .sort((a, b) => a.px - b.px);
}

const px = (v) => parseFloat(v);
const fmt = (t) => `${t.path} (${t.value})`;
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

function rgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function distance(a, b) {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
