import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkFile, checks, parseJson, sizeProblem } from '../src/core/validate.js';

const raw = (name) => readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8');
const SEED = { contract: 'contract', policy: 'policy', report: 'lint-report', reasons: 'reasons' };

describe('seed files', () => {
  it.each(Object.entries(SEED))('%s passes', (kind, file) => {
    const { value, problems } = checkFile(kind, raw(file));
    expect(problems).toEqual([]);
    expect(value).toBeDefined();
  });
});

describe('parseJson', () => {
  it('points at the line and column of a syntax error', () => {
    const { problems } = parseJson('{\n  "a": 1\n  "b": 2\n}');
    expect(problems[0]).toMatch(/^This isn't valid JSON\. The problem is near line 3, column 3\./);
  });

  it('calls out an empty file', () => {
    expect(parseJson('  ').problems).toEqual(['This file is empty.']);
  });
});

describe('contract', () => {
  it('rejects dial settings with a pointer to the policy file', () => {
    const c = JSON.parse(raw('contract'));
    expect(checks.contract({ ...c, dials: {} })[0]).toMatch(/Dials belong in the policy file/);
  });

  it('names each missing section', () => {
    expect(checks.contract({})).toEqual([
      'The contract has no "tokens" section.',
      'The contract has no "component" section describing the component, for example the Button.',
    ]);
    expect(checks.contract({ tokens: {}, component: { variants: 'primary' } })).toHaveLength(3);
  });

  it('rejects a non-object', () => {
    expect(checks.contract([])).toEqual(['The contract should be a JSON object, starting with {.']);
  });
});

describe('policy', () => {
  it('names the rule and the bad value', () => {
    expect(checks.policy({ dials: { 'no-hardcoded-color': 'sometimes' } })).toEqual([
      'Rule "no-hardcoded-color" is set to "sometimes". Use "auto-fix", "ask" or "block".',
    ]);
  });

  it('requires a dials section', () => {
    expect(checks.policy({})[0]).toMatch(/needs a "dials" section/);
  });
});

describe('lint report', () => {
  it('names each deviation by id, or by position when it has none', () => {
    const problems = checks.report({
      deviations: [
        { id: 'dev-1', rule: 'r', file: 'f', line: 0, snippet: 's', suggestedToken: 't' },
        { rule: 'r', line: 2 },
      ],
    });
    expect(problems).toEqual([
      'Deviation "dev-1" needs a "line" that is a whole number, 1 or more.',
      'Deviation 2 is missing "id", "file", "snippet" and "suggestedToken".',
    ]);
  });

  it('catches duplicate ids', () => {
    const d = { id: 'x', rule: 'r', file: 'f', line: 1, snippet: 's', suggestedToken: 't' };
    expect(checks.report({ deviations: [d, d] })).toEqual([
      'The id "x" is used more than once. Each deviation needs its own id.',
    ]);
  });

  it('accepts an empty report', () => {
    expect(checks.report({ deviations: [] })).toEqual([]);
  });

  it('caps a long list of problems', () => {
    const { problems } = checkFile('report', JSON.stringify({ deviations: Array(12).fill({}) }));
    expect(problems).toHaveLength(9);
    expect(problems.at(-1)).toBe('…and 16 more.'); // two problems per empty deviation
  });
});

describe('reasons', () => {
  it('allows null but not other non-text values', () => {
    expect(checks.reasons({ a: 'ok', b: null, c: 3 })).toEqual(['The reason for "c" should be text.']);
  });
});

describe('checkFile', () => {
  it('withholds the value when there are problems', () => {
    expect(checkFile('policy', '{"dials": {"x": "never"}}').value).toBeUndefined();
  });

  it('reports oversize files', () => {
    expect(sizeProblem(500)).toBeNull();
    expect(sizeProblem(2_500_000)).toBe('This file is 2.5 MB. The limit is 1 MB.');
  });
});
