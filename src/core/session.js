// Review session: deviations + dials + decision log. Pure functions; every
// operation returns a new session and never mutates the one passed in.
// Dials come from policy.json, never from the contract. Amend only proposes
// contract changes; it cannot alter dials.

import { proposeChange } from './proposals.js';

export const DIALS = ['auto-fix', 'ask', 'block'];

// A rule with no configured dial is reviewed, never silently absorbed.
const FALLBACK_DIAL = 'ask';

const isoNow = () => new Date().toISOString();

export function createSession({ contract, report, reasons = {}, policy = {}, now = isoNow }) {
  validateInputs(contract, policy);
  const dials = policy.dials ?? {};
  const deviations = report.deviations.map((d) => ({ ...d, agentReason: normalizeReason(reasons[d.id]) }));
  const rules = [...new Set(deviations.map((d) => d.rule))];
  const resolvedDials = Object.fromEntries(rules.map((r) => [r, dials[r] ?? FALLBACK_DIAL]));
  rules.forEach((r) => assertDial(resolvedDials[r]));

  const session = {
    contract,
    componentName: contract.component?.name ?? 'Component',
    deviations,
    rules,
    dials: resolvedDials,
    log: [],
  };
  return absorbUndecided(session, now);
}

// Only undecided deviations are re-evaluated; logged decisions stand.
export function setDial(session, rule, dial, now = isoNow) {
  assertDial(dial);
  if (!session.rules.includes(rule)) throw new Error(`Unknown rule: ${rule}`);
  return absorbUndecided({ ...session, dials: { ...session.dials, [rule]: dial } }, now);
}

export function reject(session, id, { note = '', now = isoNow } = {}) {
  return decide(session, id, 'rejected', note, now);
}

export function amend(session, id, { note = '', now = isoNow } = {}) {
  const deviation = findUndecided(session, id);
  if (amendNeedsNote(deviation) && !note.trim()) {
    throw new Error('Amending a deviation with no agent reason requires a note.');
  }
  return decide(session, id, 'amended', note, now);
}

export function amendNeedsNote(deviation) {
  return deviation.agentReason === null;
}

export function isDecided(session, id) {
  return session.log.some((e) => e.id === id);
}

// Deviations waiting on a human, blocked ones first.
export function reviewQueue(session) {
  const rank = { block: 0, ask: 1 };
  return session.deviations
    .filter((d) => !isDecided(session, d.id) && session.dials[d.rule] !== 'auto-fix')
    .sort((a, b) => rank[session.dials[a.rule]] - rank[session.dials[b.rule]]);
}

export function autoAbsorbed(session) {
  return session.log.filter((e) => e.decision === 'auto-absorbed');
}

export function buildStatus(session) {
  const blocked = reviewQueue(session).filter((d) => session.dials[d.rule] === 'block').length;
  return { blocked: blocked > 0, blockedCount: blocked };
}

export function exportLog(session, now = isoNow) {
  return {
    exportedAt: now(),
    contract: `${session.contract.name ?? 'contract'}@${session.contract.version ?? 'unversioned'}`,
    dials: session.dials,
    entries: session.log,
  };
}

function decide(session, id, decision, note, now) {
  const deviation = findUndecided(session, id);
  if (session.dials[deviation.rule] === 'auto-fix') {
    throw new Error(`${id} is under auto-fix and is not up for review.`);
  }
  return { ...session, log: [...session.log, logEntry(session, deviation, decision, note, now)] };
}

function absorbUndecided(session, now) {
  const absorbed = session.deviations
    .filter((d) => !isDecided(session, d.id) && session.dials[d.rule] === 'auto-fix')
    .map((d) => logEntry(session, d, 'auto-absorbed', '', now));
  return absorbed.length ? { ...session, log: [...session.log, ...absorbed] } : session;
}

function logEntry(session, d, decision, note, now) {
  const amended = decision === 'amended';
  return {
    id: d.id,
    rule: d.rule,
    file: d.file,
    line: d.line,
    snippet: d.snippet,
    agentReason: d.agentReason,
    dialSetting: session.dials[d.rule],
    decision,
    suggestedFix: amended ? null : d.suggestedToken,
    proposedChange: amended ? proposeChange(d, session.componentName) : null,
    note: note.trim() || null,
    timestamp: now(),
  };
}

function findUndecided(session, id) {
  const deviation = session.deviations.find((d) => d.id === id);
  if (!deviation) throw new Error(`Unknown deviation: ${id}`);
  if (isDecided(session, id)) throw new Error(`${id} already has a decision.`);
  return deviation;
}

function validateInputs(contract, policy) {
  if ('dials' in contract) {
    throw new Error('The contract must not contain dial settings. They belong in policy.json.');
  }
  const { dials = {} } = policy;
  if (typeof dials !== 'object' || dials === null || Array.isArray(dials)) {
    throw new Error('policy.dials must be an object of rule → dial setting.');
  }
  Object.values(dials).forEach(assertDial);
}

function assertDial(dial) {
  if (!DIALS.includes(dial)) throw new Error(`Unknown dial setting: ${dial}`);
}

function normalizeReason(reason) {
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}
