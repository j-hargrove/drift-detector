import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { lintContract } from '../scripts/lint-contract.js';
import { checks } from '../src/core/validate.js';
import { createSession } from '../src/core/session.js';

const contract = JSON.parse(await readFile(new URL('../data/contract.json', import.meta.url), 'utf8'));
const fixture = (rule) => fileURLToPath(new URL(`./fixtures/lint-contract/${rule}/`, import.meta.url));
const now = () => '2026-11-14T12:00:00.000Z';
const lint = (rule) => lintContract({ srcDir: 'src', contract, cwd: fixture(rule), now });

describe('lint-contract: one fixture per rule', () => {
  it('no-hardcoded-color: CSS via stylelint, TSX inline styles via regex, nearest color by RGB', async () => {
    expect(await lint('no-hardcoded-color')).toEqual({
      generatedAt: now(),
      deviations: [
        // Badge.tsx sorts before Card.css, so it gets dev-001. padding: 8 is on the scale, so it's not flagged.
        { id: 'dev-001', rule: 'no-hardcoded-color', file: 'src/components/Badge.tsx', line: 2, snippet: "return <span style={{ color: '#1F2937', padding: 8 }}>{label}</span>;", suggestedToken: 'color.text' },
        // var() and currentColor pass.
        { id: 'dev-002', rule: 'no-hardcoded-color', file: 'src/components/Card.css', line: 3, snippet: 'background-color: #3B82F6;', suggestedToken: 'color.primary' },
        { id: 'dev-003', rule: 'no-hardcoded-color', file: 'src/components/Card.css', line: 4, snippet: 'border: 1px solid #E4E4E7;', suggestedToken: 'color.border' },
        { id: 'dev-004', rule: 'no-hardcoded-color', file: 'src/components/Card.css', line: 6, snippet: 'fill: rgb(30, 64, 175);', suggestedToken: 'color.primary-hover' },
      ],
    });
  });

  it('no-arbitrary-spacing: only off-scale px values, nearest step (ties go up), React numbers as px', async () => {
    expect(await lint('no-arbitrary-spacing')).toEqual({
      generatedAt: now(),
      deviations: [
        // 10px is 2px from both spacing.2 (8px) and spacing.3 (12px); the tie goes to the larger step.
        // margin: 0 16px is on the scale; gap uses a variable.
        { id: 'dev-001', rule: 'no-arbitrary-spacing', file: 'src/components/Button.css', line: 2, snippet: 'padding: 10px;', suggestedToken: 'spacing.3' },
        { id: 'dev-002', rule: 'no-arbitrary-spacing', file: 'src/components/ButtonGroup.tsx', line: 4, snippet: "style={{ display: 'flex', gap: 6, paddingTop: '20px' }}", suggestedToken: 'spacing.2' },
        { id: 'dev-003', rule: 'no-arbitrary-spacing', file: 'src/components/ButtonGroup.tsx', line: 4, snippet: "style={{ display: 'flex', gap: 6, paddingTop: '20px' }}", suggestedToken: 'spacing.4' },
      ],
    });
  });

  it('no-off-contract-variant: literal Button variants outside the contract, suggesting the default variant', async () => {
    expect(await lint('no-off-contract-variant')).toEqual({
      generatedAt: now(),
      deviations: [
        // "secondary" is in the contract; variant={tone} is dynamic; IconButton isn't the contract's component.
        { id: 'dev-001', rule: 'no-off-contract-variant', file: 'src/pages/Settings.tsx', line: 7, snippet: '<Button variant="destructive">Delete account</Button>', suggestedToken: 'variant="primary"' },
        { id: 'dev-002', rule: 'no-off-contract-variant', file: 'src/pages/Settings.tsx', line: 9, snippet: "variant={'danger-outline'}", suggestedToken: 'variant="primary"' },
      ],
    });
  });
});

describe('lint-contract output', () => {
  it('uses exactly the report format, and the app accepts it', async () => {
    for (const rule of ['no-hardcoded-color', 'no-arbitrary-spacing', 'no-off-contract-variant']) {
      const report = await lint(rule);
      expect(Object.keys(report)).toEqual(['generatedAt', 'deviations']);
      report.deviations.forEach((d) => expect(Object.keys(d)).toEqual(['id', 'rule', 'file', 'line', 'snippet', 'suggestedToken']));
      expect(checks.report(report, { contract })).toEqual([]);
      expect(() => createSession({ contract, report, policy: { dials: {} } })).not.toThrow();
    }
  });

  it('writes the report from the command line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lint-contract-'));
    try {
      const out = join(dir, 'lint-report.json');
      const script = fileURLToPath(new URL('../scripts/lint-contract.js', import.meta.url));
      const contractPath = fileURLToPath(new URL('../data/contract.json', import.meta.url));
      const { stdout } = await promisify(execFile)('node', [script, 'src', '--contract', contractPath, '--out', out], { cwd: fixture('no-off-contract-variant') });
      expect(stdout).toMatch(/2 deviations in src/);
      const written = JSON.parse(await readFile(out, 'utf8'));
      expect(written.deviations.map((d) => d.id)).toEqual(['dev-001', 'dev-002']);
      expect(Number.isNaN(Date.parse(written.generatedAt))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
