import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { DATASETS, datasetFromSearch, loadDataset } from '../src/core/datasets.js';

const root = new URL('../', import.meta.url);
const fromDisk = (path) => readFile(new URL(path, root), 'utf8');
// A fake fetch over in-memory files; anything missing fails like a 404.
const fakeFetch = (files) => async (path) => {
  if (!(path in files)) throw new Error('Could not load it (404)');
  return files[path];
};
const demoFiles = async () => ({
  'data/contract.json': await fromDisk('data/contract.json'),
  'data/policy.json': await fromDisk('data/policy.json'),
  'data/lint-report.json': await fromDisk('data/lint-report.json'),
  'data/reasons.json': await fromDisk('data/reasons.json'),
});
// The demo's files moved under data/stress/, with overrides.
const stressFiles = async (overrides = {}) => {
  const demo = await demoFiles();
  const moved = Object.fromEntries(Object.entries(demo).map(([p, t]) => [p.replace('data/', 'data/stress/'), t]));
  return { ...moved, ...overrides };
};

describe('datasetFromSearch', () => {
  it('?data=stress picks the stress set', () => {
    expect(datasetFromSearch('?data=stress')).toBe('stress');
    expect(datasetFromSearch('?foo=1&data=stress')).toBe('stress');
  });
  it('no param, an unknown value, or a prototype key is the demo', () => {
    for (const search of ['', '?', '?data=', '?data=STRESS', '?data=nope', '?data=toString', '?data=__proto__', '?data=constructor']) {
      expect(datasetFromSearch(search)).toBe('demo');
    }
  });
  it('the stress set lives in data/stress and is labelled for the source line', () => {
    expect(DATASETS.stress).toEqual({ dir: 'data/stress', label: 'stress test data' });
    expect(DATASETS.demo).toEqual({ dir: 'data', label: 'demo data' });
  });
});

describe('loadDataset', () => {
  it('loads the demo from data/', async () => {
    const inputs = await loadDataset('demo', fakeFetch(await demoFiles()));
    expect(Object.keys(inputs).sort()).toEqual(['contract', 'policy', 'reasons', 'report']);
    expect(inputs.report.deviations).toHaveLength(5);
  });

  it('loads the stress set from data/stress/, not data/', async () => {
    const seen = [];
    const files = await stressFiles();
    const inputs = await loadDataset('stress', async (p) => (seen.push(p), fakeFetch(files)(p)));
    expect(seen.sort()).toEqual(['data/stress/contract.json', 'data/stress/lint-report.json', 'data/stress/policy.json', 'data/stress/reasons.json']);
    expect(inputs.contract).toBeTruthy();
  });

  it('runs every file through validate.js and names each problem by path', async () => {
    const files = await stressFiles({
      'data/stress/policy.json': '{"dials": {"no-hardcoded-color": "sometimes"}}',
      'data/stress/reasons.json': '{ nope',
    });
    const err = await loadDataset('stress', fakeFetch(files)).catch((e) => e);
    expect(err.message).toBe('The stress test data didn’t pass its checks');
    expect(err.problems.some((p) => p.startsWith('data/stress/policy.json: '))).toBe(true);
    expect(err.problems.some((p) => p.startsWith('data/stress/reasons.json: ') && /valid JSON/.test(p))).toBe(true);
  });

  it('checks the report against the set’s own contract', async () => {
    const report = JSON.parse(await fromDisk('data/lint-report.json'));
    report.deviations[0].alsoAllowTokens = ['color.not-in-contract'];
    const err = await loadDataset('stress', fakeFetch(await stressFiles({ 'data/stress/lint-report.json': JSON.stringify(report) }))).catch((e) => e);
    expect(err.problems.join('\n')).toMatch(/data\/stress\/lint-report\.json: .*color\.not-in-contract/);
  });

  it('reports a missing file instead of half-loading', async () => {
    const files = await stressFiles();
    delete files['data/stress/reasons.json'];
    const err = await loadDataset('stress', fakeFetch(files)).catch((e) => e);
    expect(err.problems).toEqual(['data/stress/reasons.json: Could not load it (404)']);
  });
});
