// Plain-language checks for user-supplied input files. Each check returns a
// list of problems; an empty list means the file can be loaded.

import { DIALS } from './session.js';

export const MAX_FILE_BYTES = 1_000_000;
const MAX_PROBLEMS = 8;
const DEVIATION_TEXT_FIELDS = ['id', 'rule', 'file', 'snippet', 'suggestedToken'];

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const quoteList = (keys) => {
  const q = keys.map((k) => `"${k}"`);
  return q.length === 1 ? q[0] : `${q.slice(0, -1).join(', ')} and ${q.at(-1)}`;
};

export const checks = {
  contract(c) {
    if (!isObject(c)) return ['The contract should be a JSON object, starting with {.'];
    const problems = [];
    if ('dials' in c) {
      problems.push('This contract contains dial settings ("dials"). Dials belong in the policy file, so remove them from the contract.');
    }
    if (!isObject(c.tokens)) problems.push('The contract has no "tokens" section.');
    const comp = c.component;
    if (!isObject(comp)) {
      problems.push('The contract has no "component" section describing the component, for example the Button.');
    } else {
      if (!isText(comp.name)) problems.push('The component needs a "name", for example "Button".');
      if (!Array.isArray(comp.variants) || !comp.variants.every(isText)) {
        problems.push('"component.variants" should be a list of variant names, for example ["primary", "secondary"].');
      }
      if (!isObject(comp.allowedTokens)) problems.push('The component needs an "allowedTokens" section.');
    }
    return problems;
  },

  policy(p) {
    if (!isObject(p)) return ['The policy should be a JSON object, starting with {.'];
    if (!isObject(p.dials)) {
      return ['The policy needs a "dials" section that sets each rule to "auto-fix", "ask" or "block".'];
    }
    return Object.entries(p.dials)
      .filter(([, dial]) => !DIALS.includes(dial))
      .map(([rule, dial]) => `Rule "${rule}" is set to ${JSON.stringify(dial)}. Use "auto-fix", "ask" or "block".`);
  },

  report(r) {
    if (!isObject(r)) return ['The lint report should be a JSON object, starting with {.'];
    if (!Array.isArray(r.deviations)) return ['The lint report needs a "deviations" list.'];
    const problems = [];
    const seen = new Set();
    r.deviations.forEach((d, i) => {
      const name = isObject(d) && isText(d.id) ? `Deviation "${d.id}"` : `Deviation ${i + 1}`;
      if (!isObject(d)) {
        problems.push(`${name} should be an object with id, rule, file, line, snippet and suggestedToken.`);
        return;
      }
      const missing = DEVIATION_TEXT_FIELDS.filter((k) => !isText(d[k]));
      if (missing.length) problems.push(`${name} is missing ${quoteList(missing)}.`);
      if (!Number.isInteger(d.line) || d.line < 1) problems.push(`${name} needs a "line" that is a whole number, 1 or more.`);
      if (isText(d.id)) {
        if (seen.has(d.id)) problems.push(`The id "${d.id}" is used more than once. Each deviation needs its own id.`);
        seen.add(d.id);
      }
    });
    return problems;
  },

  reasons(r) {
    if (!isObject(r)) {
      return ['The reasons file should be a JSON object that maps deviation ids to reasons, for example {"dev-001": "…"}.'];
    }
    return Object.entries(r)
      .filter(([, reason]) => reason !== null && typeof reason !== 'string')
      .map(([id]) => `The reason for "${id}" should be text.`);
  },
};

export function parseJson(text) {
  try {
    return { value: JSON.parse(text), problems: [] };
  } catch (err) {
    return { value: undefined, problems: [jsonProblem(text, err)] };
  }
}

// Parse and check one file. `value` is set only when there are no problems.
export function checkFile(kind, text) {
  const parsed = parseJson(text);
  if (parsed.problems.length) return parsed;
  const problems = cap(checks[kind](parsed.value));
  return { value: problems.length ? undefined : parsed.value, problems };
}

export function sizeProblem(bytes) {
  if (bytes <= MAX_FILE_BYTES) return null;
  return `This file is ${(bytes / 1_000_000).toFixed(1)} MB. The limit is 1 MB.`;
}

function jsonProblem(text, err) {
  if (!text.trim()) return 'This file is empty.';
  const pos = Number(/position (\d+)/.exec(err.message)?.[1]);
  if (!Number.isFinite(pos)) return "This isn't valid JSON. Look for a missing comma, quote or bracket.";
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const column = pos - before.lastIndexOf('\n');
  return `This isn't valid JSON. The problem is near line ${line}, column ${column}. Look for a missing comma, quote or bracket.`;
}

function cap(problems) {
  if (problems.length <= MAX_PROBLEMS) return problems;
  return [...problems.slice(0, MAX_PROBLEMS), `…and ${problems.length - MAX_PROBLEMS} more.`];
}
