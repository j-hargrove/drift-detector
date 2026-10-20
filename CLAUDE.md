# Drift Detector

## What this is
A review tool for design-system drift caused by AI agents. Detection is a commodity (shadcn/lint, ui-tokenize, Swatchdog). Everyone else auto-fixes. Auto-fix hides the decision.

Drift Detector shows the human what broke, the agent's stated reason, and lets them decide: is the code wrong (Reject) or the contract wrong (Amend). Every decision is recorded, including the ones the agent absorbed on its own.

## Framework: Set / Explain / Decide / Record
- **Set**: per-rule autonomy dial (auto-fix / ask / block). The screen is called the Autonomy Dial.
- **Explain**: the agent's stated reason on every deviation, with missing reasons flagged.
- **Decide**: Reject (the code is wrong) or Amend (the contract is wrong).
- **Record**: the decision log, including auto-absorbed deviations.

v2 (out of scope for v1):
- **Declare**: the agent states intent before generating.
- **Calibrate**: a confidence signal per deviation.

In the UI, the step names appear only as quiet section labels (Set, Decide, Record, and "Explain · agent's reason" on each card), plus "Set, Explain, Decide, Record." in the intro.

The Reject/Amend decision is the dominant UI element. This is a portfolio piece; the reasoning must be legible to a hiring manager in under a minute.

## Stack and constraints
- Vanilla HTML, CSS, JS (ES modules). No framework. No build step.
- `src/core/` holds pure logic, no DOM. `src/ui/` holds rendering. Keep them separate.
- Vitest for tests on `src/core/` only (dev dependency). Nothing ships to the browser from node_modules (`vercel.json` skips install and build).
- Static deploy to Vercel from `main`.
- No backend, no persistence beyond JSON export. State lives in memory.
- Keep it simple. Don't add abstractions the current phase doesn't need.

## Data model
Four input files in `data/`:

1. `contract.json`: tokens (color, spacing, radius) + one component contract (Button: variants, states, sizes, allowed tokens). **Contains no dial settings**; `createSession` rejects a contract with a `dials` key.
2. `policy.json`: `{ "dials": { rule: "auto-fix" | "ask" | "block" } }`, the default autonomy per rule. Unknown dial values are rejected.
3. `lint-report.json`: deviations, each with `id`, `rule`, `file`, `line`, `snippet`, `suggestedToken`.
4. `reasons.json`: keyed by deviation `id`, value is the agent's stated reason. A missing key means "No reason given" and is visibly flagged.

Contract and policy are separate on purpose. The contract describes the design system; the policy describes how much the agent may decide alone. Amend proposes contract changes only and must never touch policy.

Seed scenario (must satisfy the definition of done):
- `no-hardcoded-color`: 2 deviations, dial = Ask. One has a reason, one has none.
- `no-arbitrary-spacing`: 1 to 2 deviations, dial = Auto-fix.
- `no-off-contract-variant`: 1 deviation, dial = Block.
These are defaults; the user can change any dial.

## Behaviors
- **Auto-fix**: deviation absorbed silently, applies `suggestedToken`, logged with decision `auto-absorbed`. The Autonomy Dial shows a count of auto-absorbed deviations that links to their log entries.
- **Ask**: shown as a review card. Human chooses Reject or Amend.
- **Block**: shown as a review card. A persistent "Build blocked" status stays red until every blocked deviation is resolved.
- **Reject**: code is wrong; logged with the suggested fix.
- **Amend**: contract is wrong; log records the proposed contract change (e.g. "add #3B82F6 to Button.allowedTokens.color").
- Amending a deviation with no agent reason requires a human note. That's the riskiest decision in the app. Enforced in core, not only the UI.
- Changing a dial after decisions are made re-evaluates only undecided deviations.
- A rule with no dial in `policy.json` falls back to **Ask**, never Auto-fix.

## Decision log entry
`id, rule, file, line, snippet, agentReason (or null), dialSetting, decision (auto-absorbed | rejected | amended), suggestedFix (rejected and auto-absorbed only), proposedChange (amend only), note, timestamp`. Export as JSON.

## Decisions so far
- **Policy lives in `policy.json`, not the contract.** Dials are governance over the agent, not part of the design system; keeping them apart means Amend can never loosen its own oversight.
- **Unconfigured rules fall back to Ask.** A rule nobody configured should never be absorbed silently.
- **`suggestedFix` log field.** Reject is "logged with the suggested fix"; `proposedChange` stays amend-only.
- **Auto-absorbed entries keep the agent's reason**, so the log shows what Auto-fix discarded.
- **Light theme only.** Warm off-white background `#f6f3ee`, dark gray text `#2d2b28`. No dark mode, no `prefers-color-scheme`.
- **Visual hierarchy**, heaviest first:
  1. Build status: the only strong colour, and only while blocked. Clear is plain text.
  2. Reject and Amend: the largest interactive elements.
  3. Agent's reason: body text, set off by typography. "No reason given" takes the same position in the warning colour.
  4. Snippet and location: small monospace, quiet.
  5. Metadata (rule id, dial, timestamps): smallest, muted.
- **Reject and Amend buttons are identical** (same outline, size, weight), side by side at every width, so the UI doesn't suggest an answer.
- **Palette and system**, all CSS custom properties: warm neutrals + one accent (`#2f5b8a`, focus/selection/links) + one warning (`#b23a1e`, blocked status and missing reasons). System UI face plus monospace; type scale 13 / 16 / 20 / 32; spacing on an 8px scale. Sections separated by whitespace and thin rules: no cards, coloured borders, shadows, gradients, pills, emoji or uppercase eyebrows.

## Definition of done (v1)
Load seed files. One rule auto-fix, one ask, one block. Review cards, execute one Reject and one Amend. Export a log showing all three dial behaviors and both decisions with reasons.

## Out of scope (v1)
Declare and Calibrate (v2), running a linter in-app, multiple components, visual diff, Figma, persistence.

## Build log (required)
After each phase, append to `BUILD_LOG.md`: what was built, decisions made and why, anything cut, problems hit. Short and factual. This feeds the portfolio case study, so record the reasoning, not just the changes.
