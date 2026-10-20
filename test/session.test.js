import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  amend,
  autoAbsorbed,
  buildStatus,
  createSession,
  exportLog,
  reject,
  reviewQueue,
  setDial,
} from '../src/core/session.js';
import { proposeChange, resolveToken } from '../src/core/proposals.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const seed = () => ({
  contract: load('contract'),
  report: load('lint-report'),
  reasons: load('reasons'),
  policy: load('policy'),
});
const clock = () => '2026-10-19T12:00:00.000Z';
const start = () => createSession({ ...seed(), now: clock });

describe('seed scenario', () => {
  it('uses one dial of each kind', () => {
    expect(start().dials).toEqual({
      'no-hardcoded-color': 'ask',
      'no-arbitrary-spacing': 'auto-fix',
      'no-off-contract-variant': 'block',
    });
  });

  it('absorbs auto-fix deviations on load, keeping the agent reason', () => {
    const { log } = start();
    expect(log.map((e) => e.id)).toEqual(['dev-003', 'dev-004']);
    expect(log[0]).toMatchObject({
      decision: 'auto-absorbed',
      dialSetting: 'auto-fix',
      suggestedFix: 'spacing.3',
      proposedChange: null,
    });
    expect(log[0].agentReason).toMatch(/Icon-only/);
  });

  it('queues ask and block deviations, blocked first', () => {
    expect(reviewQueue(start()).map((d) => d.id)).toEqual(['dev-005', 'dev-001', 'dev-002']);
  });

  it('flags the missing reason as null', () => {
    const d = start().deviations.find((x) => x.id === 'dev-002');
    expect(d.agentReason).toBeNull();
  });
});

describe('decisions', () => {
  it('reject logs the suggested fix', () => {
    const s = reject(start(), 'dev-002', { note: 'Use the token.', now: clock });
    expect(s.log.at(-1)).toMatchObject({
      id: 'dev-002',
      decision: 'rejected',
      dialSetting: 'ask',
      suggestedFix: 'color.text',
      proposedChange: null,
      agentReason: null,
      note: 'Use the token.',
      timestamp: clock(),
    });
  });

  it('amend logs the proposed contract change', () => {
    const s = amend(start(), 'dev-001', { now: clock });
    expect(s.log.at(-1)).toMatchObject({
      decision: 'amended',
      proposedChange: 'add #3B82F6 to Button.allowedTokens.color',
      suggestedFix: null,
      note: null,
    });
  });

  it('amending without an agent reason requires a note', () => {
    expect(() => amend(start(), 'dev-002', { note: '   ' })).toThrow(/requires a note/);
    const s = amend(start(), 'dev-002', { note: 'Approved by design for dark text.', now: clock });
    expect(s.log.at(-1).note).toBe('Approved by design for dark text.');
  });

  it('refuses to decide twice', () => {
    const s = reject(start(), 'dev-001');
    expect(() => amend(s, 'dev-001')).toThrow(/already has a decision/);
  });

  it('does not mutate the previous session', () => {
    const before = start();
    reject(before, 'dev-001');
    expect(before.log).toHaveLength(2);
  });
});

describe('build status', () => {
  it('stays blocked until every blocked deviation is resolved', () => {
    let s = start();
    expect(buildStatus(s)).toEqual({ blocked: true, blockedCount: 1 });
    s = reject(s, 'dev-001');
    expect(buildStatus(s).blocked).toBe(true);
    s = amend(s, 'dev-005');
    expect(buildStatus(s)).toEqual({ blocked: false, blockedCount: 0 });
  });
});

describe('changing dials', () => {
  it('re-evaluates only undecided deviations', () => {
    let s = reject(start(), 'dev-001', { now: clock });
    s = setDial(s, 'no-hardcoded-color', 'auto-fix', clock);
    const color = s.log.filter((e) => e.rule === 'no-hardcoded-color');
    expect(color.map((e) => [e.id, e.decision])).toEqual([
      ['dev-001', 'rejected'],
      ['dev-002', 'auto-absorbed'],
    ]);
  });

  it('leaves auto-absorbed decisions in place when the dial is tightened', () => {
    const s = setDial(start(), 'no-arbitrary-spacing', 'block', clock);
    expect(s.log.map((e) => e.id)).toEqual(['dev-003', 'dev-004']);
    expect(buildStatus(s).blocked).toBe(true); // dev-005 still blocks
    expect(reviewQueue(s).some((d) => d.rule === 'no-arbitrary-spacing')).toBe(false);
  });

  it('unblocks the build when the blocking rule is loosened to ask', () => {
    const s = setDial(start(), 'no-off-contract-variant', 'ask', clock);
    expect(buildStatus(s).blocked).toBe(false);
    expect(reviewQueue(s).map((d) => d.id)).toContain('dev-005');
  });

  it('rejects unknown dial values', () => {
    expect(() => setDial(start(), 'no-hardcoded-color', 'yolo')).toThrow(/Unknown dial/);
  });

  it('falls back to ask for rules with no configured dial', () => {
    const s = createSession({ ...seed(), policy: {}, now: clock });
    expect(Object.values(s.dials)).toEqual(['ask', 'ask', 'ask']);
    expect(s.log).toHaveLength(0);
  });
});

describe('policy and contract stay separate', () => {
  it('the seed contract holds no dial settings', () => {
    expect(seed().contract).not.toHaveProperty('dials');
  });

  it('rejects a contract that carries dial settings', () => {
    const contract = { ...seed().contract, dials: { 'no-hardcoded-color': 'ask' } };
    expect(() => createSession({ ...seed(), contract })).toThrow(/belong in policy.json/);
  });

  it('rejects malformed or unknown policy dials', () => {
    expect(() => createSession({ ...seed(), policy: { dials: ['ask'] } })).toThrow(/must be an object/);
    expect(() => createSession({ ...seed(), policy: { dials: { 'no-hardcoded-color': 'maybe' } } })).toThrow(
      /Unknown dial/,
    );
  });

  it('amend never touches policy', () => {
    const before = start();
    const after = amend(amend(before, 'dev-001'), 'dev-005');
    expect(after.dials).toBe(before.dials);
    after.log
      .filter((e) => e.decision === 'amended')
      .forEach((e) => expect(e.proposedChange).toMatch(/ to Button\./));
  });
});

describe('auto-absorbed visibility', () => {
  it('lists the deviations auto-fix absorbed, including after a dial change', () => {
    let s = start();
    expect(autoAbsorbed(s).map((e) => e.id)).toEqual(['dev-003', 'dev-004']);
    s = setDial(s, 'no-hardcoded-color', 'auto-fix', clock);
    expect(autoAbsorbed(s).map((e) => e.id)).toEqual(['dev-003', 'dev-004', 'dev-001', 'dev-002']);
  });
});

describe('definition of done', () => {
  it('exports a log with all three dial behaviours and both decisions', () => {
    let s = start();
    s = reject(s, 'dev-002', { note: 'No reason, no exception.', now: clock });
    s = amend(s, 'dev-001', { now: clock });
    s = amend(s, 'dev-005', { now: clock });
    const out = exportLog(s, clock);

    expect(out.contract).toBe('Acme UI@1.0.0');
    expect(new Set(out.entries.map((e) => e.dialSetting))).toEqual(new Set(['auto-fix', 'ask', 'block']));
    expect(new Set(out.entries.map((e) => e.decision))).toEqual(new Set(['auto-absorbed', 'rejected', 'amended']));
    expect(out.entries.find((e) => e.id === 'dev-005').proposedChange).toBe('add "destructive" to Button.variants');
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe('proposals', () => {
  it('derives a spacing change from px values', () => {
    expect(proposeChange({ rule: 'no-arbitrary-spacing', snippet: 'padding: 10px 10px 6px;' }, 'Button')).toBe(
      'add 10px, 6px to Button.allowedTokens.spacing',
    );
  });

  it('falls back to a generic allowance', () => {
    expect(proposeChange({ rule: 'something-else', snippet: ' x ' }, 'Button')).toBe('allow `x` under something-else');
  });

  it('resolves token paths to values', () => {
    const { contract } = seed();
    expect(resolveToken(contract, 'color.primary')).toBe('#2563EB');
    expect(resolveToken(contract, 'variant="secondary"')).toBeNull();
  });
});
