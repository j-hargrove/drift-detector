# Build log

## Phase 1: Core logic and seed data (2026-10-19)

**Built**
- `data/`: contract (Acme UI 1.0.0, tokens + a single Button contract), lint report (5 deviations), agent reasons (4 of 5 deviations).
- `src/core/session.js`: session state, dial changes, Reject/Amend, review queue, build status, log export. All functions are pure; each returns a new session.
- `src/core/proposals.js`: works out the contract change an Amend would make from the offending snippet (hex → `allowedTokens.color`, px → `allowedTokens.spacing`, `variant="x"` → `variants`), and resolves token paths to values.
- 19 Vitest tests, including one that runs the full definition-of-done flow against the real seed files.

**Decisions**
- **Default dials live in `contract.json` under `dials`.** The spec allows three input files and calls the dials defaults. Autonomy is governance policy, and policy belongs with the contract, so no fourth file.
- **An unknown rule falls back to Ask, not Auto-fix.** A rule nobody has configured should never be absorbed silently. That is the failure the tool exists to expose.
- **Auto-absorbed entries keep the agent's reason.** dev-003 had a real argument (icon centring), and Auto-fix discarded it. The log keeps it, so a reviewer can later see what the dial threw away.
- **Added `suggestedFix` to log entries** for rejected and auto-absorbed decisions. The spec says Reject is "logged with the suggested fix", but its field list has no slot for it. `proposedChange` stays amend-only, as specified.
- **Dial changes only re-evaluate undecided deviations.** Moving a rule to Auto-fix absorbs what is still open. Moving it from Auto-fix to Block does not reopen absorbed items, because those decisions are on record. Undoing them would be a separate feature (out of scope).
- **The Amend-without-reason guard is enforced in core, not only in the UI.** The UI disables the button, but `amend()` throws as well, so the rule holds even if the UI has a bug.
- **Seed choice:** dev-005 (`variant="destructive"` on Delete account) is a deliberately hard call. Rejecting it makes a destructive action look safe, so Amend is plausibly the right answer. The demo shows that the contract can be what's wrong.
- Pure functions plus an injectable `now()` make every test deterministic with no mocking.

**Cut**
- Nothing applies amendments to the in-memory contract. Amend records a proposal, and a contract owner acts on it. Mutating the contract would also change how later deviations are evaluated, which raises questions v1 doesn't need to answer.

## Phase 2: UI (2026-10-19)

**Built**
- `index.html`, `styles.css`, `src/ui/render.js` (HTML string templates, no DOM access), `src/ui/app.js` (loading, events, rendering).
- Page order: build status → Autonomy dial per rule → review cards (blocked first) → proposed contract changes → decision log with JSON export → a footer explaining the framework (removed in the framework pass).

**Decisions**
- **Override is the biggest thing on each card.** Each card offers two side-by-side choices worded as the question the reviewer is answering ("The code is wrong" / "The contract is wrong"). Each choice shows its effect before you click: Reject shows the token and its resolved value, and Amend shows the exact contract change.
- **A missing reason is shown in red, not just as empty space.** On those cards the Amend button stays disabled until a note is written. The label says why: "you would be the only reason on record".
- **The build status is persistent and pulses** while blocked (the pulse is off under `prefers-reduced-motion`). Loosening the blocking rule from Block to Ask also clears it. That is deliberate: the dial is the human's call, and the log records which dial was active for each decision.
- **The note textarea doesn't trigger a full re-render.** Re-rendering on each keystroke would steal focus, so typing only toggles the Amend button directly. Drafts are kept in a Map so they survive dial changes.
- `render.js` has no DOM access, so the templates were smoke-tested in Node against the seed data before going near a browser.
- `vercel.json` skips install and build, so `node_modules` never deploys. `.vercelignore` keeps tests out of the upload.

**Problems hit**
- Mobile overflow: grid children default to `min-width: auto`, so the `pre` snippet and long `code` strings pushed cards wider than the viewport. Fixed with `minmax(0, 1fr)` tracks and `min-width: 0` on the choice boxes.
- Headless Chrome won't make a window narrower than about 500px, so the first mobile screenshot looked clipped even after the fix. Checked at a true 390px by loading the page in a 390px iframe: document scrollWidth = clientWidth = 390.

**Not yet verified**
- Live Vercel deploy (no git repo or Vercel project yet).
- Clicking through Reject/Amend in a real browser. The flow is covered by core tests and the Node smoke test, and the page was screenshotted but not interacted with.

## Design pass (2026-10-19)

No new features. Screenshots in `docs/design-pass/`: `before-*` / `after-*`, each at desktop (1280px) and mobile (390px). Each width has two screens: `initial` (build blocked, 3 cards) and `resolved` (everything decided). The resolved state was produced by scripting real clicks: Reject dev-001, Amend dev-005, type a note on dev-002 and then Amend it.

**Removed**
- Dark mode and the `prefers-color-scheme` query. The site is light only: warm off-white `#f6f3ee` background, dark gray `#2d2b28` text. The "before" shots are dark because headless Chrome followed the OS setting, which is one more reason to drop a theme nobody designed for.
- Every card container: dial cards, review cards, amendment boxes and the bordered log table. Sections are now separated by whitespace and a 1px rule.
- Coloured left borders on cards, the dark code block, filled reason boxes, pill badges, uppercase eyebrow labels, the ⚠ emoji, the pulsing status dot, and the purple fill on Amend.

**System** (all CSS custom properties)
- **Colour:** neutrals (bg, field, text, muted, rule), one accent (`#2f5b8a`, ink blue: focus rings, the selected dial, Export) and one warning (`#b23a1e`). That is the whole palette.
- **Type:** the system UI face plus monospace, four sizes: 13 / 16 / 20 / 32.
- **Space:** 8 / 16 / 24 / 32 / 48 / 64.

**Hierarchy and why**
1. **Build status** is the only solid colour on the page, and only while blocked: a warning-red block. When clear it drops to plain text with no fill and no green, because "nothing is wrong" shouldn't compete for attention. Before the pass, the red status competed with red Block pills, a red reason box and red dial segments. Now nothing else on the page is red except warning text.
2. **Reject / Amend** are the largest interactive elements: 20px verb, 2px dark outline, equal width, side by side at every width including 390px. Before, Reject was white and Amend purple, which implied a preferred answer. Equal weight is the point: the tool doesn't know which side is wrong. Each button's effect (the fix or the contract change) sits directly under it.
3. **Agent's reason** is 16px body text in quotation marks, under a small "Agent's reason" label. A missing reason uses the same label and the same position, in warning colour and semibold. Its absence lands exactly where a reason would have been, so the gap reads as a missing reason rather than missing content.
4. **Snippet and location:** 13px monospace, no background. The dark code block used to be the heaviest thing on each card, so the code drew more attention than the decision.
5. **Metadata** (dial, rule id, counts, timestamps): 13px muted.

**Other decisions**
- **The autonomy dial became an underlined tab row** instead of a pill-segmented control in a card. The selected option gets weight plus the accent underline. The Block option is no longer red: a dial setting is a policy, not an alarm. The alarm is the build status.
- **The decision log changed from a table to a list.** In the before mobile shot, the table scrolled sideways and hid the reason and outcome columns completely. The list is a three-column grid on desktop (what / why / outcome) and stacks on mobile. The file path gets its own line, and the first column was widened to 264px, so paths don't break mid-token.
- **Export JSON is a text link in the accent colour**, so it can't compete with Reject/Amend.

**Problems hit**
- Headless Chrome won't go narrower than about 500px, so mobile shots render the page in a 390px iframe. The harness also checks that `scrollWidth` equals `clientWidth` (no horizontal scroll). Every after shot passes.
- First after round: dial controls had different widths, so their left edges didn't align (fixed with a 320px control column), and "Export JSON" wrapped on mobile (`nowrap`).

## Framework, policy and auto-fix visibility pass (2026-10-19)

**Changed**
- **Framework renamed to Set / Explain / Decide / Record** in `CLAUDE.md`, with Declare (intent before generation) and Calibrate (confidence per deviation) listed as v2. All references to the previous third-party pattern framework and its pattern names are gone from docs and UI copy. "Autonomy Dial" stays as the screen name.
- **UI labels:** quiet 13px muted labels "Set", "Decide" and "Record" above the matching section headings. Each card's reason label now reads "Explain · agent's reason". "Set, Explain, Decide, Record." is a line in the intro. The old footer that listed the patterns was removed: with the intro line and section labels it would have said the same thing three times.
- **`data/policy.json`** now holds the default dials, and `contract.json` holds none. `createSession` takes `policy` instead of `dials`. It throws if the contract carries a `dials` key, if `policy.dials` isn't an object, or if any dial value is unknown. This reverses the Phase 1 call to keep dials in the contract (see below).
- **Auto-fix visibility:** the Autonomy Dial ends with "Auto-fix absorbed N deviations without asking: dev-003, dev-004". The count links to the first absorbed log entry, and each id links to its own entry (`#log-<id>`). The targeted entry gets a 2px accent outline so you can see where you landed. Backed by a new core helper, `autoAbsorbed(session)`.
- `CLAUDE.md` now records the decisions made so far (policy file, fallback to Ask, `suggestedFix`, reasons kept on auto-absorbed entries, light theme only, hierarchy and palette, identical Reject/Amend buttons).
- Tests: 19 → 24. New tests cover: no dials in the seed contract, a contract with dials is rejected, malformed or unknown policy dials are rejected, Amend leaves the dials object untouched and only targets `Button.*`, and the auto-absorbed list updates after a dial change.

**Decisions**
- **Why policy moved out of the contract.** Phase 1 argued that autonomy is governance and governance belongs with the contract. That was wrong. If the dials live in the contract, a contract amendment could, in principle, loosen the agent's own oversight. Splitting the files makes "Amend never touches policy" a structural fact, not just a convention. The validation error keeps the two from being merged again by accident.
- **Explain has no section of its own.** The reason lives inside each review card, so Explain labels the reason rather than a section. "Proposed contract changes" has no step label: it is an output of Decide, and labelling it "Decide" twice would blur the mapping.
- **The absorbed count links to the entries, not just the log.** The log mixes all decision types, so a link to the section alone wouldn't show what was absorbed. When there are none, the line reads "Auto-fix has absorbed nothing yet." It doesn't disappear, so the silent path is always acknowledged.
- The labels are 13px muted sentence case, the existing metadata style, so they add no new visual weight and don't bring back the uppercase eyebrows the design pass removed.

**Verified**
- The design-pass screenshots in `docs/design-pass/` were cropped just above the old footer, which named the previous framework. Everything above it is unchanged.
- 24/24 tests pass. Both screens (initial and resolved) screenshotted at 1280px and 390px, with `scrollWidth` = `clientWidth` (no sideways scroll) in all four. Every link in the absorbed-count line was checked against an existing log entry id.

## Auto-fix line wording (2026-10-20)
- The auto-fix line now names each absorbed deviation by rule and location ("Spacing in Button.tsx:12") instead of by id. Ids mean nothing to a reader; rule plus file is what they'd look for. The links still go to the log entries.

## Phase 3: Load your own files (2026-10-20)

**Built**
- `src/core/validate.js`: pure, plain-language checks for each of the four files, plus JSON parsing that reports the line and column of a syntax error. Problems are capped at 8 per file, then "…and N more." Files are limited to 1 MB. 18 new tests (42 total).
- A "Your data" section at the bottom of the page with one row per file (contract, policy, lint report, reasons). Each row has a drop zone that is also a file picker, shows which file is in use ("demo data" or the file name), and lists problems inline under the row.
- "Reset to demo data" restores all four files. A line in the masthead says what's in use ("Using your lint report (team-lint.json). Demo data for the rest.") and links to the section.
- Load results are announced through a polite live region.

**Decisions**
- **One slot per file, not one drop zone for everything.** Guessing which file is which from its name or shape would fail exactly when someone's file names differ from ours, and the error would be confusing. Four labelled slots make each error obviously about one file.
- **A bad file is never applied.** The previous file for that slot stays in use, and the error says so ("Still using demo data"). Inputs are validated in two layers: `validate.js` gives friendly messages for each file on its own, and `createSession` still enforces its own rules (for example, no dials in the contract). If the combination of files fails, that error is shown under the slot too.
- **Loading any file starts a new review**, because decisions refer to deviations that may no longer exist. The section's hint says this and suggests exporting first. I chose that over a confirm dialog: one more modal on a page about not hiding decisions felt like the wrong trade for a demo with no persistence.
- **Partial replacement is allowed**: load just a lint report and keep the demo contract, policy and reasons. That's the realistic case (your agent's output, our sample contract).
- Rules with no friendly label (anything outside the three seed rules) show their id once instead of "id · id".
- A file dropped outside a drop zone is swallowed instead of letting the browser navigate away and lose the review.

**Problems hit**
- **Class-name collision.** The new masthead `.source` line reused a class the review card already had with `display: grid`, so the link and file name each dropped onto their own line. Renamed the card's wrapper to `.review__source`.
- **The screenshot harness was racing the app.** Headless Chrome's virtual time budget fast-forwards `setTimeout`, but `file.text()` is real I/O, so measurements sometimes ran before the file finished loading. I replaced the iframe harness with a small Chrome DevTools Protocol script. It waits on DOM conditions (the live-region announcement), sets a true 390px viewport (no more iframe workaround), and records console errors. It caught a missing favicon 404, now silenced with an empty `data:` icon.

**Verified**
- 42/42 tests pass. Five states at 1280px and 390px (initial, all decided, three bad files, a custom lint report, reset after loading): no sideways scroll and no console errors in any of them. Files were loaded through the real `change` and `drop` events.

## Phase 4: Accessibility (2026-10-20)

**Measured first.** Contrast ratios for every colour pair on the page, computed from the CSS custom properties:

| Pair | Ratio | Needs |
|---|---|---|
| Body text on background | 12.75 | 4.5 |
| Muted 13px metadata on background | 5.00 | 4.5 |
| Muted 13px on the note field | 5.26 | 4.5 |
| Warning red text on background | 5.39 | 4.5 |
| Blocked status (off-white on warning red) | 5.64 | 4.5 |
| Accent links on background | 6.36 | 4.5 |
| Button gloss (text at 75%), and inverted on hover | 5.93 / 7.86 | 4.5 |
| Focus ring and selected-dial underline (accent) | 6.36 | 3 (non-text) |
| ~~Disabled Amend (text at 35%)~~ → muted text, dashed border | ~~2.02~~ → 5.00 | 4.5 |
| ~~Note field border (rule colour)~~ → muted | ~~1.29~~ → 5.00 | 3 (non-text) |

Muted metadata and warning red both pass, but muted has the least headroom (5.00). Any future lightening of `--text-muted` will fail AA, so it's the token to watch.

**Changed**
- **Focus survives re-renders.** Every interactive element the templates produce carries a stable `data-focus` key, and `render()` puts focus back on the same element after replacing the DOM. Before this, every arrow key on a dial and every file load dropped focus to the top of the page.
- **Focus after a decision:** it moves to the Reject button of the card that took the decided card's place, or to the "Needs your decision" heading when none are left.
- **Amend without a note is `aria-disabled`, not `disabled`.** It stays in the tab order and is described by the "note required" text. Activating it shows the reason as an alert and puts the cursor in the note field. A truly disabled button would have been skipped by keyboard users without ever explaining why.
- **Live regions.** The build status container is the one `role="status"` (an inner nested one was removed) and is only rewritten when its text changes, so screen readers don't re-announce "Build clear" on every click. A separate polite region announces decisions ("Rejected: Variant in Settings.tsx:42. 2 left to decide."), dial changes including anything auto-fix just absorbed, and file loads.
- **Landmarks and structure.** Skip link to `main`. Each review card is an `article` labelled by an `h3`: its existing metadata line, plus a visually hidden location so the three cards have distinct names. Reject and Amend are described by the card title and their effect line, so "Reject" in a screen reader's button list says which deviation and what it would change. Dial legends use the readable rule name.
- **Log entries are focusable (`tabindex="-1"`),** so following an auto-fix link moves keyboard focus to the entry, not only the scroll position.
- **Empty states for every section.** An empty lint report now says "No rules to set" and "Nothing to review. The lint report has no deviations." Before, it said "Every deviation has a decision", which is false when there were none.

**How it was verified**
- A keyboard-only walkthrough over the Chrome DevTools Protocol using trusted key events (synthetic events from page JS don't move focus). 25 checks, all passing:
  - **Tab order:** 23 stops, from the skip link through the dials, the auto-fix links, every card's Reject / Amend / note, Export, Reset, and all four file pickers. Each stop has a visible indicator.
  - **Dials:** arrow keys change the setting and keep focus, and the change is announced.
  - **Deciding:** Enter and Space both decide. Focus moves to the next card, then to the heading when the queue is empty.
  - **Amend without a note:** activating it sends focus to the note field, typing enables it, and Shift+Tab returns to it.
  - **Auto-fix link:** focus lands on the log entry.
- **Problem in my own check:** the first version counted the browser's default focus ring on the visually hidden radio and file inputs as "visible". Those are opacity 0 or 1px, so the check now requires a visible box. The real indicators are the radio's label text and the drop zone's `:focus-within` outline.
- 42/42 tests pass. Screenshots at 1280px and 390px of five states (initial, all decided, bad files, custom report, empty report): no sideways scroll, no console errors.

**Not covered**
- No screen-reader pass with VoiceOver or NVDA. Names, descriptions and live regions were checked structurally, not listened to.

## Phase 5: Deploy (2026-10-20)

**Done**
- **Hosting:** a public GitHub repo (`j-hargrove/drift-detector`) and a Vercel project connected through the Git integration. Pushes to `main` deploy to production at https://drift-detector-psi.vercel.app.
- **README:** what the tool is and why, the four steps, a demo walkthrough, the four file formats with examples, running locally, structure, deploy and accessibility notes. The JSON examples were run through `checkFile` and `createSession`, so what's documented is exactly what loads.

**`vercel.json`, verified against the real deploy** (build log and live responses)
- The build cloned `main` at the pushed commit. The install and build steps ran the no-op `echo` commands, and the build finished in 191ms. `node_modules` was never installed: `/node_modules/...` returns 404.
- `.vercelignore` is honoured for Git deployments, not just CLI uploads. The build log lists the removed tests and screenshots.
- Content types are correct: the four `data/*.json` files are `application/json` and every ES module is `application/javascript`. A browser refuses to run a module served as `text/plain`, so this is the check that matters for a no-build site.
- **Found:** `CLAUDE.md`, `BUILD_LOG.md` and `.gitignore` were being served from the site root. They're public on GitHub anyway, but they aren't part of the site, so they're now in `.vercelignore` along with the README and lockfile. `package.json` was already excluded by Vercel. `vercel.json` itself stays deployable; it's config, not content.

**Production checks**
- The full browser suite was run against the production URL: screenshots of five states at 1280px and 390px, plus the 25-check keyboard walkthrough. Results are identical to local. The demo data loads (3 review cards, 2 auto-absorbed entries). File loading, validation errors and the empty state all work, with no console errors and no sideways scroll.

**Decisions**
- **Public repo:** asked and confirmed. It's a portfolio piece, so the code is part of what's being shown.
- **Small fix:** `vercel link` added `.vercel` to `.gitignore`, duplicating an existing `.vercel/` line. Removed.

**Not done**
- No custom domain; the site uses Vercel's generated `drift-detector-psi.vercel.app`.
- Preview deployments for other branches use Vercel's defaults, which may require a Vercel login to view. Production is public.
