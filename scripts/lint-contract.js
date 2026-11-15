#!/usr/bin/env node
// Checks a source tree against contract.json and writes a lint report:
//   { generatedAt, deviations: [{ id, rule, file, line, snippet, suggestedToken }] }
//
// Rules
//   no-hardcoded-color       a color literal (hex, rgb/hsl) instead of a token
//   no-arbitrary-spacing     a margin/padding/gap px value that isn't on the contract's spacing scale
//   no-off-contract-variant  <Button variant="..."> with a variant the contract doesn't list
//
// How
//   CSS: stylelint with stylelint-declaration-strict-value flags every color or spacing declaration that
//        doesn't use a variable; postcss finds the flagged declaration, and its values decide the rule.
//   TSX/JSX inline styles: a regex pass over style={{ ... }}.
//   Variants: TSX/JSX parsed with @babel/parser.
//   suggestedToken: the nearest token the component allows (colors by RGB distance, spacing by px;
//   a tie goes to the larger step). Variants suggest the contract's default (first) variant.
//
// IDs are dev-001, dev-002, ... in file order: files sorted by path, then by line and column.
//
// Usage
//   node scripts/lint-contract.js [srcDir] [--contract data/contract.json] [--out lint-report.json]
// Defaults: src, data/contract.json, lint-report.json. The default output is deliberately not
// data/lint-report.json, so a run can't overwrite the demo data by accident; pass --out to do that.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';
import postcss from 'postcss';
import { parse as parseTsx } from '@babel/parser';
import { resolveToken } from '../src/core/proposals.js';

const STRICT_RULE = 'scale-unlimited/declaration-strict-value';
const COLOR_PROPS = ['/color$/', 'fill', 'stroke', 'background', 'border', '/^border-(top|right|bottom|left)$/', 'outline', 'box-shadow'];
const SPACING_PROPS = ['/^(margin|padding)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/', 'gap', 'row-gap', 'column-gap'];
const KEYWORDS = ['transparent', 'inherit', 'initial', 'unset', 'revert', 'currentColor', 'currentcolor', 'none', 'auto', '0'];
const STYLELINT_CONFIG = {
  plugins: ['stylelint-declaration-strict-value'],
  rules: { [STRICT_RULE]: [[...COLOR_PROPS, ...SPACING_PROPS], { ignoreValues: KEYWORDS, ignoreFunctions: false }] },
};

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g;
const PX = /(?<![\w.-])(\d+(?:\.\d+)?)px\b/g;
const isSpacingProp = (prop) => /^(margin|padding)([A-Z-]|$)|^(gap|row-?gap|column-?gap|rowGap|columnGap)$/i.test(prop);
const isColorProp = (prop) => /color$|^(fill|stroke|background|border|outline|box-?shadow|boxShadow)/i.test(prop);

export async function lintContract({ srcDir = 'src', contract, cwd = process.cwd(), now = () => new Date().toISOString() }) {
  const root = resolve(cwd, srcDir);
  const files = (await walk(root)).sort((a, b) => toPosix(relative(cwd, a)).localeCompare(toPosix(relative(cwd, b))));
  const scale = spacingScale(contract);
  const colors = colorTokens(contract);
  const findings = [];
  for (const path of files) {
    const file = toPosix(relative(cwd, path));
    const text = await readFile(path, 'utf8');
    const ext = extname(path);
    const found = [];
    if (ext === '.css') found.push(...(await lintCss(text, path, { scale, colors })));
    if (ext === '.tsx' || ext === '.jsx') {
      found.push(...lintInlineStyles(text, { scale, colors }));
      found.push(...lintVariants(text, contract));
    }
    found.sort((a, b) => a.line - b.line || a.column - b.column);
    findings.push(...found.map((f) => ({ ...f, file })));
  }
  return {
    generatedAt: now(),
    deviations: findings.map(({ rule, file, line, snippet, suggestedToken }, i) => ({
      id: `dev-${String(i + 1).padStart(3, '0')}`,
      rule,
      file,
      line,
      snippet,
      suggestedToken,
    })),
  };
}

// --- CSS: stylelint finds declarations without a variable; their values decide the rule.

async function lintCss(code, codeFilename, ctx) {
  const { results } = await stylelint.lint({ code, codeFilename, config: STYLELINT_CONFIG });
  const flagged = new Set(
    results[0].warnings.filter((w) => w.rule === STRICT_RULE).map((w) => `${w.line}:${w.column}`),
  );
  const out = [];
  postcss.parse(code, { from: codeFilename }).walkDecls((decl) => {
    const { line, column } = decl.source.start;
    if (!flagged.has(`${line}:${column}`)) return;
    const finding = classify(decl.prop, decl.value, ctx);
    if (finding) out.push({ ...finding, line, column, snippet: `${decl.prop}: ${decl.value};` });
  });
  return out;
}

// --- TSX/JSX inline styles: style={{ prop: 'value', prop: 12 }}, by regex.

const STYLE_BLOCK = /style=\{\{([\s\S]*?)\}\}/g;
const STYLE_ENTRY = /([A-Za-z]+)\s*:\s*(?:(['"`])([^'"`]*)\2|(\d+(?:\.\d+)?)(?![\w.]))/g;

function lintInlineStyles(text, ctx) {
  const lines = text.split('\n');
  const out = [];
  for (const block of text.matchAll(STYLE_BLOCK)) {
    const start = block.index + block[0].indexOf(block[1]);
    for (const entry of block[1].matchAll(STYLE_ENTRY)) {
      const [, prop, , quoted, number] = entry;
      // React treats a bare number on a spacing property as px.
      const value = quoted ?? (isSpacingProp(prop) ? `${number}px` : number);
      const finding = classify(prop, value, ctx);
      if (!finding) continue;
      const { line, column } = position(text, start + entry.index);
      out.push({ ...finding, line, column, snippet: lines[line - 1].trim() });
    }
  }
  return out;
}

// --- Variants: <Button variant="..."> parsed from TSX/JSX.

function lintVariants(text, contract) {
  const component = contract.component?.name;
  const allowed = contract.component?.variants ?? [];
  if (!component || !allowed.length) return [];
  const ast = parseTsx(text, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true });
  const lines = text.split('\n');
  const out = [];
  visit(ast.program, (node) => {
    if (node.type !== 'JSXOpeningElement' || node.name.type !== 'JSXIdentifier' || node.name.name !== component) return;
    for (const attr of node.attributes) {
      if (attr.type !== 'JSXAttribute' || attr.name.name !== 'variant') continue;
      const variant = literal(attr.value);
      if (variant === null || allowed.includes(variant)) continue;
      const { line, column } = attr.loc.start;
      out.push({
        rule: 'no-off-contract-variant',
        line,
        column: column + 1,
        snippet: lines[line - 1].trim(),
        suggestedToken: `variant="${allowed[0]}"`,
      });
    }
  });
  return out;
}

// variant="x", variant={'x'}, variant={`x`}; anything dynamic can't be checked statically.
function literal(value) {
  if (!value) return null;
  if (value.type === 'StringLiteral') return value.value;
  if (value.type !== 'JSXExpressionContainer') return null;
  const e = value.expression;
  if (e.type === 'StringLiteral') return e.value;
  if (e.type === 'TemplateLiteral' && !e.expressions.length) return e.quasis[0].value.cooked;
  return null;
}

function visit(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const [key, child] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (Array.isArray(child)) child.forEach((c) => visit(c, fn));
    else if (child && typeof child === 'object') visit(child, fn);
  }
}

// --- Shared: which rule a declaration breaks, and the nearest allowed token.

function classify(prop, value, { scale, colors }) {
  if (isSpacingProp(prop)) {
    const offScale = [...value.matchAll(PX)].map((m) => Number(m[1])).find((px) => !scale.some((s) => s.px === px));
    if (offScale === undefined || !scale.length) return null;
    return { rule: 'no-arbitrary-spacing', suggestedToken: nearestSpacing(scale, offScale) };
  }
  if (isColorProp(prop)) {
    const literalColor = value.match(COLOR_LITERAL)?.[0];
    const rgb = literalColor && toRgb(literalColor);
    if (!rgb || !colors.length) return null;
    return { rule: 'no-hardcoded-color', suggestedToken: nearestColor(colors, rgb) };
  }
  return null;
}

function spacingScale(contract) {
  return (contract.component?.allowedTokens?.spacing ?? [])
    .map((path) => ({ path, value: resolveToken(contract, path) }))
    .filter((t) => /^\d+(\.\d+)?px$/.test(String(t.value)))
    .map((t) => ({ path: t.path, px: parseFloat(t.value) }));
}

function colorTokens(contract) {
  return (contract.component?.allowedTokens?.color ?? [])
    .map((path) => ({ path, rgb: toRgb(String(resolveToken(contract, path) ?? '')) }))
    .filter((t) => t.rgb);
}

// Closest by px; on a tie, the larger step.
function nearestSpacing(scale, px) {
  return scale.reduce((best, s) => {
    const d = Math.abs(s.px - px), bd = Math.abs(best.px - px);
    return d < bd || (d === bd && s.px > best.px) ? s : best;
  }).path;
}

// Closest by Euclidean RGB distance; on a tie, the first listed in the contract.
function nearestColor(tokens, rgb) {
  const dist = (t) => Math.hypot(t.rgb[0] - rgb[0], t.rgb[1] - rgb[1], t.rgb[2] - rgb[2]);
  return tokens.reduce((best, t) => (dist(t) < dist(best) ? t : best)).path;
}

function toRgb(color) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color)?.[1];
  if (hex) {
    if (![3, 4, 6, 8].includes(hex.length)) return null;
    const full = hex.length <= 4 ? [...hex.slice(0, 3)].map((c) => c + c).join('') : hex.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/i.exec(color);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (fn[1].toLowerCase().startsWith('rgb')) {
    return parts.slice(0, 3).map((p) => (p.endsWith('%') ? Math.round(parseFloat(p) * 2.55) : Number(p)));
  }
  return hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100);
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

function position(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, column: index - before.lastIndexOf('\n') };
}

const toPosix = (p) => p.split(sep).join('/');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (['.css', '.tsx', '.jsx'].includes(extname(entry.name))) out.push(path);
  }
  return out;
}

// --- CLI

function parseArgs(argv) {
  const opts = { srcDir: 'src', contract: 'data/contract.json', out: 'lint-report.json' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--contract') opts.contract = argv[++i];
    else if (argv[i] === '--out') opts.out = argv[++i];
    else opts.srcDir = argv[i];
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const contract = JSON.parse(await readFile(opts.contract, 'utf8'));
  const report = await lintContract({ srcDir: opts.srcDir, contract });
  await writeFile(opts.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.deviations.length} deviation${report.deviations.length === 1 ? '' : 's'} in ${opts.srcDir}. Wrote ${opts.out}.`);
}
