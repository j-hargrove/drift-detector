import {
  amend,
  buildStatus,
  createSession,
  exportLog,
  followUps,
  reject,
  reopen,
  resolve,
  reviewQueue,
  setDial,
} from '../core/session.js';
import { checkFile, sizeProblem } from '../core/validate.js';
import * as view from './render.js';

const $ = (sel) => document.querySelector(sel);

const DEMO_FILES = { contract: 'contract', policy: 'policy', report: 'lint-report', reasons: 'reasons' };

let demo; // demo inputs, fetched once
let data; // inputs behind the current session
let session;
const sources = {}; // kind -> 'demo' | uploaded file name
const loadErrors = new Map(); // kind -> { file, problems }
const notes = new Map(); // unsent note drafts, by deviation id
const errors = new Map();
let confirmation = null; // the last Reject/Amend, shown where its card was: { entry, index }
let lastDecisionAt = 0;
// The next card can render under the pointer; a double-click must not decide it too.
const DOUBLE_CLICK_GUARD_MS = 500;
let resolvedDone = null; // the last follow-up marked done, shown where it was: { entry, index }
let resolving = null; // the one open "Mark fixed/applied" note form: { id, scope, note }; scope is 'log' or 'follow'
let lastStatus = '';

async function loadJson(name) {
  const res = await fetch(`data/${name}.json`);
  if (!res.ok) throw new Error(`Could not load data/${name}.json (${res.status})`);
  return res.json();
}

// Re-rendering replaces the DOM. Focusable elements carry a stable data-focus key,
// so whatever had focus gets it back; `fallback` covers elements that are gone.
function render(fallback) {
  const key = document.activeElement?.dataset?.focus;
  const pending = reviewQueue(session); // blocked first
  const open = followUps(session).length;
  const status = view.status(buildStatus(session), pending[0]?.id);
  if (status !== lastStatus) $('#status').innerHTML = lastStatus = status; // live region: only on change
  $('#steps').innerHTML = view.steps(pending.length, open);
  $('#dials').innerHTML = view.dials(session);
  $('#queue').innerHTML = view.queue(session, pending, notes, errors, confirmation);
  $('#queue-count').textContent = pending.length;
  $('#follow-ups').innerHTML = view.followUps(session.log, resolving, resolvedDone);
  $('#follow-count').textContent = open;
  $('#absorbed').innerHTML = view.absorbedSummary(session);
  $('#log').innerHTML = view.log(session.log, resolving, session);
  renderData();
  markOverflowingSnippets();
  setBarClearance();
  markCurrentStep();
  if (key) (document.querySelector(`[data-focus="${CSS.escape(key)}"]`) ?? fallback?.())?.focus();
}

// A snippet that scrolls sideways gets a visible cue and becomes keyboard-scrollable.
function markOverflowingSnippets() {
  for (const pre of document.querySelectorAll('[data-snippet]')) {
    const overflows = pre.scrollWidth > pre.clientWidth;
    pre.nextElementSibling.hidden = !overflows;
    if (overflows) pre.setAttribute('tabindex', '0');
    else pre.removeAttribute('tabindex');
  }
}

// The sticky bar wraps to two rows on narrow screens; in-page jumps and focus clear its real height.
function setBarClearance() {
  const gap = 16;
  document.documentElement.style.setProperty('--bar-clearance', `${$('.bar').offsetHeight + gap}px`);
}

// The tab for the section under the sticky bar gets aria-current.
function markCurrentStep() {
  const line = $('.bar').getBoundingClientRect().bottom + 1;
  let current = null;
  for (const link of document.querySelectorAll('#steps a[data-step]')) {
    const section = document.getElementById(link.dataset.step)?.closest('section');
    if (section && section.getBoundingClientRect().top <= line) current = link;
  }
  current ??= $('#steps a[data-step]');
  for (const link of document.querySelectorAll('#steps a[data-step]')) {
    if (link === current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

function renderData() {
  $('#source').innerHTML = view.source(sources);
  $('#loader').innerHTML = view.loader(sources, loadErrors);
}

const announce = (message) => {
  $('#announce').textContent = message;
};

const remainingText = () => {
  const n = reviewQueue(session).length;
  return n ? `${n} left to decide.` : 'Nothing left to decide.';
};

// Start a fresh review from a new set of inputs. Throws if they don't fit together.
function startReview(next) {
  session = createSession(next);
  data = next;
  notes.clear();
  errors.clear();
  resolving = null;
  confirmation = null;
  resolvedDone = null;
}

async function onFile(kind, file) {
  const label = view.SLOTS.find((s) => s.kind === kind).label.toLowerCase();
  const fail = (problems) => {
    loadErrors.set(kind, { file: file.name, problems });
    render();
    announce(`Couldn’t load ${file.name}. ${problems[0]}`);
  };

  const tooBig = sizeProblem(file.size);
  if (tooBig) return fail([tooBig]);
  const { value, problems } = checkFile(kind, await file.text(), { contract: data.contract });
  if (problems.length) return fail(problems);
  try {
    startReview({ ...data, [kind]: value });
  } catch (err) {
    return fail([err.message]);
  }
  sources[kind] = file.name;
  loadErrors.delete(kind);
  render();
  announce(`Loaded ${file.name} as the ${label}. Started a new review.`);
}

function onReset() {
  startReview({ ...demo });
  Object.keys(DEMO_FILES).forEach((kind) => (sources[kind] = 'demo'));
  loadErrors.clear();
  render();
  announce('Reset to demo data. Started a new review.');
}

function onDecide(button) {
  if (Date.now() - lastDecisionAt < DOUBLE_CLICK_GUARD_MS) {
    // The ignored press still focused the button under the pointer; put focus back so Enter can't decide it.
    $('[data-focus="decided-link"]')?.focus();
    return;
  }
  const { id, action } = button.dataset;
  const note = notes.get(id) ?? '';
  const index = reviewQueue(session).findIndex((d) => d.id === id);
  const deviation = session.deviations.find((d) => d.id === id);
  try {
    session = (action === 'reject' ? reject : amend)(session, id, { note });
  } catch (err) {
    // Typically Amend with no agent reason and no note: say why, then put the cursor in the note.
    errors.set(id, err.message);
    render();
    document.querySelector(`[data-focus="note:${CSS.escape(id)}"]`)?.focus();
    return;
  }
  notes.delete(id);
  errors.delete(id);
  confirmation = { entry: session.log.find((e) => e.id === id), index };
  lastDecisionAt = Date.now();
  // The card is gone and the next one would render in exactly its place, so nothing would seem to happen.
  // The confirmation takes the card's place instead, and focus goes to its link: visible, and one Tab from the next card.
  render(() => $('[data-focus="decided-link"]'));
  announce(`${action === 'reject' ? 'Rejected' : 'Amended'}: ${view.shortRef(deviation)}. Moved to Follow-ups. ${remainingText()}`);
}

const focusKey = (key) => () => document.querySelector(`[data-focus="${CSS.escape(key)}"]`);

function openResolve(id, scope) {
  resolving = { id, scope, note: '' };
  render();
  focusKey(`resolve-note:${id}:${scope}`)()?.focus();
}

function cancelResolve() {
  const { id, scope } = resolving;
  resolving = null;
  render();
  focusKey(`resolve:${id}:${scope}`)()?.focus();
}

function onResolve(form) {
  const { id, scope } = resolving;
  const entry = session.log.find((e) => e.id === id);
  const index = [...document.querySelectorAll('[data-resolve][data-scope="follow"], [data-resolve-form][data-scope="follow"]')].indexOf(form);
  session = resolve(session, id, { note: resolving.note });
  resolving = null;
  if (scope === 'log') {
    resolvedDone = null;
    render();
    focusKey(`reopen:${id}`)()?.focus();
  } else {
    // The done item leaves Follow-ups. As with Reject/Amend, a confirmation takes its place and gets focus,
    // so the list doesn't silently shift under the pointer.
    resolvedDone = { entry, index };
    render(() => $('[data-focus="resolved-link"]'));
    $('[data-focus="resolved-link"]')?.focus();
  }
  announce(`${view.resolvedText(entry)} Moved to the decision log.`);
}

function onReopen(id) {
  const entry = session.log.find((e) => e.id === id);
  session = reopen(session, id);
  if (resolving?.id === id) resolving = null;
  if (resolvedDone?.entry.id === id) resolvedDone = null;
  render();
  focusKey(`resolve:${id}:log`)()?.focus();
  announce(`Reopened: ${view.shortRef(entry)}. ${entry.decision === 'rejected' ? 'Code fix' : 'Contract change'} pending again.`);
}

function bindResolution(container) {
  container.addEventListener('click', (e) => {
    const open = e.target.closest('button[data-resolve]');
    if (open) return openResolve(open.dataset.resolve, open.dataset.scope);
    if (e.target.closest('button[data-resolve-cancel]')) return cancelResolve();
    const again = e.target.closest('button[data-reopen]');
    if (again) onReopen(again.dataset.reopen);
  });
  container.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-resolve-form]');
    if (!form) return;
    e.preventDefault();
    onResolve(form);
  });
  // Keep the draft without re-rendering, which would steal focus.
  container.addEventListener('input', (e) => {
    if (e.target.matches('[data-resolve-note]') && resolving) resolving.note = e.target.value;
  });
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target.closest('form[data-resolve-form]')) cancelResolve();
  });
}

function onExport() {
  const blob = new Blob([JSON.stringify(exportLog(session), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: 'drift-decision-log.json' });
  a.click();
  URL.revokeObjectURL(url);
}

function bindLoader() {
  const loader = $('#loader');

  loader.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-file]');
    if (input?.files.length) onFile(input.dataset.file, input.files[0]);
  });

  loader.addEventListener('dragover', (e) => {
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.add('is-over');
  });

  loader.addEventListener('dragleave', (e) => {
    const zone = e.target.closest('[data-drop]');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('is-over');
  });

  loader.addEventListener('drop', (e) => {
    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('is-over');
    const [file] = e.dataTransfer.files;
    if (file) onFile(zone.dataset.drop, file);
  });

  // A file dropped anywhere else would make the browser navigate away from the review.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  $('#reset').addEventListener('click', onReset);
}

function bind() {
  $('#dials').addEventListener('change', (e) => {
    const input = e.target.closest('input[data-rule]');
    if (!input) return;
    const before = session.log.length;
    session = setDial(session, input.dataset.rule, input.value);
    render();
    const change = session.log.length - before;
    const n = Math.abs(change);
    const plural = `deviation${n === 1 ? '' : 's'}`;
    const label = input.closest('.dial').querySelector('h3')?.textContent ?? input.dataset.rule;
    announce(
      `${label} set to ${input.nextElementSibling.textContent}.` +
        (change > 0 ? ` Auto-fix absorbed ${n} ${plural}. ${remainingText()}` : '') +
        (change < 0 ? ` ${n} ${plural} returned to Needs your decision. ${remainingText()}` : ''),
    );
  });

  $('#queue').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (button) onDecide(button);
  });

  // Update the draft and the Amend button in place; a full render would steal focus.
  $('#queue').addEventListener('input', (e) => {
    const field = e.target.closest('textarea[data-note]');
    if (!field) return;
    const id = field.dataset.note;
    notes.set(id, field.value);
    const deviation = session.deviations.find((d) => d.id === id);
    const amendButton = field.closest('.review').querySelector('[data-action="amend"]');
    if (deviation.agentReason === null && !field.value.trim()) amendButton.setAttribute('aria-disabled', 'true');
    else amendButton.removeAttribute('aria-disabled');
  });

  bindResolution($('#log'));
  bindResolution($('#follow-ups'));
  // In-page links (build status, step bar) move focus, not just the scroll position.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-blocked-link], a[data-step]');
    if (!link) return;
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    e.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
    history.replaceState(null, '', link.getAttribute('href'));
  });
  $('#export').addEventListener('click', onExport);
  bindLoader();
  window.addEventListener('scroll', markCurrentStep, { passive: true });
  window.addEventListener('resize', () => {
    markOverflowingSnippets();
    setBarClearance();
    markCurrentStep();
  });
}

try {
  const entries = await Promise.all(
    Object.entries(DEMO_FILES).map(async ([kind, file]) => [kind, await loadJson(file)]),
  );
  demo = Object.fromEntries(entries);
  Object.keys(DEMO_FILES).forEach((kind) => (sources[kind] = 'demo'));
  startReview({ ...demo });
  bind();
  render();
} catch (err) {
  $('main').innerHTML = `<p class="error" role="alert">${view.esc(err.message)}. Serve the folder over HTTP (npm run serve); file:// cannot fetch JSON.</p>`;
}
