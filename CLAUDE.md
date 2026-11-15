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

In the UI, the steps appear as tabs in a sticky bar under the contract hero: in-page links, each with a line icon, a label and a live count chip (`Set · Decide · Follow-ups · Record`; Set has no chip). The tab for the section under the bar is marked `aria-current="location"`. They are links, not an ARIA tablist, because they jump within one page rather than switching panels. Follow-ups is the Resolve stage, not a framework step. Explain has no section of its own; it's the "Why the agent did it" line on every card. Sections have no eyebrow labels; the step bar links to their headings.

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

The demo files load by default. A second built-in set, the stress test data, lives in `data/stress/` (same four file names) and loads with `?data=stress`; any other value, or none, is the demo. Built-in sets go through the same `validate.js` checks as an upload (`src/core/datasets.js`), plus `createSession`; if any file fails, nothing loads and the page lists each problem by file path, with a link to the demo. The source line reads "Using stress test data" (or "Stress test data for the rest" after an upload). Users can load their own version of any of the four files (file picker or drag and drop, one slot per file). Each file is checked by `src/core/validate.js` before use, and problems are shown inline in plain language; a file with problems is not applied. Loading a file starts a new review. "Reset to demo data" restores all four from the demo, whichever set the page opened with, and drops `?data=` from the URL.

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
- **Block**: shown as a review card. A persistent "Build blocked" status stays red until every blocked deviation is resolved. While blocked, the badge is a link that scrolls to and focuses the first blocking card. It sits in the header beside "Load your files" and reads "Build blocked · N"; a second copy sits at the right of the sticky bar (not a live region; under 640px it shrinks to its icon and count, the label kept for screen readers). While blocked, the Blocked stat card is red too. The count is `aria-hidden`, and screen readers get the full sentence instead ("1 blocked deviation needs a decision").
- **Reject**: code is wrong; logged with the suggested fix.
- **Amend**: contract is wrong; log records every proposed contract change as a list (e.g. `["add \"destructive\" to Button.variants", "add color.danger to Button.allowedTokens.color"]`). Extra tokens come from `alsoAllowTokens`; ones the component already allows are skipped.
- Amending a deviation with no agent reason requires a human note. That's the riskiest decision in the app. Enforced in core, not only the UI.
- After Mark fixed / Mark applied in Follow-ups, the same kind of confirmation takes the item's place ("Resolved: contract change in Settings.tsx:42. Moved to the decision log.", linking to the log entry), gets focus, and is announced through the polite live region. Resolving from the log just flips the chip.
- After Reject or Amend, a confirmation ("Rejected: … Moved to Follow-ups as a code fix to do.") takes the decided card's place, with a link to Follow-ups, and gets focus. It stays until the next decision. A second Reject/Amend within 500ms of a decision is ignored (double-click guard), and focus goes back to the confirmation.
- Changing a dial after decisions are made re-evaluates only undecided deviations.
- A rule with no dial in `policy.json` falls back to **Ask**, never Auto-fix.

## Review card anatomy
The first undecided card is open; the others are rows (icon tile, rule label, title, the two swatches for color flags, chevron) that expand on click and fold back with a chevron in the card's header. The open card, top to bottom:
1. **Header band** (brand blue with the grid texture): 44px glass icon tile for the rule; a dial chip (Block in red, others glass) and the rule name; the **title** in Sora 20 white, a plain-language flag readable by a designer who doesn't read code and a developer who doesn't know the design system, e.g. "Fill #3B82F6 is a shade off color.primary (#2563EB)" (`flagTitle` in `src/core/explain.js`). Colors are parsed by `src/core/colors.js`: hex in every length, and `rgb()`/`rgba()` in comma or space syntax. A see-through color near the token reads "Fill rgba(37,99,235,0.08) is a tint of color.primary", and its Amend adds the color as written ("add rgba(37, 99, 235, 0.08) to Button.allowedTokens.color"). When the hard-coded value equals the suggested token's value, it reads "Hard-coded #FFFFFF instead of color.surface (same value)" (`sameValueAsToken`). `file:line` in mono at the top right. Under 640px a path over 40 characters is shortened in the middle (`shortPath`: "src/features/…/UpgradePlanBanner…Callout.tsx:87"), breaking only after a slash; the full path stays in the header's `title`, for screen readers, and in a "File" line at the top of the card body.
2. **Snippet** in a `--code` block with the offending value (hex or `rgb()`/`rgba()` color, off-scale px or variant name) marked red on the red tint, inline with `padding: 0 2px`. A quoted value is marked with its quotes (`"destructive"`). It scrolls sideways rather than wrapping; when it overflows, a "The line continues. Scroll sideways to read it all." line appears under it and the snippet becomes keyboard-focusable.
3. **Why flagged** (the contract rule in plain language, `flagRule`) and **Why the agent did it** (the agent's reason), as two `--why` tiles side by side, each with an icon label. A missing reason reads "No reason given." in bold with an alert icon, and its tile gets a dashed blue edge.
4. **Preview**: the deviation drawn from contract tokens in pure HTML/CSS (`src/core/preview.js` builds the data, `render.js` draws it), in separate bordered tiles with a 12px dot grid, true size, equal height at every width (a fixed 120px stage, `--stage-h`, with the drawing centred; tiles share rows through subgrid, so labels and captions line up), soft shadows in each button's own color, and an uppercase caption with muted detail ("Agent built", "If you Reject", "If you Amend").
   - Variant flags: three drawn buttons with the snippet's label. Agent built falls back to the default variant (no contract style yet); Reject draws the suggested variant; Amend draws the new variant with its `alsoAllowTokens` color (destructive in `color.danger`).
   - Color flags: two swatches with their values, agent vs token, each drawn on a white chip so a see-through `rgba()` shows as it would on a white surface. The agent's is kept if you Amend.
   - Spacing flags: a drawn button with its padding (or two buttons with their gap), the content box dashed and a measured bracket, agent px vs token px.
   - Drawn colors come from the contract and the snippet, so they are the only colors outside the palette. Only hex, px, and `rgb()`/`rgba()` rebuilt from parsed numbers reach a style attribute; nothing from a snippet goes in as written.
5. **Reject | Amend**: white, 14px radius, a 36px tint icon tile (code brackets / file-pen), the title in Sora 16 with its meaning ("The code is wrong"), then the consequence in mono: "→" and the token for Reject, "+" per contract change for Amend. Code tokens of 32 characters or fewer are `nowrap`, so a line breaks only at a space, never inside a token. A longer value (e.g. a whole `rgba()` declaration) may wrap, but only after its spaces and commas, never at a hyphen. When the value already equals the token's, Reject adds "The value stays #FFFFFF; only the token reference changes." Under 640px a half-width button is narrower than the longest token, so the consequences show full-width under the buttons instead (`aria-hidden`; the in-button copy stays in each button's accessible name).
6. **Note**: white, 10px radius, 42px tall.

Cards are 18px radius with `overflow: hidden`, 16px apart. After a decision, the confirmation band takes the card's place and the next card opens. Under 640px the why tiles and previews stack (each preview a row, drawing beside its caption; the drawing column is as wide as the widest drawing, and every tile in the card is the same height, at least 104px, `--stage-h-phone`).

## Page order
Header (logo, wordmark, tagline; "Load your files" and the build badge on the right; intro; data source) → stat cards → contract hero → sticky tabs → Autonomy Dial → Needs your decision → Follow-ups (every pending Reject code fix and Amend contract change, with Mark fixed / Mark applied; done items leave) → Decision log (auto-fix summary line at the top, then entries, Export) → Your data.

- **Stat cards**: Found / To decide / Absorbed / Blocked, each with a 32px icon tile, the number in Sora 26/600 and a label; updated on every render. To decide is solid brand blue; Blocked turns its tile and number red while above 0. 2×2 under 640px.
- **Contract hero**: brand-blue panel with the grid texture, a glow at the top right and a faint "DRIFT" watermark. Left: "Contract under review", the component name, the contract name and version, counts of variants and allowed color and spacing tokens, and a "Drift by rule" bar chart from the lint report. Right: an SVG line drawing of the component with callouts for its radius, padding and color tokens, its 36px height, and a red "variant?" pill when a variant deviation exists. Under 640px the drawing sits above the counts.
- **Sticky bar**: full width. Clear until it sticks, so the hero's shadow falls freely onto the page; once stuck (`.is-stuck`, set in app.js) it gets `--sticky` (`rgba(244,246,249,.85)`), a 12px backdrop blur and a 1px `--hairline` bottom edge. Tabs on the left, straight on the bar (no pill container); the active tab is brand blue with white text. Build badge on the right (red while blocked, white bordered "Build clear" otherwise). Under 640px, the tabs are a 4-up grid with icons over labels and the count chip on the icon's corner.
- **Autonomy Dial**: one white card, a row per rule split by hairlines: a 40px icon tile (red when the rule is on Block), the rule name, a meta line with the counts and what the dial means, and a segmented control (selected brand blue, Block red). Full width under 640px.
- **Follow-ups, Decision log, Your data**: each one white card with hairline rows. Log entries lead with the same plain-language title as their card, then a decision chip, dial and time, then file path and id as metadata.

Content sits in a 1080px column.

## Decision log entry
`id, rule, file, line, snippet, agentReason (or null), dialSetting, decision (auto-absorbed | rejected | amended), suggestedFix (rejected and auto-absorbed only), proposedChange (amend only; a list of every contract change), note, timestamp, resolution (rejected and amended only)`. Export as JSON.

`resolution` is `{ status: "pending" | "resolved", at, note }`. New Reject and Amend entries start `pending` with `at` and `note` null. `resolve` sets `resolved`, the time and an optional note; `reopen` returns it to `pending` and clears both. Auto-absorbed entries have no `resolution`: the agent already applied the token, so there's nothing to follow up.

## Decisions so far
- **Policy lives in `policy.json`, not the contract.** Dials are governance over the agent, not part of the design system; keeping them apart means Amend can never loosen its own oversight.
- **Unconfigured rules fall back to Ask.** A rule nobody configured should never be absorbed silently.
- **`suggestedFix` log field.** Reject is "logged with the suggested fix"; `proposedChange` stays amend-only.
- **Auto-absorbed entries keep the agent's reason**, so the log shows what Auto-fix discarded.
- **Light theme only.** No dark mode, no `prefers-color-scheme`.
- **Visual hierarchy**, heaviest first:
  1. Build status and the stat cards: red only while blocked.
  2. Reject and Amend: the largest controls in a card.
  3. The preview and the agent's reason.
  4. Snippet and location: small monospace.
  5. Metadata (dial, timestamps, ids): smallest, muted.
- **Reject and Amend buttons are identical** (same white fill, border, size, type, icon tile; never brand blue), side by side at every width, so the UI doesn't suggest an answer. Hover lifts either one the same way.
- **Palette: dark blue.** Every color in `styles.css` is a custom property in `:root`; inline styles carry only contract colors. No purple-leaning hues: every palette color other than red sits between hue 213° and 224°. Contrast ratios are in `BUILD_LOG.md` (dark-blue palette).
  - Page `--page` `#F4F6F9` under a 22px dot grid (`--dot` `#D3D9E3`). Surfaces `--surface` `#FFFFFF`; `--code` `#F3F6FA`, `--why` `#F6F8FB`, `--track` `#EEF2F7`, `--stage` `#FAFBFD`.
  - Text: `--ink` `#0F1A2E` (headings, titles, numbers), `--body` `#26324A`, `--muted` `#5F6B80` (5.38:1 on white, 4.79 on `--track`, the lowest surface it sits on). `--hairline` `#ECEFF4` (row separators), `--border` `#D9DFE8` (controls, tiles).
  - `--brand` `#1E3A8A`: fills (white text 10.36:1), links, icons. `--brand-light` `#2F5BD3`: the logo gradient's top, hover borders and focus rings (5.90:1 on white). `--brand-deep` `#172F6E`: the logo gradient's bottom and the primary button's hover. `--tint` `#E6EDFB`: icon tiles, confirmation band, resolved chip.
  - `--red` `#C93A2E`: Block and blocked only (the build badge, the Blocked stat, the Block chip, the Block dial, the Block rule's icon tile, the anatomy's "variant?" pill, the marked value in a snippet). White on it 5.09:1. `--red-tint` `#FBE7E5`, with `--red-text` `#A8301F` for text on it (5.68:1; the base red is only 4.28 there). Missing reasons and validation errors use ink, bold, with a brand-blue alert icon, not red.
  - On brand blue: white, `--on-brand-muted` `#CDD7EC` (7.17:1; 4.64 even in the hero's glow corner) and `--on-brand-line` `#C3D3F5` for strokes. Hero glow `rgba(59,130,246,.40)`; hero bar for colors `--bar-blue` `#8FB0F5`.
  - Shadows are tinted with the brand (`rgba(30,58,138,x)`) or ink (`rgba(15,26,46,x)`).
  - Previews keep the contract's own token colors.
- **Type.** Sora 300/600/700/800 for the wordmark, headings and all numbers; Inter 400/500/600 for body; JetBrains Mono for code (Google Fonts). Sizes: wordmark 28, section h2 20, card title 20, body 14, labels 10.5 uppercase 600 with 0.1em tracking, metadata and code 13.
- **Depth and shape.** Cards and stat cards use the two-layer `--shadow`; brand-blue elements carry a blue shadow, red ones a red glow. Radii: 18 hero and decision cards, 16 panels, 14 stat cards, Reject/Amend and rows, 12 logo, tabs and preview tiles, 10 inputs, code, segmented track and buttons. No left-border stripes, no emoji.
- **Motion.** 150–200ms ease. The dial's selected fill slides between segments (150ms); Reject/Amend lift 1px on hover. A decided card collapses into its confirmation line, and a resolved follow-up into its confirmation (180ms). Because rendering replaces the DOM, app.js starts each from the old state (FLIP) and carries the active tab across renders. `prefers-reduced-motion: reduce` turns all of it off, in CSS and JS.

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
