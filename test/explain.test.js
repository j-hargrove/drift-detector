import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flagRule, flagTitle } from '../src/core/explain.js';

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
