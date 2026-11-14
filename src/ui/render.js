// HTML string templates. No DOM access here; app.js decides where they go.

import { DIALS, amendNeedsNote, autoAbsorbed, isDecided } from '../core/session.js';
import { proposeChange, resolveToken } from '../core/proposals.js';
import { flagRule, flagTitle } from '../core/explain.js';

const DIAL_LABEL = { 'auto-fix': 'Auto-fix', ask: 'Ask', block: 'Block' };
const DIAL_HELP = {
  'auto-fix': 'Agent applies the token. You only see it in the log.',
  ask: 'You review each one. Nothing waits on it.',
  block: 'You review each one. The build stays blocked until you do.',
};
const RULE_LABEL = {
  'no-hardcoded-color': 'Hard-coded colour',
  'no-arbitrary-spacing': 'Arbitrary spacing',
  'no-off-contract-variant': 'Off-contract variant',
};
// Short names for inline references, e.g. "Spacing in Button.tsx:12".
const RULE_SHORT = {
  'no-hardcoded-color': 'Colour',
  'no-arbitrary-spacing': 'Spacing',
  'no-off-contract-variant': 'Variant',
};
const DECISION_LABEL = { 'auto-absorbed': 'Auto-absorbed', rejected: 'Rejected', amended: 'Amended' };

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ruleLabel = (rule) => RULE_LABEL[rule] ?? rule;

// While blocked, the badge links to the first blocking card.
export function status({ blocked, blockedCount }, firstBlockedId) {
  return blocked
    ? `<a class="status status--blocked" href="#review-${esc(firstBlockedId)}" data-blocked-link="${esc(firstBlockedId)}" data-focus="status-link"><strong>Build blocked</strong><span>${blockedCount === 1 ? '1 blocked deviation needs' : `${blockedCount} blocked deviations need`} a decision</span></a>`
    : `<div class="status"><strong>Build clear</strong><span>No blocked deviations</span></div>`;
}

export function dials(session) {
  if (!session.rules.length) return `<p class="empty">No rules to set. The lint report has no deviations.</p>`;
  return session.rules
    .map((rule) => {
      const all = session.deviations.filter((d) => d.rule === rule);
      const open = all.filter((d) => !isDecided(session, d.id)).length;
      const current = session.dials[rule];
      const options = DIALS.map(
        (dial) => `
          <label class="dial__option">
            <input type="radio" name="dial-${esc(rule)}" value="${dial}" data-rule="${esc(rule)}" data-focus="dial:${esc(rule)}:${dial}" ${dial === current ? 'checked' : ''}>
            <span>${DIAL_LABEL[dial]}</span>
          </label>`,
      ).join('');
      return `
        <div class="dial">
          <div class="dial__rule">
            <h3>${esc(ruleLabel(rule))}</h3>
            <p class="meta">${RULE_LABEL[rule] ? `<code>${esc(rule)}</code> · ` : ''}${all.length} found · ${open} undecided</p>
          </div>
          <fieldset class="dial__options">
            <legend class="sr-only">Dial for ${esc(ruleLabel(rule))}</legend>
            ${options}
          </fieldset>
          <p class="dial__help meta">${DIAL_HELP[current]}</p>
        </div>`;
    })
    .join('');
}

// Set · Decide (n) · Follow-ups (n) · Record, as in-page links with live counts.
export function steps(decideCount, followUpCount) {
  const items = [
    ['dials-title', 'Set'],
    ['queue-title', `Decide (${decideCount})`],
    ['follow-title', `Follow-ups (${followUpCount})`],
    ['log-title', 'Record'],
  ];
  return items.map(([id, label]) => `<li><a href="#${id}" data-step="${id}" data-focus="step:${id}">${label}</a></li>`).join('');
}

// Auto-fix is silent by design; this line, at the top of the log, keeps it from being invisible.
export function absorbedSummary(session) {
  const absorbed = autoAbsorbed(session);
  if (!absorbed.length) return `Auto-fix has absorbed nothing yet.`;
  const n = absorbed.length;
  const links = absorbed
    .map((e) => `<a href="#log-${esc(e.id)}" data-focus="absorbed:${esc(e.id)}">${esc(shortRef(e))}</a>`)
    .join(', ');
  return `Auto-fix absorbed <a href="#log-${esc(absorbed[0].id)}" data-focus="absorbed:count">${n} deviation${n === 1 ? '' : 's'}</a> without asking: ${links}.`;
}

export function shortRef({ rule, file, line }) {
  return `${RULE_SHORT[rule] ?? rule} in ${String(file).split('/').pop()}:${line}`;
}

// `confirmation` is the last decision ({ entry, index }); it renders where that card was,
// so the change is visible where the user clicked and the next card's buttons move out from under the pointer.
export function queue(session, pending, notes, errors, confirmation) {
  const done = confirmation ? decided(confirmation.entry) : '';
  if (!pending.length) {
    return done + (session.deviations.length
      ? `<p class="empty">Nothing is waiting. Every deviation has a decision; see the log below.</p>`
      : `<p class="empty">Nothing to review. The lint report has no deviations.</p>`);
  }
  const cards = pending.map((d) => card(session, d, notes.get(d.id) ?? '', errors.get(d.id)));
  if (done) cards.splice(Math.min(confirmation.index, cards.length), 0, done);
  return cards.join('');
}

function decided(e) {
  const amended = e.decision === 'amended';
  return `
    <p class="decided" data-decided="${esc(e.id)}">
      <strong>${amended ? 'Amended' : 'Rejected'}:</strong> ${esc(shortRef(e))}.
      Moved to <a href="#follow-title" data-step="follow-title" data-focus="decided-link">Follow-ups</a> as a ${amended ? 'contract change' : 'code fix'} to do.
    </p>`;
}

function card(session, d, note, error) {
  const dial = session.dials[d.rule];
  const needsNote = amendNeedsNote(d);
  const resolved = resolveToken(session.contract, d.suggestedToken);
  const base = `review-${esc(d.id)}`;
  const noteId = `${base}-note`;
  const amendBlocked = needsNote && !note.trim();

  const reason = d.agentReason
    ? `<dd class="reason__text">“${esc(d.agentReason)}”</dd>`
    : `<dd class="reason__text reason__text--missing">No reason given. The agent made this change without saying why.</dd>`;

  return `
    <article class="review" id="${base}" tabindex="-1" data-id="${esc(d.id)}" aria-labelledby="${base}-title">
      <h3 class="review__title" id="${base}-title">${esc(flagTitle(d, session.contract))}</h3>
      <p class="meta review__meta">${DIAL_LABEL[dial]} · ${esc(ruleLabel(d.rule))} · <code>${esc(d.file)}:${esc(d.line)}</code></p>
      <pre class="snippet"><code>${esc(d.snippet)}</code></pre>
      <dl class="why">
        <div>
          <dt class="meta">Why it was flagged</dt>
          <dd>${esc(flagRule(d, session.contract))}</dd>
        </div>
        <div>
          <dt class="meta">Why the agent did it</dt>
          ${reason}
        </div>
      </dl>
      <div class="decision">
        <div class="decision__option">
          <button type="button" class="decide" data-action="reject" data-id="${esc(d.id)}" data-focus="decide:${esc(d.id)}:reject" aria-describedby="${base}-title ${base}-reject">
            <span class="decide__verb">Reject</span>
            <span class="decide__gloss">The code is wrong</span>
          </button>
          <p class="decide__effect" id="${base}-reject">Code becomes <code>${esc(d.suggestedToken)}</code>${resolved ? ` ${esc(resolved)}` : ''}</p>
        </div>
        <div class="decision__option">
          <button type="button" class="decide" data-action="amend" data-id="${esc(d.id)}" data-focus="decide:${esc(d.id)}:amend" aria-describedby="${base}-title ${base}-amend${needsNote ? ` ${base}-req` : ''}"${amendBlocked ? ' aria-disabled="true"' : ''}>
            <span class="decide__verb">Amend</span>
            <span class="decide__gloss">The contract is wrong</span>
          </button>
          <p class="decide__effect" id="${base}-amend">Contract: <code>${esc(proposeChange(d, session.componentName))}</code></p>
        </div>
      </div>
      <label class="note" for="${noteId}">
        <span>Note ${needsNote ? `<span class="note__req" id="${base}-req">required to amend. There is no agent reason, so yours would be the only one on record.</span>` : '(optional)'}</span>
        <textarea id="${noteId}" data-note="${esc(d.id)}" data-focus="note:${esc(d.id)}" rows="2" placeholder="Why are you making this call?">${esc(note)}</textarea>
      </label>
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    </article>`;
}

// Reject and Amend decisions whose code fix or contract change hasn't happened yet.
export function followUps(log, resolving) {
  const decided = log.filter((e) => e.resolution);
  if (!decided.length) {
    return `<p class="empty">Nothing to follow up yet. Each Reject or Amend waits here until the code is fixed or the contract is updated.</p>`;
  }
  const open = decided.filter((e) => e.resolution.status === 'pending');
  if (!open.length) return `<p class="empty">All follow-ups are done. See the log below.</p>`;
  return `<ol class="follow-ups">${open
    .map((e) => {
      const amended = e.decision === 'amended';
      return `
      <li>
        <p><span class="follow-ups__kind">${amended ? 'Contract change' : 'Code fix'}</span> · ${amended
          ? `<code>${esc(e.proposedChange)}</code>`
          : `<code>${esc(e.file)}:${esc(e.line)}</code> becomes <code>${esc(e.suggestedFix)}</code>`}</p>
        <p class="meta">${esc(shortRef(e))} · ${e.agentReason ? 'agent gave a reason' : '<span class="warn">no agent reason</span>'}${e.note ? ` · note: “${esc(e.note)}”` : ''}</p>
        ${resolveControl(e, 'follow', resolving)}
      </li>`;
    })
    .join('')}</ol>`;
}

const RESOLUTION = {
  rejected: { pending: 'Code fix pending', resolved: 'Resolved: code fixed', action: 'Mark fixed' },
  amended: { pending: 'Contract change pending', resolved: 'Resolved: contract updated', action: 'Mark applied' },
};

// Chip + one button. `resolving` is the one open note form, if any: { id, scope, note }.
function resolution(e, resolving) {
  const text = RESOLUTION[e.decision];
  if (e.resolution.status === 'resolved') {
    const { at, note } = e.resolution;
    return `
      <div class="resolution">
        <p><span class="chip chip--resolved">${text.resolved}</span> <time class="meta" datetime="${esc(at)}">${esc(new Date(at).toLocaleTimeString())}</time></p>
        ${note ? `<p>Note: ${esc(note)}</p>` : ''}
        <button type="button" class="link-button link-button--small" data-reopen="${esc(e.id)}" data-focus="reopen:${esc(e.id)}">Reopen<span class="sr-only"> ${esc(shortRef(e))}</span></button>
      </div>`;
  }
  return `
    <div class="resolution">
      <p><span class="chip">${text.pending}</span></p>
      ${resolveControl(e, 'log', resolving)}
    </div>`;
}

function resolveControl(e, scope, resolving) {
  const { action } = RESOLUTION[e.decision];
  const key = `${esc(e.id)}:${scope}`;
  const ref = esc(shortRef(e));
  if (resolving?.id !== e.id || resolving.scope !== scope) {
    return `<button type="button" class="link-button link-button--small" data-resolve="${esc(e.id)}" data-scope="${scope}" data-focus="resolve:${key}">${action}<span class="sr-only"> ${ref}</span></button>`;
  }
  const fieldId = `resolve-${esc(e.id)}-${scope}`;
  return `
    <form class="resolve-form" data-resolve-form="${esc(e.id)}" data-scope="${scope}">
      <label for="${fieldId}">Note (optional)</label>
      <input id="${fieldId}" type="text" data-resolve-note data-focus="resolve-note:${key}" value="${esc(resolving.note)}" autocomplete="off">
      <div class="resolve-form__actions">
        <button type="submit" class="link-button link-button--small" data-focus="resolve-confirm:${key}">Confirm<span class="sr-only"> ${action.toLowerCase()}, ${ref}</span></button>
        <button type="button" class="link-button link-button--small link-button--quiet" data-resolve-cancel data-focus="resolve-cancel:${key}">Cancel</button>
      </div>
    </form>`;
}

export function log(entries, resolving) {
  if (!entries.length) return `<p class="empty">No decisions yet.</p>`;
  return `<ol class="log">${entries
    .map(
      (e) => `
      <li class="entry" id="log-${esc(e.id)}" tabindex="-1">
        <div class="entry__head">
          <strong>${DECISION_LABEL[e.decision]}</strong>
          <code class="loc">${esc(e.id)}</code>
          <code class="loc">${esc(e.file)}:${esc(e.line)}</code>
          <p class="meta">${DIAL_LABEL[e.dialSetting]} dial · <time datetime="${esc(e.timestamp)}">${esc(new Date(e.timestamp).toLocaleTimeString())}</time></p>
        </div>
        <p class="entry__reason">${e.agentReason ? `“${esc(e.agentReason)}”` : '<span class="warn">No reason given</span>'}</p>
        <div class="entry__outcome">
          <p>${e.proposedChange ? 'Contract' : 'Fix'}: <code>${esc(e.proposedChange ?? e.suggestedFix)}</code></p>
          ${e.note ? `<p>Note: ${esc(e.note)}</p>` : ''}
          ${e.resolution ? resolution(e, resolving) : ''}
        </div>
      </li>`,
    )
    .join('')}</ol>`;
}

export const SLOTS = [
  { kind: 'contract', label: 'Contract', help: 'Tokens and the component contract.' },
  { kind: 'policy', label: 'Policy', help: 'The default dial for each rule.' },
  { kind: 'report', label: 'Lint report', help: 'The deviations to review.' },
  { kind: 'reasons', label: 'Reasons', help: 'The agent’s reason for each deviation.' },
];

const sourceName = (source) => (source === 'demo' ? 'demo data' : `<code>${esc(source)}</code>`);

export function source(sources) {
  const own = SLOTS.filter((s) => sources[s.kind] !== 'demo');
  if (!own.length) return `Using demo data. <a href="#data">Load your own files</a>`;
  const list = own.map((s) => `${s.label.toLowerCase()} (${sourceName(sources[s.kind])})`).join(', ');
  const rest = own.length < SLOTS.length ? ' Demo data for the rest.' : '';
  return `Using your ${list}.${rest} <a href="#data">Change files</a>`;
}

export function loader(sources, loadErrors) {
  return SLOTS.map(({ kind, label, help }) => {
    const failed = loadErrors.get(kind);
    const errorsId = `slot-${kind}-errors`;
    return `
      <div class="slot">
        <div class="slot__head">
          <h3>${label}</h3>
          <p class="meta">${help} Now using ${sourceName(sources[kind])}.</p>
        </div>
        <label class="drop" data-drop="${kind}">
          <input class="sr-only" type="file" accept=".json,application/json" data-file="${kind}" data-focus="file:${kind}"${failed ? ` aria-describedby="${errorsId}" aria-invalid="true"` : ''}>
          <span>Drop a JSON file here, or <span class="drop__pick">choose a file</span><span class="sr-only"> for the ${label.toLowerCase()}</span></span>
        </label>
        ${
          failed
            ? `<div class="slot__errors" id="${errorsId}">
                <p>Couldn’t load <code>${esc(failed.file)}</code>. Still using ${sourceName(sources[kind])}.</p>
                <ul>${failed.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
              </div>`
            : ''
        }
      </div>`;
  }).join('');
}
