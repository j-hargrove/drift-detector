import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { preview, SPACING_SCALE } from '../src/core/preview.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const contract = load('contract');
const dev = Object.fromEntries(load('lint-report').deviations.map((d) => [d.id, d]));

describe('variant preview', () => {
  const p = preview(dev['dev-005'], contract);

  it('draws the three outcomes with the snippet’s label', () => {
    expect(p.kind).toBe('variant');
    expect(p.panels.map((x) => x.label)).toEqual(['Agent built', 'If you Reject', 'If you Amend']);
    expect(p.panels.every((x) => x.button.text === 'Delete account')).toBe(true);
  });

  it('keeps the Agent built caption short (the snippet already shows the variant)', () => {
    expect(p.panels[0].caption).toBe('No contract style yet');
  });

  it('uses color.danger only once Amend allows it', () => {
    const [built, rejected, amended] = p.panels.map((x) => x.button);
    expect(amended.bg).toBe('#DC2626');
    expect(built.bg).toBe('#2563EB'); // unknown variant falls back to the default (primary)
    expect(rejected).toMatchObject({ bg: '#FFFFFF', fg: '#111827', border: '#E5E7EB' }); // secondary
  });

  it('takes padding and radius from contract tokens', () => {
    expect(p.panels[0].button).toMatchObject({ padding: '12px', paddingInline: '16px', radius: '8px' });
  });

  it('without alsoAllowTokens, Amend draws the default variant', () => {
    const { alsoAllowTokens, ...d } = dev['dev-005'];
    expect(preview(d, contract).panels[2].button.bg).toBe('#2563EB');
  });
});

describe('color preview', () => {
  it('shows the agent’s hex beside the token’s', () => {
    const p = preview(dev['dev-001'], contract);
    expect(p.kind).toBe('color');
    expect(p.panels.map((x) => x.swatch)).toEqual([
      { value: '#3B82F6', css: '#3B82F6', name: null },
      { value: '#2563EB', css: '#2563EB', name: 'color.primary' },
    ]);
  });

  it('draws an rgba() as written, its fill rebuilt from the parsed numbers', () => {
    const d = { ...dev['dev-001'], snippet: 'background: rgba(37,99,235,.08);' };
    expect(preview(d, contract).panels[0].swatch).toEqual({ value: 'rgba(37,99,235,0.08)', css: 'rgba(37, 99, 235, 0.08)', name: null });
  });

  it('nothing from an rgb() snippet reaches the style attribute unparsed', () => {
    for (const snippet of ['background: rgb(1, 2, 3) url(x);', 'background: rgba(1,2,3,0.5);x:expression(1)']) {
      const css = preview({ ...dev['dev-001'], snippet }, contract).panels[0].swatch.css;
      expect(css).toMatch(/^rgba?\(\d{1,3}, \d{1,3}, \d{1,3}(, [\d.]+)?\)$/);
    }
  });
});

describe('spacing preview', () => {
  it('measures agent px against token px, for padding and gap', () => {
    const pad = preview(dev['dev-003'], contract);
    expect(pad).toMatchObject({ kind: 'spacing', property: 'padding', scale: SPACING_SCALE });
    expect(pad.panels.map((x) => [x.px, x.token])).toEqual([[10, null], [12, 'spacing.3']]);
    expect(preview(dev['dev-004'], contract).property).toBe('gap');
  });
});

describe('safety and fallbacks', () => {
  it('keeps non-hex, non-px token values out of the drawing', () => {
    const evil = structuredClone(contract);
    evil.tokens.color.primary = 'red;background:url(https://x)';
    evil.tokens.radius.md = 'calc(1px)';
    const b = preview(dev['dev-005'], evil).panels[0].button;
    expect(b.bg).toBe('transparent');
    expect(b.radius).toBe('8px');
    expect(preview(dev['dev-001'], evil)).toBeNull(); // no token hex to compare against
  });

  it('returns null for rules it cannot draw', () => {
    expect(preview({ rule: 'other', snippet: 'x', suggestedToken: 'y' }, contract)).toBeNull();
  });
});
