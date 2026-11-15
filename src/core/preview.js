// What a deviation looks like, drawn from contract tokens: what the agent built,
// what Reject would ship, and what Amend would ship. Pure data; render.js draws it.

import { resolveToken, tokenGroup } from './proposals.js';
import { findColor } from './colors.js';

const PX = /\b(\d+(?:\.\d+)?)px\b/;
const VARIANT = /variant=["']([^"']+)["']/;
const CHILDREN = />([^<]+)</;
const PROPERTY = /^\s*([a-z-]+)\s*:/i;

// How the contract's variants are drawn, as token paths. A variant with no entry falls back to the
// component's default (first) variant, which is what an unknown variant renders as today.
const VARIANT_TOKENS = {
  primary: { bg: 'color.primary', fg: 'color.surface', border: 'color.primary' },
  secondary: { bg: 'color.surface', fg: 'color.text', border: 'color.border' },
  ghost: { bg: null, fg: 'color.primary', border: null },
};
const BASE = { padding: 'spacing.3', paddingInline: 'spacing.4', radius: 'radius.md' };

// Previews are true size; the measured brackets carry the px values.
export const SPACING_SCALE = 1;

export function preview(deviation, contract) {
  if (deviation.rule === 'no-off-contract-variant') return variantPreview(deviation, contract);
  if (deviation.rule === 'no-hardcoded-color') return colorPreview(deviation, contract);
  if (deviation.rule === 'no-arbitrary-spacing') return spacingPreview(deviation, contract);
  return null;
}

function variantPreview(d, contract) {
  const built = d.snippet.match(VARIANT)?.[1];
  const fix = d.suggestedToken.match(VARIANT)?.[1];
  if (!built || !fix) return null;
  const label = d.snippet.match(CHILDREN)?.[1]?.trim() || contract.component?.name || 'Button';
  const fallback = contract.component?.variants?.[0] ?? 'primary';
  // Amend may also allow a color (color.danger for destructive); the new variant is drawn with it.
  const amendColor = (d.alsoAllowTokens ?? []).find((t) => tokenGroup(t) === 'color');
  const amendTokens = amendColor ? { bg: amendColor, fg: 'color.surface', border: amendColor } : VARIANT_TOKENS[fallback];
  return {
    kind: 'variant',
    panels: [
      { label: 'Agent built', caption: 'No contract style yet', button: button(contract, label, VARIANT_TOKENS[built] ?? VARIANT_TOKENS[fallback]) },
      { label: 'If you Reject', caption: `variant="${fix}"`, button: button(contract, label, VARIANT_TOKENS[fix] ?? VARIANT_TOKENS[fallback]) },
      { label: 'If you Amend', caption: `variant="${built}"${amendColor ? ` with ${amendColor}` : ''}`, button: button(contract, label, amendTokens) },
    ],
  };
}

// Swatches: `value` is the text shown under the chip, `css` the fill (hex, or rgb()/rgba() rebuilt from its
// parsed numbers, so nothing from the snippet reaches the style attribute as written). render.js draws the
// fill on a white chip, so a see-through rgba shows as it would on a white surface.
function colorPreview(d, contract) {
  const agent = findColor(d.snippet);
  const token = color(resolveToken(contract, d.suggestedToken), null);
  if (!agent || !token) return null;
  return {
    kind: 'color',
    panels: [
      { label: 'Agent built', caption: 'Kept if you Amend', swatch: { value: agent.label, css: agent.css, name: null } },
      { label: 'If you Reject', caption: d.suggestedToken, swatch: { value: token, css: token, name: d.suggestedToken } },
    ],
  };
}

function spacingPreview(d, contract) {
  const agent = Number(d.snippet.match(PX)?.[1]);
  const token = parseFloat(resolveToken(contract, d.suggestedToken));
  if (!agent || !token) return null;
  const property = d.snippet.match(PROPERTY)?.[1]?.toLowerCase() === 'gap' ? 'gap' : 'padding';
  const label = contract.component?.name ?? 'Button';
  const look = button(contract, label, VARIANT_TOKENS.primary);
  return {
    kind: 'spacing',
    property,
    scale: SPACING_SCALE,
    panels: [
      { label: 'Agent built', caption: 'Kept if you Amend', px: agent, token: null, button: look },
      { label: 'If you Reject', caption: d.suggestedToken, px: token, token: d.suggestedToken, button: look },
    ],
  };
}

function button(contract, text, tokens) {
  const value = (path) => (path ? resolveToken(contract, path) : null);
  return {
    text,
    bg: color(value(tokens.bg), 'transparent'),
    fg: color(value(tokens.fg), '#000000'),
    border: color(value(tokens.border), 'transparent'),
    padding: length(value(BASE.padding), '12px'),
    paddingInline: length(value(BASE.paddingInline), '16px'),
    radius: length(value(BASE.radius), '8px'),
  };
}

// Token values end up in inline styles, and contracts can be user-supplied:
// only plain hex colors and px lengths get through.
export const color = (v, fallback) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? String(v).toUpperCase() : fallback);
const length = (v, fallback) => (/^\d+(\.\d+)?px$/.test(String(v)) ? String(v) : fallback);
