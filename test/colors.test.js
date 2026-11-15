import { describe, expect, it } from 'vitest';
import { distance, findColor, parseColor, sameColor } from '../src/core/colors.js';
import { proposeChange, proposeChanges } from '../src/core/proposals.js';
import { readFileSync } from 'node:fs';

const contract = JSON.parse(readFileSync(new URL('../data/contract.json', import.meta.url)));

describe('findColor', () => {
  it('reads hex in every length', () => {
    expect(findColor('color: #3b82f6;')).toMatchObject({ text: '#3b82f6', label: '#3B82F6', rgb: [59, 130, 246], alpha: 1, css: '#3B82F6' });
    expect(findColor('color: #fff;')).toMatchObject({ rgb: [255, 255, 255], alpha: 1 });
    expect(findColor('color: #2563EB80;')).toMatchObject({ rgb: [37, 99, 235], alpha: 0.502 });
  });

  it('reads rgb() and rgba(), comma and space syntax, alpha as a number or a percentage', () => {
    expect(findColor('background: rgba(37, 99, 235, 0.08);')).toMatchObject({
      text: 'rgba(37, 99, 235, 0.08)', label: 'rgba(37,99,235,0.08)', rgb: [37, 99, 235], alpha: 0.08, css: 'rgba(37, 99, 235, 0.08)',
    });
    expect(findColor('fill: rgb(30, 64, 175);')).toMatchObject({ label: 'rgb(30,64,175)', alpha: 1, css: 'rgb(30, 64, 175)' });
    expect(findColor('color: rgb(37 99 235 / 50%)')).toMatchObject({ label: 'rgba(37,99,235,0.5)', alpha: 0.5 });
    expect(findColor('color: RGBA(37,99,235,.08)')).toMatchObject({ rgb: [37, 99, 235], alpha: 0.08 });
    expect(findColor("style={{ background: 'rgba(0,0,0,0.5)' }}")).toMatchObject({ rgb: [0, 0, 0], alpha: 0.5 });
  });

  it('takes whichever color comes first in the line', () => {
    expect(findColor('border: 1px solid rgb(1, 2, 3); color: #fff').label).toBe('rgb(1,2,3)');
    expect(findColor('color: #fff; border: 1px solid rgb(1, 2, 3)').label).toBe('#FFF');
  });

  it('rejects out-of-range channels and alpha, and things that are not colors', () => {
    expect(findColor('rgb(256, 0, 0)')).toBeNull();
    expect(findColor('rgba(0, 0, 0, 1.5)')).toBeNull();
    expect(findColor('padding: 10px;')).toBeNull();
    expect(findColor('var(--brand)')).toBeNull();
  });
});

describe('parseColor, sameColor, distance', () => {
  it('parses only a whole value', () => {
    expect(parseColor('#2563EB')).toMatchObject({ rgb: [37, 99, 235] });
    expect(parseColor('red;background:url(x) #2563EB')).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });
  it('same color only when both are opaque', () => {
    expect(sameColor(findColor('rgb(255,255,255)'), parseColor('#FFFFFF'))).toBe(true);
    expect(sameColor(findColor('rgba(255,255,255,0.5)'), parseColor('#FFFFFF'))).toBe(false);
  });
  it('distance ignores alpha', () => {
    expect(distance(findColor('rgba(37,99,235,0.08)'), parseColor('#2563EB'))).toBe(0);
  });
});

describe('Amend for rgb() colors', () => {
  const d = { rule: 'no-hardcoded-color', snippet: 'background: rgba(37, 99, 235, 0.08);', suggestedToken: 'color.primary' };
  it('adds the color as written to the allowed colors', () => {
    expect(proposeChange(d, 'Button')).toBe('add rgba(37, 99, 235, 0.08) to Button.allowedTokens.color');
    expect(proposeChanges(d, contract)).toEqual(['add rgba(37, 99, 235, 0.08) to Button.allowedTokens.color']);
  });
  it('still uppercases hex', () => {
    expect(proposeChange({ ...d, snippet: 'color: #3b82f6;' }, 'Button')).toBe('add #3B82F6 to Button.allowedTokens.color');
  });
});
