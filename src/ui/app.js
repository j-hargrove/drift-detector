import { amend, buildStatus, createSession, exportLog, reject, reviewQueue, setDial } from '../core/session.js';
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

async function loadJson(name) {
  const res = await fetch(`data/${name}.json`);
  if (!res.ok) throw new Error(`Could not load data/${name}.json (${res.status})`);
  return res.json();
}

function render() {
  $('#status').innerHTML = view.status(buildStatus(session));
  $('#dials').innerHTML = view.dials(session);
  $('#queue').innerHTML = view.queue(session, reviewQueue(session), notes, errors);
  $('#queue-title').textContent = `Needs your decision (${reviewQueue(session).length})`;
  $('#amendments').innerHTML = view.amendments(session.log);
  $('#log').innerHTML = view.log(session.log);
  renderData();
}

function renderData() {
  $('#source').innerHTML = view.source(sources);
  $('#loader').innerHTML = view.loader(sources, loadErrors);
}

const announce = (message) => {
  $('#announce').textContent = message;
};

// Start a fresh review from a new set of inputs. Throws if they don't fit together.
function startReview(next) {
  session = createSession(next);
  data = next;
  notes.clear();
  errors.clear();
}

async function onFile(kind, file) {
  const label = view.SLOTS.find((s) => s.kind === kind).label.toLowerCase();
  const fail = (problems) => {
    loadErrors.set(kind, { file: file.name, problems });
    renderData();
    announce(`Couldn’t load ${file.name}. ${problems[0]}`);
  };

  const tooBig = sizeProblem(file.size);
  if (tooBig) return fail([tooBig]);
  const { value, problems } = checkFile(kind, await file.text());
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
  const { id, action } = button.dataset;
  const note = notes.get(id) ?? '';
  try {
    session = (action === 'reject' ? reject : amend)(session, id, { note });
    notes.delete(id);
    errors.delete(id);
  } catch (err) {
    errors.set(id, err.message);
  }
  render();
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
    session = setDial(session, input.dataset.rule, input.value);
    render();
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
    amendButton.disabled = deviation.agentReason === null && !field.value.trim();
  });

  $('#export').addEventListener('click', onExport);
  bindLoader();
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
