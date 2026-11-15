// HTML string templates. No DOM access here; app.js decides where they go.

import { DIALS, amendNeedsNote, autoAbsorbed, buildStatus, heldForReview, isDecided, reviewQueue } from '../core/session.js';
import { proposeChanges, resolveToken } from '../core/proposals.js';
import { preview } from '../core/preview.js';
import { flagRule, flagTitle, sameValueAsToken, shortPath } from '../core/explain.js';
import { DATASETS } from '../core/datasets.js';
import { icon, ruleIcon } from './icons.js';

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
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A contract change as words and code tokens: add <code>color.danger</code> to <code>Button.allowedTokens.color</code>.
// Short code tokens don't wrap (CSS), so a line breaks at a space between tokens, never inside one.
// A long value (over 32 characters, e.g. a whole rgba() declaration) would overflow its button, so it
// may wrap after its spaces and commas.
const LONG_CODE = 32;
// Each run between break points is unbreakable (.nobr), so text wraps only where `<wbr>` or a space allows,
// never at a hyphen or an ellipsis.
const breakAfter = (text, chars) =>
  String(text)
    .split(' ')
    .map((word) => word.split(new RegExp(`(?<=[${chars}])`)).map((run) => `<span class="nobr">${esc(run)}</span>`).join('<wbr>'))
    .join(' ');
const codeSpan = (text) =>
  String(text).length > LONG_CODE ? `<code class="code--wrap">${breakAfter(text, ',')}</code>` : `<code>${esc(text)}</code>`;
export function change(text) {
  const m = /^add (.+) to (\S+)$/.exec(text);
  return m ? `add ${codeSpan(m[1])} to ${codeSpan(m[2])}` : codeSpan(text);
}
// Consequence lines: "+" per contract change for Amend, "→" for Reject. The marks are visual;
// screen readers get words instead.
const amendLines = (changes) =>
  changes.map((c) => `<span class="change"><span class="change__mark" aria-hidden="true">+</span> ${change(c)}</span>`).join('');

// While blocked, the badge links to the first blocking card. It shows "Build blocked · N";
// screen readers get the full sentence instead of the bare count. The header and the sticky bar
// each carry one; `place` keeps their focus keys apart.
export function status({ blocked, blockedCount }, firstBlockedId, place = 'header') {
  const sentence = `${blockedCount === 1 ? '1 blocked deviation needs' : `${blockedCount} blocked deviations need`} a decision`;
  return blocked
    ? `<a class="status status--blocked" href="#review-${esc(firstBlockedId)}" data-blocked-link="${esc(firstBlockedId)}" data-focus="status-link:${place}">${icon('octagon', 16)}<strong>Build blocked</strong> <span class="status__count" aria-hidden="true">· ${blockedCount}</span><span class="sr-only">${sentence}</span></a>`
    : `<div class="status">${icon('checkCircle', 16)}<strong>Build clear</strong><span class="sr-only">No blocked deviations</span></div>`;
}

// Found / To decide / Absorbed / Blocked. To decide is the solid brand-blue card;
// Blocked turns red (tile and number) while anything blocks the build.
export function stats(session) {
  const blocked = buildStatus(session).blockedCount;
  const tiles = [
    ['Found', session.deviations.length, 'search', ''],
    ['To decide', reviewQueue(session).length, 'scale', ' stat--hero'],
    ['Absorbed', autoAbsorbed(session).length, 'wand', ''],
    ['Blocked', blocked, 'octagon', blocked ? ' stat--blocked' : ''],
  ];
  return tiles
    .map(([label, n, glyph, mod]) => `<div class="stat${mod}"><span class="tile">${icon(glyph)}</span><dt class="label">${label}</dt><dd>${n}</dd></div>`)
    .join('');
}

// The contract under review: what the component is allowed, how much drift each rule found,
// and a line drawing of the component annotated with its tokens.
export function hero(session) {
  const { contract } = session;
  const comp = contract.component ?? {};
  const allowed = comp.allowedTokens ?? {};
  const counts = [
    [comp.variants?.length ?? 0, 'Variants'],
    [allowed.color?.length ?? 0, 'Allowed color tokens'],
    [allowed.spacing?.length ?? 0, 'Allowed spacing tokens'],
  ];
  const byRule = session.rules.map((rule) => [rule, session.deviations.filter((d) => d.rule === rule).length]);
  const max = Math.max(1, ...byRule.map(([, n]) => n));
  const bars = byRule.length
    ? `<ul class="hero__bars">${byRule
        .map(
          ([rule, n]) => `
          <li>
            <span class="hero__bar-name">${esc(ruleLabel(rule))}</span>
            <span class="hero__bar-track"><span class="hero__bar hero__bar--${esc(rule)}" style="width: ${Math.round((n / max) * 100)}%"></span></span>
            <span class="hero__bar-n">${n}</span>
          </li>`,
        )
        .join('')}</ul>`
    : `<p class="hero__empty">The lint report has no deviations.</p>`;
  const contractName = [contract.name, contract.version].filter(Boolean).join(' ');
  return `
    <div class="hero__text">
      <p class="label hero__label">Contract under review</p>
      <h2 class="hero__name" id="hero-title">${esc(comp.name ?? 'Component')}</h2>
      ${contractName ? `<p class="hero__contract">${esc(contractName)}</p>` : ''}
      <dl class="hero__counts">${counts.map(([n, label]) => `<div><dt>${label}</dt><dd>${n}</dd></div>`).join('')}</dl>
      <div class="hero__chart">
        <p class="label hero__label">Drift by rule</p>
        ${bars}
      </div>
    </div>
    <div class="hero__art">${anatomy(session)}</div>
    <span class="hero__watermark" aria-hidden="true">DRIFT</span>`;
}

// The component as a line drawing, with callouts for the tokens it's built from.
// Token names come from the contract; the 36px height is the drawing's own annotation.
function anatomy(session) {
  const { contract } = session;
  const comp = contract.component ?? {};
  const allowed = comp.allowedTokens ?? {};
  const radius = allowed.radius?.[0] ?? 'radius';
  const spacing = allowed.spacing?.find((t) => t.endsWith('.3')) ?? allowed.spacing?.[0] ?? 'spacing';
  const color = allowed.color?.[0] ?? 'color';
  const hex = /^#[0-9a-fA-F]{3,8}$/.test(String(resolveToken(contract, color))) ? resolveToken(contract, color) : null;
  const variantDrift = session.deviations.some((d) => d.rule === 'no-off-contract-variant');
  const label = `${comp.name ?? 'Component'} anatomy: ${radius} corners, ${spacing} padding, 36px tall, filled with ${color}.${variantDrift ? ' One variant is not in the contract.' : ''}`;
  return `
    <svg class="anatomy" viewBox="0 0 360 210" role="img" aria-label="${esc(label)}">
      <g class="anatomy__lines" fill="none">
        <rect x="80" y="74" width="200" height="64" rx="14"/>
        <rect class="anatomy__dashed" x="110" y="92" width="140" height="28" rx="3"/>
        <path d="M84 78 50 44"/>
        <path d="M80 150v8h30v-8"/>
        <path d="M302 74v64M296 74h12M296 138h12"/>
        <path d="M232 48 214 74"/>
      </g>
      <text class="anatomy__name" x="180" y="111">${esc(comp.name ?? 'Component')}</text>
      <text class="anatomy__label" x="16" y="38">${esc(radius)}</text>
      <text class="anatomy__label" x="95" y="176" text-anchor="middle">${esc(spacing)}</text>
      <text class="anatomy__label" x="296" y="160">height 36</text>
      ${hex ? `<rect class="anatomy__swatch" x="232" y="30" width="14" height="14" rx="3" style="fill: ${esc(hex)}"/>` : ''}
      <text class="anatomy__label" x="252" y="41">${esc(color)}</text>
      ${variantDrift ? `<g class="anatomy__pill"><rect x="150" y="174" width="72" height="22" rx="11"/><text x="186" y="189" text-anchor="middle">variant?</text></g>` : ''}
    </svg>`;
}

export function dials(session) {
  if (!session.rules.length) return `<p class="empty">No rules to set. The lint report has no deviations.</p>`;
  return `<div class="panel dial-card">${session.rules
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
          <span class="tile tile--lg${current === 'block' ? ' tile--red' : ''}">${ruleIcon(rule, 20)}</span>
          <div class="dial__rule">
            <h3>${esc(ruleLabel(rule))}</h3>
            <p class="meta">${all.length} found · ${open} undecided · <span class="dial__help">${DIAL_HELP[current]}</span></p>
          </div>
          <fieldset class="dial__options" data-dial="${esc(rule)}" style="--pos: ${DIALS.indexOf(current)}">
            <legend class="sr-only">Dial for ${esc(ruleLabel(rule))}</legend>
            ${options}
          </fieldset>
        </div>`;
    })
    .join('')}</div>`;
}

// Set · Decide · Follow-ups · Record, as in-page links with icons and live count chips.
// Set has no chip: its count (the number of rules) never needs attention.
export function steps({ decide, followUps, logged }, current) {
  const items = [
    ['dials-title', 'Set', 'sliders', null],
    ['queue-title', 'Decide', 'scale', decide],
    ['follow-title', 'Follow-ups', 'listCheck', followUps],
    ['log-title', 'Record', 'book', logged],
  ];
  return items
    .map(
      ([id, label, glyph, n]) =>
        `<li><a href="#${id}" data-step="${id}" data-focus="step:${id}"${id === current ? ' aria-current="location"' : ''}>${icon(glyph)}<span class="steps__label">${label}</span>${n === null ? '' : `<span class="steps__count">${n}</span>`}</a></li>`,
    )
    .join('');
}

// Auto-fix is silent by design; this line, at the top of the log, keeps it from being invisible.
export function absorbedSummary(session) {
  const absorbed = autoAbsorbed(session);
  if (!absorbed.length) return `Auto-fix has absorbed nothing yet.`;
  const n = absorbed.length;
  const links = absorbed
    .map((e) => `<a href="#log-${esc(e.id)}" data-focus="absorbed:${esc(e.id)}">${esc(shortRef(e))}</a>`)
    .join(', ');
  return `${icon('wand', 16)}<span>Auto-fix absorbed <a href="#log-${esc(absorbed[0].id)}" data-focus="absorbed:count">${plural(n, 'deviation')}</a> without asking: ${links}.</span>`;
}

export function shortRef({ rule, file, line }) {
  return `${RULE_SHORT[rule] ?? rule} in ${String(file).split('/').pop()}:${line}`;
}

// `confirmation` is the last decision ({ entry, index }); it renders where that card was,
// so the change is visible where the user clicked and the next card's buttons move out from under the pointer.
// The first card is always open; the rest are rows until expanded (ids in `expanded`).
export function queue(session, pending, notes, errors, confirmation, expanded = new Set()) {
  const done = confirmation ? decided(confirmation.entry) : '';
  if (!pending.length) {
    return done + (session.deviations.length
      ? `<p class="empty">Nothing is waiting. Every deviation has a decision; see the log below.</p>`
      : `<p class="empty">Nothing to review. The lint report has no deviations.</p>`);
  }
  const cards = pending.map((d, i) =>
    i === 0 || expanded.has(d.id)
      ? card(session, d, notes.get(d.id) ?? '', errors.get(d.id), i > 0)
      : collapsedCard(session, d),
  );
  if (done) cards.splice(Math.min(confirmation.index, cards.length), 0, done);
  return cards.join('');
}

function decided(e) {
  const amended = e.decision === 'amended';
  return `
    <p class="decided" data-decided="${esc(e.id)}">
      ${icon('check', 16)}
      <span><strong>${amended ? 'Amended' : 'Rejected'}:</strong> ${esc(shortRef(e))}.
      Moved to <a href="#follow-title" data-step="follow-title" data-focus="decided-link">Follow-ups</a> as a ${amended ? 'contract change' : 'code fix'} to do.</span>
    </p>`;
}

const dialChip = (session, d) => {
  const dial = session.dials[d.rule];
  return `<span class="chip chip--dial${dial === 'block' ? ' chip--block' : ''}">${DIAL_LABEL[dial]}</span>`;
};

// A color drawn on a white chip: an opaque color covers it; a see-through rgba() shows as it would
// on a white surface, not over the preview's dot grid. `css` comes from preview.js (hex or rebuilt rgb).
const chipFill = (css) => `background: linear-gradient(${esc(css)}, ${esc(css)}), #FFFFFF`;

// A row standing in for an undecided card: icon tile, rule, title, swatches for colors, chevron.
function collapsedCard(session, d) {
  const base = `review-${esc(d.id)}`;
  const p = preview(d, session.contract);
  const swatches =
    p?.kind === 'color'
      ? `<span class="row__swatches" aria-hidden="true">${p.panels.map((x) => `<span class="dot" style="${chipFill(x.swatch.css)}"></span>`).join('')}</span>`
      : '';
  return `
    <article class="review review--row" id="${base}" tabindex="-1" data-id="${esc(d.id)}" aria-labelledby="${base}-title">
      <h3 class="row__heading">
        <button type="button" class="row" data-expand="${esc(d.id)}" data-focus="expand:${esc(d.id)}" aria-expanded="false" id="${base}-title">
          <span class="tile${session.dials[d.rule] === 'block' ? ' tile--red' : ''}">${ruleIcon(d.rule)}</span>
          <span class="row__text">
            <span class="label">${esc(ruleLabel(d.rule))} · ${DIAL_LABEL[session.dials[d.rule]]}</span>
            <span class="row__title">${esc(flagTitle(d, session.contract))}</span>
          </span>
          ${swatches}
          <span class="row__chevron">${icon('chevronDown', 20)}</span>
        </button>
      </h3>
    </article>`;
}

// The offending value, marked in the snippet: the hex, the off-scale px, or the variant name.
// A quoted value is marked with its quotes ("destructive", '20px').
function highlighted(d, contract) {
  const { snippet, rule } = d;
  let match = null;
  if (rule === 'no-hardcoded-color') match = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/.exec(snippet);
  if (rule === 'no-off-contract-variant') {
    const m = /variant=\{?["'`]([^"'`]+)["'`]/.exec(snippet);
    if (m) match = { index: m.index + m[0].indexOf(m[1]), 0: m[1] };
  }
  if (rule === 'no-arbitrary-spacing') {
    const scale = (contract.component?.allowedTokens?.spacing ?? []).map((t) => parseFloat(resolveToken(contract, t)));
    match = [...snippet.matchAll(/(\d+(?:\.\d+)?)px\b/g)].find((m) => !scale.includes(Number(m[1]))) ?? null;
  }
  if (!match) return esc(snippet);
  let at = match.index;
  let text = match[0];
  const quote = snippet[at - 1];
  if (quote && `"'\``.includes(quote) && snippet[at + text.length] === quote) {
    at -= 1;
    text = quote + text + quote;
  }
  return `${esc(snippet.slice(0, at))}<mark>${esc(text)}</mark>${esc(snippet.slice(at + text.length))}`;
}

function card(session, d, note, error, collapsible) {
  const needsNote = amendNeedsNote(d);
  const resolved = resolveToken(session.contract, d.suggestedToken);
  const base = `review-${esc(d.id)}`;
  const noteId = `${base}-note`;
  const amendBlocked = needsNote && !note.trim();
  // When the hard-coded value already equals the token's, Reject only swaps the literal for the reference.
  const same = sameValueAsToken(d, session.contract);
  const rejectEffect = same
    ? `<span class="change"><span class="change__mark" aria-hidden="true">→</span><span class="sr-only">Code becomes</span> <code>${esc(same.token)}</code>.</span> <span class="change change--note">The value stays <code>${esc(same.value)}</code>; only the token reference changes.</span>`
    : `<span class="change"><span class="change__mark" aria-hidden="true">→</span><span class="sr-only">Code becomes</span> <code>${esc(d.suggestedToken)}</code>${resolved ? ` <code>${esc(resolved)}</code>` : ''}</span>`;
  // A long path is shortened in the middle in the header (full path in its title, and in the body on phones).
  const loc = `${d.file}:${d.line}`;
  const shortLoc = `${shortPath(d.file)}:${d.line}`;
  const truncated = shortLoc !== loc;
  const slashBreaks = (text) => breakAfter(text, '/');
  const amendEffect = amendLines(proposeChanges(d, session.contract));

  const reason = d.agentReason
    ? `<dd class="reason__text">“${esc(d.agentReason)}”</dd>`
    : `<dd class="reason__text reason__text--missing">${icon('alert', 16)}<span><strong>No reason given.</strong> The agent made this change without saying why.</span></dd>`;

  return `
    <article class="review" id="${base}" tabindex="-1" data-id="${esc(d.id)}" aria-labelledby="${base}-title">
      <div class="review__band">
        <span class="tile tile--glass">${ruleIcon(d.rule, 22)}</span>
        <div class="review__heading">
          <p class="review__kicker">${dialChip(session, d)}<span class="label">${esc(ruleLabel(d.rule))}</span></p>
          <h3 class="review__title" id="${base}-title">${esc(flagTitle(d, session.contract))}</h3>
        </div>
        ${
          truncated
            ? `<p class="review__loc review__loc--long" title="${esc(loc)}"><code class="loc--full">${esc(loc)}</code><code class="loc--short" aria-hidden="true">${slashBreaks(shortLoc)}</code></p>`
            : `<p class="review__loc"><code>${esc(loc)}</code></p>`
        }
        ${collapsible ? `<button type="button" class="review__collapse" data-collapse="${esc(d.id)}" data-focus="collapse:${esc(d.id)}" aria-expanded="true" aria-label="Collapse">${icon('chevronUp', 20)}</button>` : ''}
      </div>
      <div class="review__body">
        ${truncated ? `<p class="review__path" aria-hidden="true"><span class="label">File</span> <code>${slashBreaks(loc)}</code></p>` : ''}
        ${heldForReview(session, d) ? `<p class="review__held">${icon('alert', 16)}<span>No agent reason, so a person has to decide.</span></p>` : ''}
        <pre class="snippet" data-snippet><code>${highlighted(d, session.contract)}</code></pre>
        <p class="meta snippet__more" hidden>The line continues. Scroll sideways to read it all.</p>
        <dl class="why">
          <div class="why__tile">
            <dt class="label">${icon('flag', 14)}Why flagged</dt>
            <dd>${esc(flagRule(d, session.contract))}</dd>
          </div>
          <div class="why__tile${d.agentReason ? '' : ' why__tile--missing'}">
            <dt class="label">${icon('message', 14)}Why the agent did it</dt>
            ${reason}
          </div>
        </dl>
        ${drawing(preview(d, session.contract))}
        <div class="decision">
          <button type="button" class="decide" data-action="reject" data-id="${esc(d.id)}" data-focus="decide:${esc(d.id)}:reject" aria-describedby="${base}-title">
            <span class="decide__head"><span class="tile">${icon('code')}</span><span class="decide__titles"><span class="decide__verb">Reject</span> <span class="decide__gloss">The code is wrong</span></span></span>
            <span class="decide__effect">${rejectEffect}</span>
          </button>
          <button type="button" class="decide" data-action="amend" data-id="${esc(d.id)}" data-focus="decide:${esc(d.id)}:amend" aria-describedby="${base}-title${needsNote ? ` ${base}-req` : ''}"${amendBlocked ? ' aria-disabled="true"' : ''}>
            <span class="decide__head"><span class="tile">${icon('filePen')}</span><span class="decide__titles"><span class="decide__verb">Amend</span> <span class="decide__gloss">The contract is wrong</span></span></span>
            <span class="decide__effect">${amendEffect}</span>
          </button>
        </div>
        <!-- Under 640px a half-width button is narrower than a token like Button.allowedTokens.color, and tokens
             never break, so the consequences show here at full width instead. The buttons keep them in their
             accessible names at every width, so this copy is hidden from screen readers. -->
        <div class="decision__effects" aria-hidden="true">
          <p class="decision__effect"><span class="decision__label">Reject</span>${rejectEffect}</p>
          <div class="decision__effect"><span class="decision__label">Amend</span>${amendEffect}</div>
        </div>
        <label class="note" for="${noteId}">
          <span class="label">Note ${needsNote ? '' : '(optional)'}</span>
          ${needsNote ? `<span class="note__req" id="${base}-req">Required to amend. There is no agent reason, so yours would be the only one on record.</span>` : ''}
          <textarea id="${noteId}" data-note="${esc(d.id)}" data-focus="note:${esc(d.id)}" rows="1" placeholder="Why are you making this call?">${esc(note)}</textarea>
        </label>
        ${error ? `<p class="error" role="alert">${icon('alert', 16)}<span>${esc(error)}</span></p>` : ''}
      </div>
    </article>`;
}

const fileRef = ({ file, line }) => `${String(file).split('/').pop()}:${line}`;

// The deviation drawn from contract tokens, true size: what the agent built and what each decision ships.
// Token values are hex/px only (preview.js filters them), so they're safe in a style attribute.
function drawing(p) {
  if (!p) return '';
  const tile = (x, art) => `
    <div class="preview__tile">
      <div class="preview__stage">${art}</div>
      <p class="preview__label label">${esc(x.label)}</p>
      <p class="preview__caption">${esc(x.caption)}</p>
    </div>`;
  let tiles;
  if (p.kind === 'variant') tiles = p.panels.map((x) => tile(x, drawnButton(x.button)));
  if (p.kind === 'color') {
    tiles = p.panels.map((x) =>
      tile(x, `<span class="swatch" style="--btn: ${esc(x.swatch.css)}; ${chipFill(x.swatch.css)}"></span><code class="swatch__hex">${esc(x.swatch.value)}</code>`),
    );
  }
  if (p.kind === 'spacing') tiles = p.panels.map((x) => tile(x, spacingArt(p, x)));
  const note = p.kind === 'spacing' && p.scale !== 1 ? `<figcaption class="meta">${p.property === 'gap' ? 'Gap' : 'Padding'} drawn at ${p.scale}×</figcaption>` : '';
  return `<figure class="preview preview--${p.kind}"><div class="preview__tiles">${tiles.join('')}</div>${note}</figure>`;
}

const buttonStyle = (b) => `--btn: ${esc(b.bg === 'transparent' ? b.fg : b.bg)}; background: ${esc(b.bg)}; color: ${esc(b.fg)}; border-color: ${esc(b.border)}; border-radius: ${esc(b.radius)};`;

function drawnButton(b) {
  return `<span class="drawn" style="${buttonStyle(b)} padding: ${esc(b.padding)} ${esc(b.paddingInline)};">${esc(b.text)}</span>`;
}

// Padding: the content box dashed, a measured bracket under the left padding.
// Gap: two buttons, the bracket under the gap between them.
function spacingArt(p, x) {
  const size = `${x.px * p.scale}px`;
  const b = x.button;
  if (p.property === 'gap') {
    const one = `<span class="drawn" style="${buttonStyle(b)} padding: ${esc(b.padding)} ${esc(b.paddingInline)};">${esc(b.text)}</span>`;
    return `<span class="measure measure--gap" style="gap: ${size}">${one}${one}<span class="dim dim--gap" style="width: ${size}"><span class="dim__label">${x.px}px</span></span></span>`;
  }
  return `<span class="measure"><span class="drawn drawn--measured" style="${buttonStyle(b)} padding: ${size};"><span class="drawn__content">${esc(b.text)}</span></span><span class="dim" style="width: ${size}"><span class="dim__label">${x.px}px</span></span></span>`;
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
      ? `<ul class="changes">${e.proposedChange.map((c) => `<li><span aria-hidden="true">+ </span>${change(c)}</li>`).join('')}</ul>`
      : `<p class="changes"><code>${esc(e.file)}:${esc(e.line)}</code> becomes <code>${esc(e.suggestedFix)}</code></p>`;
    return `
      <li class="follow">
        <span class="tile">${icon(amended ? 'filePen' : 'code')}</span>
        <div class="follow__body">
          <p class="label">${amended ? 'Contract change' : 'Code fix'}</p>
          ${what}
          <p class="meta">${esc(shortRef(e))} · ${e.agentReason ? 'agent gave a reason' : '<span class="warn">no agent reason</span>'}${e.note ? ` · note: “${esc(e.note)}”` : ''}</p>
          ${resolveControl(e, 'follow', resolving)}
        </div>
      </li>`;
  });
  if (confirmation) items.splice(Math.min(done.index, items.length), 0, `<li class="follow-ups__done">${confirmation}</li>`);
  return `<ol class="panel follow-ups">${items.join('')}</ol>`;
}

// Same band as the Reject/Amend confirmation, e.g.
// "Resolved: contract change in Settings.tsx:42. Moved to the decision log."
export function resolvedText(e) {
  return `Resolved: ${e.decision === 'amended' ? 'contract change' : 'code fix'} in ${fileRef(e)}.`;
}

function resolvedConfirmation(e) {
  return `
    <p class="decided" data-resolved="${esc(e.id)}">
      ${icon('check', 16)}
      <span><strong>Resolved:</strong> ${e.decision === 'amended' ? 'contract change' : 'code fix'} in ${esc(fileRef(e))}.
      Moved to the <a href="#log-${esc(e.id)}" data-step="log-${esc(e.id)}" data-focus="resolved-link">decision log</a>.</span>
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
        <p><span class="chip chip--resolved">${icon('check', 14)}${text.resolved}</span> <time class="meta" datetime="${esc(at)}">${esc(new Date(at).toLocaleTimeString())}</time></p>
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
      <label class="label" for="${fieldId}">Note (optional)</label>
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
  return `<ol class="panel log">${entries
    .map(
      (e) => `
      <li class="entry" id="log-${esc(e.id)}" tabindex="-1">
        <p class="entry__title">${esc(flagTitle(deviation(e.id) ?? e, session.contract))}</p>
        <div class="entry__head">
          <span class="chip chip--decision chip--${esc(e.decision)}">${DECISION_LABEL[e.decision]}</span>
          <p class="meta">${DIAL_LABEL[e.dialSetting]} dial · <time datetime="${esc(e.timestamp)}">${esc(new Date(e.timestamp).toLocaleTimeString())}</time></p>
          <p class="meta"><code class="loc">${esc(e.file).replace(/\//g, '/<wbr>')}:${esc(e.line)}</code> · <code class="loc">${esc(e.id)}</code></p>
        </div>
        <p class="entry__reason">${e.agentReason ? `“${esc(e.agentReason)}”` : `<span class="warn">${icon('alert', 14)}No reason given</span>`}</p>
        <div class="entry__outcome">
          ${e.proposedChange
            ? `<div><p class="label">Contract</p><ul class="changes">${e.proposedChange.map((c) => `<li><span aria-hidden="true">+ </span>${change(c)}</li>`).join('')}</ul></div>`
            : `<p><span class="label">Fix</span> <code>${esc(e.suggestedFix)}</code></p>`}
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

// A source is { set } for a built-in dataset's file, or the name of a file the user loaded.
const builtInLabel = (source) => DATASETS[source.set].label;
const sourceName = (source) => (typeof source === 'object' ? builtInLabel(source) : `<code>${esc(source)}</code>`);
const capitalise = (text) => text[0].toUpperCase() + text.slice(1);

export function source(sources) {
  const own = SLOTS.filter((s) => typeof sources[s.kind] === 'string');
  const base = SLOTS.map((s) => sources[s.kind]).find((src) => typeof src === 'object');
  if (!own.length) return `Using ${builtInLabel(base)}. <a href="#data">Load your own files</a>`;
  const list = own.map((s) => `${s.label.toLowerCase()} (${sourceName(sources[s.kind])})`).join(', ');
  const rest = base ? ` ${capitalise(builtInLabel(base))} for the rest.` : '';
  return `Using your ${list}.${rest} <a href="#data">Change files</a>`;
}

// A built-in dataset that failed to load or failed its checks.
export function loadFailure(err, offerDemo, fromFile) {
  const problems = err.problems ?? [];
  return `<div class="load-failure" role="alert">
    <p class="error">${icon('alert', 16)}<span>${esc(err.message)}.${fromFile ? ' Serve the folder over HTTP (npm run serve); file:// cannot fetch JSON.' : ''}</span></p>
    ${problems.length ? `<ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${offerDemo ? `<p><a href="./">Open the demo data instead</a></p>` : ''}
  </div>`;
}

export function loader(sources, loadErrors) {
  return `<div class="panel">${SLOTS.map(({ kind, label, help }) => {
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
          ${icon('upload', 16)}<span>Drop a JSON file here, or <span class="drop__pick">choose a file</span><span class="sr-only"> for the ${label.toLowerCase()}</span></span>
        </label>
        ${
          failed
            ? `<div class="slot__errors" id="${errorsId}">
                <p>${icon('alert', 14)}Couldn’t load <code>${esc(failed.file)}</code>. Still using ${sourceName(sources[kind])}.</p>
                <ul>${failed.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
              </div>`
            : ''
        }
      </div>`;
  }).join('')}</div>`;
}
