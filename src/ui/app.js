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
import { DIALS } from '../core/session.js';
import { checkFile, sizeProblem } from '../core/validate.js';
import { DATASETS, FILES, datasetFromSearch, loadDataset } from '../core/datasets.js';
import * as view from './render.js';

const $ = (sel) => document.querySelector(sel);

const loaded = new Map(); // built-in dataset name -> its checked inputs, fetched once
let data; // inputs behind the current session
let session;
const sources = {}; // kind -> { set: 'demo' | 'stress' } for a built-in file, or the uploaded file's name
const loadErrors = new Map(); // kind -> { file, problems }
const notes = new Map(); // unsent note drafts, by deviation id
const errors = new Map();
let confirmation = null; // the last Reject/Amend, shown where its card was: { entry, index }
let lastDecisionAt = 0;
// The next card can render under the pointer; a double-click must not decide it too.
const DOUBLE_CLICK_GUARD_MS = 500;
const expanded = new Set(); // undecided cards opened from their row; the first card is always open
let resolvedDone = null; // the last follow-up marked done, shown where it was: { entry, index }
let resolving = null; // the one open "Mark fixed/applied" note form: { id, scope, note }; scope is 'log' or 'follow'
let lastStatus = '';

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load it (${res.status})`);
  return res.text();
}

// A built-in dataset, checked by validate.js like any upload. Throws with `problems` if it fails.
async function builtIn(name) {
  if (!loaded.has(name)) loaded.set(name, await loadDataset(name, fetchText));
  return loaded.get(name);
}

// Start a new review from a built-in dataset: every input comes from it.
function useDataset(name, inputs) {
  startReview({ ...inputs });
  Object.keys(FILES).forEach((kind) => (sources[kind] = { set: name }));
  loadErrors.clear();
}

// Re-rendering replaces the DOM. Focusable elements carry a stable data-focus key,
// so whatever had focus gets it back; `fallback` covers elements that are gone.
function render(fallback) {
  const key = document.activeElement?.dataset?.focus;
  const pending = reviewQueue(session); // blocked first
  const open = followUps(session).length;
  const status = view.status(buildStatus(session), pending[0]?.id);
  if (status !== lastStatus) {
    $('#status').innerHTML = lastStatus = status; // live region: only on change
    $('#bar-status').innerHTML = view.status(buildStatus(session), pending[0]?.id, 'bar');
  }
  // Carry the current tab across the re-render, so its fill doesn't re-animate from nothing on every render.
  const currentStep = $('#steps a[aria-current]')?.dataset.step;
  $('#steps').innerHTML = view.steps({ decide: pending.length, followUps: open, logged: session.log.length }, currentStep);
  $('#stats').innerHTML = view.stats(session);
  $('#hero').innerHTML = view.hero(session);
  $('#dials').innerHTML = view.dials(session);
  $('#queue').innerHTML = view.queue(session, pending, notes, errors, confirmation, expanded);
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

// One offset for both ends of an in-page jump: where a jump lands (html scroll-padding-top, via
// --bar-clearance) and where the scroll-spy reads. The sticky bar wraps on narrow screens, so it's measured.
let navOffset = 0;
function setBarClearance() {
  navOffset = $('.bar').offsetHeight + 8;
  document.documentElement.style.setProperty('--bar-clearance', `${navOffset}px`);
}

// Once the bar has stuck to the top it gets its frosted background and hairline; before that it's clear,
// so the hero's shadow shows through.
function markStuck() {
  const bar = $('.bar');
  bar.classList.toggle('is-stuck', window.scrollY > 0 && bar.getBoundingClientRect().top <= 0);
}

function setCurrentStep(current) {
  for (const link of document.querySelectorAll('#steps a[data-step]')) {
    if (link === current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

// After a tab click the clicked tab is current at once, and the scroll-spy waits until the scroll
// settles (scrollend, or 600ms without a scroll event), so it can't flip to a section passed on the way.
let spyPaused = false;
let spyTimer = 0;
function pauseSpy() {
  spyPaused = true;
  clearTimeout(spyTimer);
  spyTimer = setTimeout(resumeSpy, 600);
}
function resumeSpy() {
  spyPaused = false;
  clearTimeout(spyTimer);
}

// The tab for the section under the sticky bar gets aria-current: the last one whose heading (the
// element a jump lands on) is at or above the offset. The 2px absorbs subpixel rounding.
// At the bottom of the page the last tab is current, since its heading may never reach the bar.
function markCurrentStep() {
  markStuck();
  if (spyPaused) {
    pauseSpy(); // still scrolling: keep waiting
    return;
  }
  const links = [...document.querySelectorAll('#steps a[data-step]')];
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  let current = null;
  if (atBottom) current = links.at(-1);
  else {
    for (const link of links) {
      const heading = document.getElementById(link.dataset.step);
      if (heading && heading.getBoundingClientRect().top <= navOffset + 2) current = link;
    }
  }
  setCurrentStep(current ?? links[0]);
}

// The tab whose section holds an in-page link's target (a card, a log entry, a heading).
function stepFor(target) {
  const section = target.closest('section');
  return [...document.querySelectorAll('#steps a[data-step]')].find(
    (link) => document.getElementById(link.dataset.step)?.closest('section') === section,
  );
}

function renderData() {
  $('#source').innerHTML = view.source(sources);
  $('#loader').innerHTML = view.loader(sources, loadErrors);
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOTION_MS = 180;

// Rendering replaces the DOM, so transitions can't run on their own. Each of these starts the new
// element where the old one was and lets it settle (FLIP), unless reduced motion is on.

// A decided card or resolved follow-up collapses into its confirmation line.
function collapseInto(el, fromHeight) {
  if (!el || reducedMotion() || !fromHeight) return;
  const to = el.offsetHeight;
  el.animate(
    [{ height: `${fromHeight}px`, opacity: 0.4, overflow: 'hidden' }, { height: `${to}px`, opacity: 1, overflow: 'hidden' }],
    { duration: MOTION_MS, easing: 'ease' },
  );
}

// The dial's selected fill slides from the old segment to the new one (150ms, in CSS).
function slideDial(rule, fromIndex) {
  const control = document.querySelector(`fieldset[data-dial="${CSS.escape(rule)}"]`);
  if (!control || reducedMotion() || fromIndex < 0) return;
  const to = control.style.getPropertyValue('--pos');
  control.classList.add('is-instant');
  control.style.setProperty('--pos', fromIndex);
  void control.offsetWidth; // commit the start position
  control.classList.remove('is-instant');
  control.style.setProperty('--pos', to);
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
  expanded.clear();
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

// Always back to the demo, whichever set the page opened with; the URL drops ?data= to match.
async function onReset() {
  let demo;
  try {
    demo = await builtIn('demo');
  } catch (err) {
    announce(`Couldn’t reset. ${err.message}.`);
    return;
  }
  useDataset('demo', demo);
  const url = new URL(location.href);
  if (url.searchParams.has('data')) {
    url.searchParams.delete('data');
    history.replaceState(null, '', url);
  }
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
  const cardHeight = document.getElementById(`review-${id}`)?.offsetHeight;
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
  collapseInto($('.decided[data-decided]'), cardHeight);
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
  const itemHeight = form.closest('li')?.offsetHeight;
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
    collapseInto($('.follow-ups__done'), itemHeight);
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
    const from = DIALS.indexOf(session.dials[input.dataset.rule]);
    session = setDial(session, input.dataset.rule, input.value);
    render();
    slideDial(input.dataset.rule, from);
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
    if (button) return onDecide(button);
    // A row opens into its full card, which takes focus; the card's chevron folds it back into the row.
    const open = e.target.closest('button[data-expand]');
    if (open) {
      expanded.add(open.dataset.expand);
      render();
      document.getElementById(`review-${open.dataset.expand}`)?.focus();
      return;
    }
    const close = e.target.closest('button[data-collapse]');
    if (close) {
      expanded.delete(close.dataset.collapse);
      render();
      focusKey(`expand:${close.dataset.collapse}`)()?.focus();
    }
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
    const step = stepFor(target);
    if (step) {
      setCurrentStep(step);
      pauseSpy();
    }
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', link.getAttribute('href'));
  });
  $('#export').addEventListener('click', onExport);
  bindLoader();
  window.addEventListener('scroll', markCurrentStep, { passive: true });
  window.addEventListener('scrollend', resumeSpy);
  window.addEventListener('resize', () => {
    markOverflowingSnippets();
    setBarClearance();
    markCurrentStep();
  });
}

// ?data=stress opens the stress test set; anything else opens the demo.
const startSet = datasetFromSearch(location.search);
try {
  useDataset(startSet, await builtIn(startSet));
  bind();
  render();
} catch (err) {
  document.body.classList.add('is-load-failed'); // nothing to review: hide the empty hero, stats, tabs and the dead "Load your files" link
  $('main').innerHTML = view.loadFailure(err, startSet !== 'demo', location.protocol === 'file:');
}
