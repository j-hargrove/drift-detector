// HTML string templates. No DOM access here; app.js decides where they go.

import { DIALS, amendNeedsNote, autoAbsorbed, buildStatus, heldForReview, isDecided, reviewQueue } from '../core/session.js';
import { proposeChanges, resolveToken } from '../core/proposals.js';
import { preview } from '../core/preview.js';
import { flagRule, flagTitle } from '../core/explain.js';

const DIAL_LABEL = { 'auto-fix': 'Auto-fix', ask: 'Ask', block: 'Block' };
const DIAL_HELP = {
  'auto-fix': 'Agent applies the token. You only see it in the log, unless it gave no reason.',
  ask: 'You review each one. Nothing waits on it.',
  block: 'You review each one. The build stays blocked until you do.',
};
const RULE_LABEL = {
  'no-hardcoded-color': 'Hard-coded color',
  'no-arbitrary-spacing': 'Arbitrary spacing',
  'no-off-contract-variant': 'Off-contract variant',
};
// Short names for inline references, e.g. "Spacing in Button.tsx:12".
const RULE_SHORT = {
  'no-hardcoded-color': 'Color',
  'no-arbitrary-spacing': 'Spacing',
  'no-off-contract-variant': 'Variant',
};
const DECISION_LABEL = { 'auto-absorbed': 'Auto-absorbed', rejected: 'Rejected', amended: 'Amended' };

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ruleLabel = (rule) => RULE_LABEL[rule] ?? rule;

// A contract change as words and code tokens: add <code>color.danger</code> to <code>Button.allowedTokens.color</code>.
// Code tokens don't wrap (CSS), so a line can only break at a space, before a token, never inside one.
export function change(text) {
  const m = /^add (.+) to (\S+)$/.exec(text);
  return m ? `add <code>${esc(m[1])}</code> to <code>${esc(m[2])}</code>` : `<code>${esc(text)}</code>`;
}
const changeLines = (changes) => changes.map((c) => `<span class="change">${change(c)}</span>`).join('');

// While blocked, the badge links to the first blocking card. It shows "Build blocked · N" so the sticky bar
// stays one row; screen readers get the full sentence instead of the bare count.
export function status({ blocked, blockedCount }, firstBlockedId) {
  const sentence = `${blockedCount === 1 ? '1 blocked deviation needs' : `${blockedCount} blocked deviations need`} a decision`;
  return blocked
    ? `<a class="status status--blocked" href="#review-${esc(firstBlockedId)}" data-blocked-link="${esc(firstBlockedId)}" data-focus="status-link"><strong>Build blocked</strong> <span class="status__count" aria-hidden="true">· ${blockedCount}</span><span class="sr-only">${sentence}</span></a>`
    : `<div class="status"><strong>Build clear</strong><span class="status__detail">No blocked deviations</span></div>`;
}

// Found / To decide / Absorbed / Blocked. "To decide" is the strip's one accent tile;
// Blocked turns red while anything blocks the build.
export function stats(session) {
  const blocked = buildStatus(session).blockedCount;
  const tiles = [
    ['Found', session.deviations.length, ''],
    ['To decide', reviewQueue(session).length, ' stat--hero'],
    ['Absorbed', autoAbsorbed(session).length, ''],
    ['Blocked', blocked, blocked ? ' stat--blocked' : ''],
  ];
  return tiles.map(([label, n, mod]) => `<div class="stat${mod}"><dt>${label}</dt><dd>${n}</dd></div>`).join('');
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
          <fieldset class="dial__options" data-dial="${esc(rule)}" style="--pos: ${DIALS.indexOf(current)}">
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
  const rejectEffect = `<span class="change">Code becomes <code>${esc(d.suggestedToken)}</code>${resolved ? ` <code>${esc(resolved)}</code>` : ''}</span>`;
  const amendEffect = changeLines(proposeChanges(d, session.contract));

  const reason = d.agentReason
    ? `<dd class="reason__text">“${esc(d.agentReason)}”</dd>`
    : `<dd class="reason__text reason__text--missing">No reason given. The agent made this change without saying why.</dd>`;

  return `
    <article class="review" id="${base}" tabindex="-1" data-id="${esc(d.id)}" aria-labelledby="${base}-title">
      <h3 class="review__title" id="${base}-title">${esc(flagTitle(d, session.contract))}</h3>
      <p class="meta review__meta">${DIAL_LABEL[dial]} · ${esc(ruleLabel(d.rule))} · <code>${esc(d.file)}:${esc(d.line)}</code></p>
      ${heldForReview(session, d) ? `<p class="review__held">No agent reason, so a person has to decide.</p>` : ''}
      <pre class="snippet" data-snippet><code>${esc(d.snippet)}</code></pre>
      <p class="meta snippet__more" hidden>The line continues. Scroll sideways to read it all.</p>
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
      ${drawing(preview(d, session.contract))}
      <div class="decision">
        <button type="button" class="decide" data-action="reject" data-id="${esc(d.id)}" data-focus="decide:${esc(d.id)}:reject" aria-describedby="${base}-title">
          <span class="decide__head"><span class="decide__verb">Reject</span> <span class="decide__gloss">The code is wrong</span></span>
          <span class="decide__effect">${rejectEffect}</span>
        </button>
        <button type="button" class="decide" data-action="amend" data-id="${esc(d.id)}" data-focus="decide:${esc(d.id)}:amend" aria-describedby="${base}-title${needsNote ? ` ${base}-req` : ''}"${amendBlocked ? ' aria-disabled="true"' : ''}>
          <span class="decide__head"><span class="decide__verb">Amend</span> <span class="decide__gloss">The contract is wrong</span></span>
          <span class="decide__effect">${amendEffect}</span>
        </button>
      </div>
      <!-- Under 640px a half-width button is narrower than a token like Button.allowedTokens.color, and tokens
           never break, so the consequences show here at full width instead. The buttons keep them in their
           accessible names at every width, so this copy is hidden from screen readers. -->
      <div class="decision__effects" aria-hidden="true">
        <p class="decision__effect"><span class="decision__label">Reject:</span> ${rejectEffect}</p>
        <div class="decision__effect"><span class="decision__label">Amend:</span>${amendEffect}</div>
      </div>
      <label class="note" for="${noteId}">
        <span>Note ${needsNote ? `<span class="note__req" id="${base}-req">required to amend. There is no agent reason, so yours would be the only one on record.</span>` : '(optional)'}</span>
        <textarea id="${noteId}" data-note="${esc(d.id)}" data-focus="note:${esc(d.id)}" rows="2" placeholder="Why are you making this call?">${esc(note)}</textarea>
      </label>
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    </article>`;
}

const fileRef = ({ file, line }) => `${String(file).split('/').pop()}:${line}`;

// The deviation drawn from contract tokens: what the agent built and what each decision ships.
// Token values are hex/px only (preview.js filters them), so they're safe in a style attribute.
function drawing(p) {
  if (!p) return '';
  const panel = (x, art) => `
    <div class="preview__panel">
      <div class="preview__stage">${art}</div>
      <p class="preview__label">${esc(x.label)}</p>
      <p class="preview__caption">${esc(x.caption)}</p>
    </div>`;
  let panels;
  if (p.kind === 'variant') panels = p.panels.map((x) => panel(x, drawnButton(x.button)));
  if (p.kind === 'color') {
    panels = p.panels.map((x) =>
      panel(x, `<span class="swatch" style="background: ${esc(x.swatch.hex)}"></span><code class="swatch__hex">${esc(x.swatch.hex)}</code>`),
    );
  }
  if (p.kind === 'spacing') panels = p.panels.map((x) => panel(x, spacingArt(p, x)));
  const note = p.kind === 'spacing' ? `<figcaption class="preview__note">${p.property === 'gap' ? 'Gap' : 'Padding'} drawn at ${p.scale}×</figcaption>` : '';
  return `<figure class="preview preview--${p.kind}"><div class="preview__panels">${panels.join('')}</div>${note}</figure>`;
}

function drawnButton(b, extra = '') {
  return `<span class="drawn" style="background: ${esc(b.bg)}; color: ${esc(b.fg)}; border-color: ${esc(b.border)}; border-radius: ${esc(b.radius)}; padding: ${esc(b.padding)} ${esc(b.paddingInline)};${extra}">${esc(b.text)}</span>`;
}

// Padding: the button's padding at scale, the content box dashed, a measured bracket under the left padding.
// Gap: two buttons, the bracket under the gap between them.
function spacingArt(p, x) {
  const size = `${x.px * p.scale}px`;
  const dim = `<span class="dim" style="width: ${size}"><span class="dim__label">${x.px}px</span></span>`;
  if (p.property === 'gap') {
    const small = drawnButton(x.button, ' padding: 4px 8px;');
    return `<span class="measure measure--gap" style="gap: ${size}">${small}${small}<span class="dim dim--gap" style="width: ${size}"><span class="dim__label">${x.px}px</span></span></span>`;
  }
  const b = x.button;
  return `<span class="measure"><span class="drawn drawn--measured" style="background: ${esc(b.bg)}; color: ${esc(b.fg)}; border-radius: ${esc(b.radius)}; padding: ${size};"><span class="drawn__content">${esc(b.text)}</span></span>${dim}</span>`;
}

// Reject and Amend decisions whose code fix or contract change hasn't happened yet.
// `done` is the last follow-up marked done ({ entry, index }); its confirmation takes the item's place.
export function followUps(log, resolving, done) {
  const confirmation = done ? resolvedConfirmation(done.entry) : '';
  const decided = log.filter((e) => e.resolution);
  if (!decided.length) {
    return `<p class="empty">Nothing to follow up yet. Each Reject or Amend waits here until the code is fixed or the contract is updated.</p>`;
  }
  const open = decided.filter((e) => e.resolution.status === 'pending');
  if (!open.length) return `${confirmation}<p class="empty">All follow-ups are done. See the log below.</p>`;
  const items = open.map((e) => {
    const amended = e.decision === 'amended';
    const what = amended
      ? `<ul class="changes">${e.proposedChange.map((c) => `<li>${change(c)}</li>`).join('')}</ul>`
      : `<p class="changes"><code>${esc(e.file)}:${esc(e.line)}</code> becomes <code>${esc(e.suggestedFix)}</code></p>`;
    return `
      <li>
        <p class="follow-ups__kind">${amended ? 'Contract change' : 'Code fix'}</p>
        ${what}
        <p class="meta">${esc(shortRef(e))} · ${e.agentReason ? 'agent gave a reason' : '<span class="warn">no agent reason</span>'}${e.note ? ` · note: “${esc(e.note)}”` : ''}</p>
        ${resolveControl(e, 'follow', resolving)}
      </li>`;
  });
  if (confirmation) items.splice(Math.min(done.index, items.length), 0, `<li class="follow-ups__done">${confirmation}</li>`);
  return `<ol class="follow-ups">${items.join('')}</ol>`;
}

// Same band as the Reject/Amend confirmation, e.g.
// "Resolved: contract change in Settings.tsx:42. Moved to the decision log."
export function resolvedText(e) {
  return `Resolved: ${e.decision === 'amended' ? 'contract change' : 'code fix'} in ${fileRef(e)}.`;
}

function resolvedConfirmation(e) {
  return `
    <p class="decided" data-resolved="${esc(e.id)}">
      <strong>Resolved:</strong> ${e.decision === 'amended' ? 'contract change' : 'code fix'} in ${esc(fileRef(e))}.
      Moved to the <a href="#log-${esc(e.id)}" data-step="log-${esc(e.id)}" data-focus="resolved-link">decision log</a>.
    </p>`;
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

// Each entry leads with the same plain-language title as its card; id and file path are metadata.
export function log(entries, resolving, session) {
  if (!entries.length) return `<p class="empty">No decisions yet.</p>`;
  const deviation = (id) => session.deviations.find((d) => d.id === id);
  return `<ol class="log">${entries
    .map(
      (e) => `
      <li class="entry" id="log-${esc(e.id)}" tabindex="-1">
        <p class="entry__title">${esc(flagTitle(deviation(e.id) ?? e, session.contract))}</p>
        <div class="entry__head">
          <strong>${DECISION_LABEL[e.decision]}</strong>
          <p class="meta">${DIAL_LABEL[e.dialSetting]} dial · <time datetime="${esc(e.timestamp)}">${esc(new Date(e.timestamp).toLocaleTimeString())}</time></p>
          <p class="meta"><code class="loc">${esc(e.file).replace(/\//g, '/<wbr>')}:${esc(e.line)}</code> · <code class="loc">${esc(e.id)}</code></p>
        </div>
        <p class="entry__reason">${e.agentReason ? `“${esc(e.agentReason)}”` : '<span class="warn">No reason given</span>'}</p>
        <div class="entry__outcome">
          ${e.proposedChange
            ? `<div><p>Contract:</p><ul class="changes">${e.proposedChange.map((c) => `<li>${change(c)}</li>`).join('')}</ul></div>`
            : `<p>Fix: <code>${esc(e.suggestedFix)}</code></p>`}
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
