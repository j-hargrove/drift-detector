// Review session: deviations + dials + decision log. Pure functions; every
// operation returns a new session and never mutates the one passed in.
// Dials come from policy.json, never from the contract. Amend only proposes
// contract changes; it cannot alter dials.
//
// Auto-fix has two limits. A deviation with no agent reason is never absorbed:
// nobody has explained it, so a person decides. And deviations absorbed because
// someone turned a dial to Auto-fix during the session (rather than by the loaded
// policy) go back to review if that dial is turned back to Ask or Block.

import { proposeChanges, resolveToken } from './proposals.js';

export const DIALS = ['auto-fix', 'ask', 'block'];

// A rule with no configured dial is reviewed, never silently absorbed.
const FALLBACK_DIAL = 'ask';

const isoNow = () => new Date().toISOString();

export function createSession({ contract, report, reasons = {}, policy = {}, now = isoNow }) {
  validateInputs(contract, policy);
  const dials = policy.dials ?? {};
  const deviations = report.deviations.map((d) => ({
    ...d,
    alsoAllowTokens: d.alsoAllowTokens ?? [],
    agentReason: normalizeReason(reasons[d.id]),
  }));
  assertTokensExist(contract, deviations);
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
    dialAbsorbed: [], // ids absorbed because a dial was changed in this session, not by the policy
  };
  return absorbUndecided(session, now).session;
}

// Only undecided deviations are re-evaluated; Reject and Amend decisions stand.
// Moving a dial off Auto-fix returns what this session's dial change absorbed;
// what the loaded policy absorbed stays absorbed.
export function setDial(session, rule, dial, now = isoNow) {
  assertDial(dial);
  if (!session.rules.includes(rule)) throw new Error(`Unknown rule: ${rule}`);
  const next = { ...session, dials: { ...session.dials, [rule]: dial } };
  if (dial !== 'auto-fix') return returnToReview(next, rule);
  const { session: absorbed, ids } = absorbUndecided(next, now);
  return { ...absorbed, dialAbsorbed: [...session.dialAbsorbed, ...ids] };
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

// Reject and Amend are decisions, not outcomes: someone still has to fix the code
// or update the contract. Resolution tracks that follow-through.
export function resolve(session, id, { note = '', now = isoNow } = {}) {
  const entry = findResolvable(session, id);
  if (entry.resolution.status === 'resolved') throw new Error(`${id} is already resolved.`);
  return withResolution(session, id, { status: 'resolved', at: now(), note: note.trim() || null });
}

export function reopen(session, id) {
  const entry = findResolvable(session, id);
  if (entry.resolution.status === 'pending') throw new Error(`${id} is not resolved.`);
  return withResolution(session, id, pendingResolution());
}

export function amendNeedsNote(deviation) {
  return deviation.agentReason === null;
}

// Auto-fix applies only to deviations the agent explained.
export function canAutoFix(session, deviation) {
  return session.dials[deviation.rule] === 'auto-fix' && deviation.agentReason !== null;
}

// Under Auto-fix, but held for a person because the agent gave no reason.
export function heldForReview(session, deviation) {
  return session.dials[deviation.rule] === 'auto-fix' && deviation.agentReason === null;
}

export function isDecided(session, id) {
  return session.log.some((e) => e.id === id);
}

// Deviations waiting on a human, blocked ones first.
export function reviewQueue(session) {
  const rank = { block: 0, ask: 1, 'auto-fix': 2 };
  return session.deviations
    .filter((d) => !isDecided(session, d.id) && !canAutoFix(session, d))
    .sort((a, b) => rank[session.dials[a.rule]] - rank[session.dials[b.rule]]);
}

// Decisions whose code fix or contract change hasn't happened yet.
export function followUps(session) {
  return session.log.filter((e) => e.resolution?.status === 'pending');
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
  if (canAutoFix(session, deviation)) {
    throw new Error(`${id} is under auto-fix and is not up for review.`);
  }
  return { ...session, log: [...session.log, logEntry(session, deviation, decision, note, now)] };
}

const pendingResolution = () => ({ status: 'pending', at: null, note: null });

function findResolvable(session, id) {
  const entry = session.log.find((e) => e.id === id);
  if (!entry) throw new Error(`${id} has no decision to resolve.`);
  if (!entry.resolution) throw new Error(`${id} was auto-absorbed; there is nothing to resolve.`);
  return entry;
}

function withResolution(session, id, resolution) {
  return { ...session, log: session.log.map((e) => (e.id === id ? { ...e, resolution } : e)) };
}

function absorbUndecided(session, now) {
  const absorbed = session.deviations
    .filter((d) => !isDecided(session, d.id) && canAutoFix(session, d))
    .map((d) => logEntry(session, d, 'auto-absorbed', '', now));
  return {
    session: absorbed.length ? { ...session, log: [...session.log, ...absorbed] } : session,
    ids: absorbed.map((e) => e.id),
  };
}

// Auto-absorbed entries carry no Reject/Amend, so returning them only removes the absorption.
function returnToReview(session, rule) {
  const back = new Set(
    session.log
      .filter((e) => e.rule === rule && e.decision === 'auto-absorbed' && session.dialAbsorbed.includes(e.id))
      .map((e) => e.id),
  );
  if (!back.size) return session;
  return {
    ...session,
    log: session.log.filter((e) => !back.has(e.id)),
    dialAbsorbed: session.dialAbsorbed.filter((id) => !back.has(id)),
  };
}

function logEntry(session, d, decision, note, now) {
  const amended = decision === 'amended';
  const entry = {
    id: d.id,
    rule: d.rule,
    file: d.file,
    line: d.line,
    snippet: d.snippet,
    agentReason: d.agentReason,
    dialSetting: session.dials[d.rule],
    decision,
    suggestedFix: amended ? null : d.suggestedToken,
    proposedChange: amended ? proposeChanges(d, session.contract) : null,
    note: note.trim() || null,
    timestamp: now(),
  };
  // Auto-absorbed entries were applied by the agent; there is no follow-up to track.
  return decision === 'auto-absorbed' ? entry : { ...entry, resolution: pendingResolution() };
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

// alsoAllowTokens must name tokens the contract defines, or Amend would propose nonsense.
function assertTokensExist(contract, deviations) {
  for (const d of deviations) {
    if (!Array.isArray(d.alsoAllowTokens)) throw new Error(`${d.id}: "alsoAllowTokens" must be a list of token paths.`);
    const missing = d.alsoAllowTokens.find((path) => resolveToken(contract, path) === null);
    if (missing) {
      throw new Error(`The lint report asks to also allow "${missing}" for ${d.id}, but the contract has no such token.`);
    }
  }
}

function assertDial(dial) {
  if (!DIALS.includes(dial)) throw new Error(`Unknown dial setting: ${dial}`);
}

function normalizeReason(reason) {
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}
