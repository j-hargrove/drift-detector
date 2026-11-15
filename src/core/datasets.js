// Built-in datasets: the demo (default) and the stress test set (?data=stress).
// Pure: fetching is passed in, so this runs in tests and in the browser alike.
import { checkFile } from './validate.js';
import { createSession } from './session.js';

export const DATASETS = {
  demo: { dir: 'data', label: 'demo data' },
  stress: { dir: 'data/stress', label: 'stress test data' },
};

// The four input files, in check order: the report is checked against the contract.
export const FILES = { contract: 'contract', policy: 'policy', report: 'lint-report', reasons: 'reasons' };

// ?data=stress picks the stress set. No param, or a value we don't know, is the demo.
export function datasetFromSearch(search) {
  const name = new URLSearchParams(search).get('data');
  return Object.hasOwn(DATASETS, name ?? '') ? name : 'demo';
}

// Loads one dataset's four files through the same checks as a user's upload. Resolves to the
// inputs, or rejects with an error whose `problems` lists every problem by file path.
// `fetchText(path)` returns the file's text, or throws.
export async function loadDataset(name, fetchText) {
  const { dir } = DATASETS[name];
  const texts = await Promise.all(
    Object.entries(FILES).map(async ([kind, file]) => {
      const path = `${dir}/${file}.json`;
      try {
        return [kind, path, await fetchText(path), null];
      } catch (err) {
        return [kind, path, null, err.message];
      }
    }),
  );
  const inputs = {};
  const problems = [];
  for (const [kind, path, text, fetchError] of texts) {
    if (fetchError) {
      problems.push(`${path}: ${fetchError}`);
      continue;
    }
    const checked = checkFile(kind, text, { contract: inputs.contract });
    if (checked.problems.length) checked.problems.forEach((p) => problems.push(`${path}: ${p}`));
    else inputs[kind] = checked.value;
  }
  if (!problems.length) {
    try {
      createSession(inputs); // the files must also fit together
    } catch (err) {
      problems.push(`${dir}/: ${err.message}`);
    }
  }
  if (problems.length) {
    const err = new Error(`The ${DATASETS[name].label} didn’t pass its checks`);
    err.problems = problems;
    throw err;
  }
  return inputs;
}
