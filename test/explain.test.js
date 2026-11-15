import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flagRule, flagTitle, sameValueAsToken, shortPath } from '../src/core/explain.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const contract = load('contract');
const seed = Object.fromEntries(load('lint-report').deviations.map((d) => [d.id, d]));
const dev = (over) => ({ id: 'x', file: 'a.tsx', line: 1, ...over });

describe('flagTitle', () => {
  it('names a near-miss color and its token, using the property', () => {
    expect(flagTitle(seed['dev-001'], contract)).toBe('Fill #3B82F6 is a shade off color.primary (#2563EB)');
    expect(flagTitle(seed['dev-002'], contract)).toBe('Text color #1F2937 is a shade off color.text (#111827)');
  });

  it('says when a color is a contract token the component may not use', () => {
    const d = dev({ rule: 'no-hardcoded-color', snippet: 'color: #dc2626;', suggestedToken: 'color.text' });
    expect(flagTitle(d, contract)).toBe('Text color #DC2626 is color.danger, which Button doesn’t use');
  });

  it('names the fix when a color is far from its token', () => {
    const d = dev({ rule: 'no-hardcoded-color', snippet: 'background: #FF00FF;', suggestedToken: 'color.primary' });
    expect(flagTitle(d, contract)).toBe('Fill #FF00FF isn’t a Button color; the fix is color.primary (#2563EB)');
  });

  it('places spacing between, below or above the allowed scale', () => {
    expect(flagTitle(seed['dev-003'], contract)).toBe('Padding 10px falls between spacing.2 (8px) and spacing.3 (12px)');
    expect(flagTitle(seed['dev-004'], contract)).toBe('Gap 6px is below the smallest Button spacing, spacing.2 (8px)');
    const d = dev({ rule: 'no-arbitrary-spacing', snippet: 'margin: 20px;', suggestedToken: 'spacing.4' });
    expect(flagTitle(d, contract)).toBe('Margin 20px is above the largest Button spacing, spacing.4 (16px)');
  });

  it('skips on-scale values in shorthand', () => {
    const d = dev({ rule: 'no-arbitrary-spacing', snippet: 'padding: 8px 10px;', suggestedToken: 'spacing.3' });
    expect(flagTitle(d, contract)).toMatch(/^Padding 10px/);
  });

  it('names an off-contract variant', () => {
    expect(flagTitle(seed['dev-005'], contract)).toBe('Button has no “destructive” variant');
  });

  it('falls back for unknown rules and unparseable snippets', () => {
    expect(flagTitle(dev({ rule: 'no-z-index', snippet: 'z-index: 99;' }), contract)).toBe('This line breaks the rule no-z-index');
    expect(flagTitle(dev({ rule: 'no-hardcoded-color', snippet: 'color: red;' }), contract)).toBe(
      'This line breaks the rule no-hardcoded-color',
    );
  });
});

describe('a hard-coded value equal to its suggested token', () => {
  const white = dev({ rule: 'no-hardcoded-color', snippet: 'color: #FFFFFF;', suggestedToken: 'color.surface' });

  it('is titled "Hard-coded … instead of … (same value)", not "a shade off"', () => {
    expect(flagTitle(white, contract)).toBe('Hard-coded #FFFFFF instead of color.surface (same value)');
  });

  it('matches regardless of case and 3-digit shorthand', () => {
    for (const snippet of ['color: #ffffff;', 'color: #fff;', "style={{ color: '#FfF' }}"]) {
      const d = { ...white, snippet };
      expect(flagTitle(d, contract)).toBe(`Hard-coded ${snippet.match(/#[0-9a-f]+/i)[0].toUpperCase()} instead of color.surface (same value)`);
      expect(sameValueAsToken(d, contract)).toEqual({ token: 'color.surface', value: '#FFFFFF' });
    }
  });

  it('gives Reject the token and the unchanged value', () => {
    expect(sameValueAsToken(white, contract)).toEqual({ token: 'color.surface', value: '#FFFFFF' });
  });

  it('is null for a near miss, a different token, a non-hex value or another rule', () => {
    expect(sameValueAsToken(seed['dev-001'], contract)).toBeNull(); // #3B82F6 vs #2563EB
    expect(sameValueAsToken({ ...white, suggestedToken: 'color.text' }, contract)).toBeNull();
    expect(sameValueAsToken({ ...white, snippet: 'background: rgba(255, 255, 255, 1);' }, contract)).toBeNull();
    expect(sameValueAsToken({ ...white, suggestedToken: 'color.nope' }, contract)).toBeNull();
    expect(sameValueAsToken(seed['dev-003'], contract)).toBeNull();
  });

  it('leaves near-miss titles as they were', () => {
    expect(flagTitle(seed['dev-001'], contract)).toBe('Fill #3B82F6 is a shade off color.primary (#2563EB)');
  });

  it('covers the stress set’s dev-006', () => {
    const stress = JSON.parse(readFileSync(new URL('../data/stress/contract.json', import.meta.url)));
    const report = JSON.parse(readFileSync(new URL('../data/stress/lint-report.json', import.meta.url)));
    const d = report.deviations.find((x) => x.id === 'dev-006');
    expect(flagTitle(d, stress)).toBe('Hard-coded #FFFFFF instead of color.surface (same value)');
  });
});

describe('shortPath', () => {
  it('shortens a long path in the middle, and a long file name in its middle', () => {
    expect(shortPath('src/features/billing/components/UpgradePlanBannerWithAnnualDiscountCallout.tsx')).toBe('src/features/…/UpgradePlanBanner…Callout.tsx');
  });
  it('leaves short paths alone', () => {
    for (const p of ['src/pages/Settings.tsx', 'src/components/IconButton.tsx', 'a.tsx']) expect(shortPath(p)).toBe(p);
  });
  it('keeps a long file name in a shallow folder', () => {
    expect(shortPath('src/AVeryLongComponentNameThatGoesOnAndOnForever.tsx')).toBe('src/AVeryLongComponen…Forever.tsx'); // 17 + … + 7 characters of the stem
  });
});

describe('flagRule', () => {
  it('explains each seeded rule from the contract', () => {
    expect(flagRule(seed['dev-001'], contract)).toMatch(/^Button may only use the 5 color tokens/);
    expect(flagRule(seed['dev-003'], contract)).toBe(
      'Button spacing must come from the scale: spacing.2 (8px), spacing.3 (12px) and spacing.4 (16px). Values in between make components drift apart.',
    );
    expect(flagRule(seed['dev-005'], contract)).toMatch(/^Button comes in primary, secondary and ghost\./);
  });

  it('falls back for unknown rules', () => {
    expect(flagRule(dev({ rule: 'no-z-index', snippet: '' }), contract)).toMatch(/no-z-index flagged this line/);
  });
});
