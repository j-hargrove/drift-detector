// HTML string templates. No DOM access here; app.js decides where they go.

import { DIALS, amendNeedsNote, autoAbsorbed, isDecided } from '../core/session.js';
import { proposeChange, resolveToken } from '../core/proposals.js';

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
// Label plus id, without repeating the id for rules that have no friendly label.
const ruleName = (rule) => (RULE_LABEL[rule] ? `${RULE_LABEL[rule]} · <code>${esc(rule)}</code>` : `<code>${esc(rule)}</code>`);

export function status({ blocked, blockedCount }) {
  return blocked
    ? `<div class="status status--blocked" role="status"><strong>Build blocked</strong><span>${blockedCount === 1 ? '1 blocked deviation needs' : `${blockedCount} blocked deviations need`} a decision</span></div>`
    : `<div class="status" role="status"><strong>Build clear</strong><span>No blocked deviations</span></div>`;
}

export function dials(session) {
  return session.rules
    .map((rule) => {
      const all = session.deviations.filter((d) => d.rule === rule);
      const open = all.filter((d) => !isDecided(session, d.id)).length;
      const current = session.dials[rule];
      const options = DIALS.map(
        (dial) => `
          <label class="dial__option">
            <input type="radio" name="dial-${esc(rule)}" value="${dial}" data-rule="${esc(rule)}" ${dial === current ? 'checked' : ''}>
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
            <legend class="sr-only">Dial for ${esc(rule)}</legend>
            ${options}
          </fieldset>
          <p class="dial__help meta">${DIAL_HELP[current]}</p>
        </div>`;
    })
    .join('') + absorbedSummary(session);
}

// Auto-fix is silent by design; this line keeps it from being invisible.
function absorbedSummary(session) {
  const absorbed = autoAbsorbed(session);
  if (!absorbed.length) return `<p class="absorbed">Auto-fix has absorbed nothing yet.</p>`;
  const n = absorbed.length;
  const links = absorbed.map((e) => `<a href="#log-${esc(e.id)}">${esc(shortRef(e))}</a>`).join(', ');
  return `<p class="absorbed">Auto-fix absorbed <a href="#log-${esc(absorbed[0].id)}">${n} deviation${n === 1 ? '' : 's'}</a> without asking: ${links}.</p>`;
}

function shortRef({ rule, file, line }) {
  return `${RULE_SHORT[rule] ?? rule} in ${String(file).split('/').pop()}:${line}`;
}

export function queue(session, pending, notes, errors) {
  if (!pending.length) {
    return `<p class="empty">Nothing is waiting. Every deviation has a decision; see the log below.</p>`;
  }
  return pending.map((d) => card(session, d, notes.get(d.id) ?? '', errors.get(d.id))).join('');
}

function card(session, d, note, error) {
  const dial = session.dials[d.rule];
  const needsNote = amendNeedsNote(d);
  const resolved = resolveToken(session.contract, d.suggestedToken);
  const noteId = `note-${esc(d.id)}`;

  const reason = d.agentReason
    ? `<p class="reason__text">“${esc(d.agentReason)}”</p>`
    : `<p class="reason__text reason__text--missing">No reason given. The agent made this change without saying why.</p>`;

  return `
    <article class="review" data-id="${esc(d.id)}">
      <p class="meta">${DIAL_LABEL[dial]} · ${ruleName(d.rule)}</p>
      <div class="review__source">
        <code class="loc">${esc(d.file)}:${esc(d.line)}</code>
        <pre class="snippet"><code>${esc(d.snippet)}</code></pre>
      </div>
      <div class="reason">
        <p class="meta">Explain · agent’s reason</p>
        ${reason}
      </div>
      <div class="decision">
        <div class="decision__option">
          <button type="button" class="decide" data-action="reject" data-id="${esc(d.id)}">
            <span class="decide__verb">Reject</span>
            <span class="decide__gloss">The code is wrong</span>
          </button>
          <p class="decide__effect">Code becomes <code>${esc(d.suggestedToken)}</code>${resolved ? ` ${esc(resolved)}` : ''}</p>
        </div>
        <div class="decision__option">
          <button type="button" class="decide" data-action="amend" data-id="${esc(d.id)}" ${needsNote && !note.trim() ? 'disabled' : ''}>
            <span class="decide__verb">Amend</span>
            <span class="decide__gloss">The contract is wrong</span>
          </button>
          <p class="decide__effect">Contract: <code>${esc(proposeChange(d, session.componentName))}</code></p>
        </div>
      </div>
      <label class="note" for="${noteId}">
        <span>Note ${needsNote ? '<span class="note__req">required to amend. There is no agent reason, so yours would be the only one on record.</span>' : '(optional)'}</span>
        <textarea id="${noteId}" data-note="${esc(d.id)}" rows="2" placeholder="Why are you making this call?">${esc(note)}</textarea>
      </label>
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    </article>`;
}

export function amendments(log) {
  const amended = log.filter((e) => e.decision === 'amended');
  if (!amended.length) return `<p class="empty">No amendments yet.</p>`;
  return `<ol class="amendments">${amended
    .map(
      (e) => `
      <li>
        <code>${esc(e.proposedChange)}</code>
        <p class="meta">from ${esc(e.id)} · ${e.agentReason ? 'agent gave a reason' : '<span class="warn">no agent reason</span>'}${e.note ? ` · note: “${esc(e.note)}”` : ''}</p>
      </li>`,
    )
    .join('')}</ol>`;
}

export function log(entries) {
  if (!entries.length) return `<p class="empty">No decisions yet.</p>`;
  return `<ol class="log">${entries
    .map(
      (e) => `
      <li class="entry" id="log-${esc(e.id)}">
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
          <input class="sr-only" type="file" accept=".json,application/json" data-file="${kind}"${failed ? ` aria-describedby="${errorsId}" aria-invalid="true"` : ''}>
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
