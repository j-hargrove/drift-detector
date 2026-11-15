# Drift Detector

## What this is
A review tool for design-system drift caused by AI agents. Detection is a commodity (shadcn/lint, ui-tokenize, Swatchdog). Everyone else auto-fixes. Auto-fix hides the decision.

Drift Detector shows the human what broke, the agent's stated reason, and lets them decide: is the code wrong (Reject) or the contract wrong (Amend). Every decision is recorded, including the ones the agent absorbed on its own.

## Framework: Set / Explain / Decide / Record
- **Set**: per-rule autonomy dial (auto-fix / ask / block). The screen is called the Autonomy Dial.
- **Explain**: the agent's stated reason on every deviation, with missing reasons flagged.
- **Decide**: Reject (the code is wrong) or Amend (the contract is wrong).
- **Record**: the decision log, including auto-absorbed deviations. Reject and Amend entries track whether the code fix or contract change has actually happened (Resolve).

v2 (out of scope for v1):
- **Declare**: the agent states intent before generating.
- **Calibrate**: a confidence signal per deviation.

In the UI, the steps appear as tabs in a sticky bar under the intro, beside the build status: in-page links with live counts, `Set · Decide (n) · Follow-ups (n) · Record`. The tab for the section under the bar is marked `aria-current="location"`. They are links, not an ARIA tablist, because they jump within one page rather than switching panels. Follow-ups is the Resolve stage, not a framework step. Explain has no section of its own; it's the "Why the agent did it" line on every card. Sections have no eyebrow labels; the step bar links to their headings.

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
3. `lint-report.json`: deviations, each with `id`, `rule`, `file`, `line`, `snippet`, `suggestedToken`, and optionally `alsoAllowTokens` (token paths an Amend must also allow, e.g. `["color.danger"]` for a destructive variant). Each path must exist in the contract; `validate.js` checks the shape and, given the contract in use, existence, and `createSession` refuses a mismatch.
4. `reasons.json`: keyed by deviation `id`, value is the agent's stated reason. A missing key means "No reason given" and is visibly flagged.

The demo files load by default. Users can load their own version of any of the four files (file picker or drag and drop, one slot per file). Each file is checked by `src/core/validate.js` before use, and problems are shown inline in plain language; a file with problems is not applied. Loading a file starts a new review. "Reset to demo data" restores all four.

Contract and policy are separate on purpose. The contract describes the design system; the policy describes how much the agent may decide alone. Amend proposes contract changes only and must never touch policy.

Seed scenario (must satisfy the definition of done):
- `no-hardcoded-color`: 2 deviations, dial = Ask. One has a reason, one has none.
- `no-arbitrary-spacing`: 1 to 2 deviations, dial = Auto-fix.
- `no-off-contract-variant`: 1 deviation, dial = Block.
These are defaults; the user can change any dial.

## Behaviors
- **Auto-fix**: deviation absorbed silently, applies `suggestedToken`, logged with decision `auto-absorbed`. The Autonomy Dial shows a count of auto-absorbed deviations that links to their log entries.
  - A deviation with **no agent reason is never auto-absorbed**. It stays in Decide under any dial, and its card says "No agent reason, so a person has to decide." Its log entry records `dialSetting: "auto-fix"`.
  - Deviations absorbed because a dial was turned to Auto-fix **during the session** (not by the loaded policy) return to Decide if that dial is moved to Ask or Block. Their auto-absorbed entries are removed. Policy-absorbed deviations stay absorbed, and Reject/Amend decisions never move.
- **Ask**: shown as a review card. Human chooses Reject or Amend.
- **Block**: shown as a review card. A persistent "Build blocked" status stays red until every blocked deviation is resolved. While blocked, the badge is a link that scrolls to and focuses the first blocking card. It reads "Build blocked · N" so the sticky bar stays one row on desktop. The count is `aria-hidden`, and screen readers get the full sentence instead ("1 blocked deviation needs a decision").
- **Reject**: code is wrong; logged with the suggested fix.
- **Amend**: contract is wrong; log records every proposed contract change as a list (e.g. `["add \"destructive\" to Button.variants", "add color.danger to Button.allowedTokens.color"]`). Extra tokens come from `alsoAllowTokens`; ones the component already allows are skipped.
- Amending a deviation with no agent reason requires a human note. That's the riskiest decision in the app. Enforced in core, not only the UI.
- After Mark fixed / Mark applied in Follow-ups, the same kind of confirmation takes the item's place ("Resolved: contract change in Settings.tsx:42. Moved to the decision log.", linking to the log entry), gets focus, and is announced through the polite live region. Resolving from the log just flips the chip.
- After Reject or Amend, a confirmation ("Rejected: … Moved to Follow-ups as a code fix to do.") takes the decided card's place, with a link to Follow-ups, and gets focus. It stays until the next decision. A second Reject/Amend within 500ms of a decision is ignored (double-click guard), and focus goes back to the confirmation.
- Changing a dial after decisions are made re-evaluates only undecided deviations.
- A rule with no dial in `policy.json` falls back to **Ask**, never Auto-fix.

## Review card anatomy
Top to bottom:
1. **Title**: a plain-language flag, readable by a designer who doesn't read code and a developer who doesn't know the design system, e.g. "Fill #3B82F6 is a shade off color.primary (#2563EB)". Generated by `src/core/explain.js` (`flagTitle`) from the contract and the lint data.
2. **Meta line** (small): mode · rule name · file:line. No rule id.
3. **Snippet** on an ice block. It scrolls sideways rather than wrapping; when it overflows, a "The line continues. Scroll sideways to read it all." line appears under it and the snippet becomes keyboard-focusable.
4. Two labelled lines: **Why it was flagged** (the contract rule in plain language, `flagRule`) and **Why the agent did it** (the agent's reason, or "No reason given" in `--danger`).
5. **Preview**: the deviation drawn from contract tokens in pure HTML/CSS (`src/core/preview.js` builds the data, `render.js` draws it). Small labels under each drawing: "Agent built", "If you Reject", "If you Amend".
   - Variant flags: three drawn buttons with the snippet's label. Agent built falls back to the default variant (no contract style yet); Reject draws the suggested variant; Amend draws the new variant with its `alsoAllowTokens` color (destructive in `color.danger`).
   - Color flags: two swatches with hex, agent vs token. The agent's is kept if you Amend.
   - Spacing flags: a drawn button with its padding (or two buttons with their gap) at 2×, the content box dashed and a measured bracket, agent px vs token px.
   - Drawn colors come from the contract, so they are the only colors outside the palette. Only hex and px values reach a style attribute.
6. **Reject | Amend**. Each button has two lines: the verb with its meaning ("Reject · The code is wrong"), then the consequence ("Code becomes color.primary #2563EB"), one line per contract change. Code tokens are `nowrap`: a line breaks only at a space, before a token, never inside one. Under 640px a half-width button is narrower than the longest token, so the consequences show full-width under the buttons instead (`aria-hidden`; the in-button copy stays in each button's accessible name). Then the note.

Each card is white (`--surface`) on the warm page, 16px radius, the soft two-layer `--shadow`, no border, 24px padding (16px under 640px), 24px between cards. Under 640px the preview stacks one outcome per row, drawing beside its label. After a decision, the confirmation band takes the card's place with the same 24px gap.

## Page order
Masthead (title, intro, stat strip, data source) → sticky bar (step tabs, build status) → Autonomy Dial → Needs your decision → Follow-ups (every pending Reject code fix and Amend contract change, with Mark fixed / Mark applied; done items leave) → Decision log (auto-fix summary line at the top, then entries, Export) → Your data.

Decision log entries lead with the same plain-language title as their card. Decision, dial and time come next, then file path and id as metadata. The stat strip is four tiles (Found / To decide / Absorbed / Blocked): 36px bold tabular numerals over 13px muted labels, updated on every render. To decide is the strip's accent tile; Blocked turns red while it's above 0. 2×2 under 640px. The Autonomy Dial is one pill-shaped segmented control per rule, and the help text lines up with its left edge. Content sits in a 760px reading column.

## Decision log entry
`id, rule, file, line, snippet, agentReason (or null), dialSetting, decision (auto-absorbed | rejected | amended), suggestedFix (rejected and auto-absorbed only), proposedChange (amend only; a list of every contract change), note, timestamp, resolution (rejected and amended only)`. Export as JSON.

`resolution` is `{ status: "pending" | "resolved", at, note }`. New Reject and Amend entries start `pending` with `at` and `note` null. `resolve` sets `resolved`, the time and an optional note; `reopen` returns it to `pending` and clears both. Auto-absorbed entries have no `resolution`: the agent already applied the token, so there's nothing to follow up.

## Decisions so far
- **Policy lives in `policy.json`, not the contract.** Dials are governance over the agent, not part of the design system; keeping them apart means Amend can never loosen its own oversight.
- **Unconfigured rules fall back to Ask.** A rule nobody configured should never be absorbed silently.
- **`suggestedFix` log field.** Reject is "logged with the suggested fix"; `proposedChange` stays amend-only.
- **Auto-absorbed entries keep the agent's reason**, so the log shows what Auto-fix discarded.
- **Light theme only.** Paper background `#F2EFEA`, ink text `#0D0D0D`. No dark mode, no `prefers-color-scheme`.
- **One accent, as a fill.** Slate is the one accent, used as a solid fill with white text (5.14:1) for one hero element per section: the To decide stat tile, the selected dial segment, Export JSON. Everything else is neutral (ink, muted olive, paper, white). Red fills only signal blocking (Build blocked, the Blocked tile, the selected Block segment). No left-border stripes.
- **Visual hierarchy**, heaviest first:
  1. Stat strip and build status: big numerals; red only while blocked.
  2. Reject and Amend: the largest interactive elements (24px verbs).
  3. The preview and the agent's reason. "No reason given" takes the reason's position in `--danger`.
  4. Snippet and location: small monospace, quiet.
  5. Metadata (rule id, dial, timestamps): smallest, muted.
- **Reject and Amend buttons are identical** (same neutral outline, fill, size, weight; never the accent), side by side at every width, so the UI doesn't suggest an answer. Decide therefore has no accent element.
- **Palette: Clarity.** Paper `#F2EFEA`, ice `#DFE5F3`, slate `#557373`, olive-dark `#272401`, ink `#0D0D0D`, plus one muted red and one muted green. Every color in `styles.css` is a custom property; no color values outside `:root`. Contrast ratios are listed in `BUILD_LOG.md` (Clarity re-theme).
  - `--bg` `#F2EFEA` (paper): the warm page, preview stages, and Reject/Amend and the note field inside cards. `--surface` `#FFFFFF`: cards, stat tiles, the dial track, the resolved chip background.
  - `--text` `#0D0D0D` (ink). `--text-muted` `#706E57`: 4.51:1 on `--bg`, 5.18:1 on white. It's only 4.10:1 on ice, so it's never used on `--tint`; text there is `--text`. Also the neutral outline for Reject/Amend, the dial track and inputs.
  - `--accent` `#557373` (slate): the one accent fill (white text 5.14:1) and the focus ring. Never small text on `--bg` (4.48:1).
  - `--accent-text` `#4A6666`: links (5.41:1 on paper, 6.21:1 on white, 4.92:1 on ice).
  - `--tint` `#DFE5F3` (ice): code snippets, confirmation band, auto-fix summary line, pending chip. Text on ice is `--text` or `--accent-text`, never `--text-muted`.
  - `--success` `#44704C` (muted green): resolved chip text and border only (5.73:1 on white). The only green.
  - `--danger` `#9B3B2B`: Build blocked, the Blocked tile, the selected Block segment, missing agent reasons, validation errors. White on it 6.88:1. The only red.
  - `--rule` `#C9C6BB`: thin section rules, drop-zone outlines. Decorative only; never the only cue for a control.
  - `--shadow`: the one soft two-layer shadow (ink at 6–7% alpha), for cards and stat tiles. `--hairline`: the edge on drawn swatches.
  - Text on an accent or red fill is `--surface` (white).
- **System.** System UI face plus monospace. Four type sizes only: 36 (page title, stat numerals), 24 (section headings, Reject/Amend verbs), 16 (body, card titles), 13 (labels, metadata, code) as `--fs-display`, `--fs-heading`, `--fs-body`, `--fs-label`. Labels are muted and sentence case. Spacing on an 8px grid. 760px reading column. Sections are separated by 96px (64px under 640px) and thin rules; the first section has no rule, because the sticky bar's border sits above it. Radii: 16px cards and tiles, 10px code snippets, preview stages, bands and inputs, pill for the dial, Export and the Build blocked badge, 4px for chips. Shadows only on cards and stat tiles. No gradients, emoji, uppercase eyebrows or left-border stripes.
- **Motion.** 150–200ms ease. The dial's selected fill slides between segments (150ms). A decided card collapses into its confirmation line, and a resolved follow-up into its confirmation (180ms). Because rendering replaces the DOM, app.js starts each from the old state (FLIP). `prefers-reduced-motion: reduce` turns all of it off, in CSS and JS.

## Phases
1. Core logic and seed data. Done.
2. UI. Done (plus a design pass and a framework/policy pass).
3. Load your own contract, policy, lint report and reasons files: file picker plus drag and drop, plain-language inline validation errors, "Reset to demo data."
4. Accessibility: keyboard-operable throughout, visible focus, landmarks, aria-live for status changes, AA contrast (check the muted 13px metadata and the danger red specifically), empty states for every screen.
5. Deploy to Vercel from `main`: verify `vercel.json` against the real deploy, confirm the data files load in production, finish the README.

Commit and push after each phase; update `BUILD_LOG.md` after each phase.

## Definition of done (v1)
Load seed files. One rule auto-fix, one ask, one block. Review cards, execute one Reject and one Amend. Export a log showing all three dial behaviors and both decisions with reasons.

## Out of scope (v1)
Declare and Calibrate (v2), running a linter in-app, multiple components, visual diff, Figma, persistence.

## Build log (required)
After each phase, append to `BUILD_LOG.md`: what was built, decisions made and why, anything cut, problems hit. Short and factual. This feeds the portfolio case study, so record the reasoning, not just the changes.
