import { amend, buildStatus, createSession, exportLog, reject, reviewQueue, setDial } from '../core/session.js';
import * as view from './render.js';

const $ = (sel) => document.querySelector(sel);

let session;
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
}

try {
  const [contract, report, reasons, policy] = await Promise.all(
    ['contract', 'lint-report', 'reasons', 'policy'].map(loadJson),
  );
  session = createSession({ contract, report, reasons, policy });
  bind();
  render();
} catch (err) {
  $('main').innerHTML = `<p class="error" role="alert">${view.esc(err.message)}. Serve the folder over HTTP (npm run serve); file:// cannot fetch JSON.</p>`;
}
