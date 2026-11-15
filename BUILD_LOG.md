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

## Resolve (2026-11-13)

**Why:** Reject and Amend are decisions, not outcomes. A rejected deviation still needs someone to fix the code, and an amended one still needs someone to update the contract. Before this, the log had no way to show whether either had happened, so a "decided" log could hide work that was never done.

**Done**
- **Core:** Reject and Amend log entries carry `resolution: { status, at, note }` and start `pending`. `resolve(session, id, { note })` marks one resolved, with a time and an optional note. `reopen(session, id)` returns it to pending. Both are pure, like the rest of `session.js`, and both refuse auto-absorbed, undecided or unknown ids and the wrong starting state. 7 new tests, 49 in total.
- **Decision log:** each Reject or Amend entry shows a chip ("Code fix pending" / "Contract change pending", or "Resolved: code fixed" / "Resolved: contract updated" with the time and note) and one button: "Mark fixed", "Mark applied" or "Reopen". Mark opens a labelled one-line note field with Confirm and Cancel. Enter confirms and Escape cancels.
- **Proposed contract changes:** each item has "Mark applied" and leaves the list once applied, so the section only ever shows outstanding work.
- **Export:** includes `resolution` unchanged.
- **Accessibility:** results go through the existing polite live region. Focus goes to the note field when it opens, then to Reopen after confirming, to the next pending change (or the section heading) after applying from the list, and back to the Mark button after Reopen.

**Decisions**
- **Auto-absorbed entries get no `resolution`.** The agent already applied the token. A permanent "pending" chip on them would be noise.
- **Reopen clears the time and note** rather than keeping a history. The spec has one resolution per entry, and the decision itself is unchanged. A history would be the next step if someone needs it.
- **Reopen acts immediately,** with no note form. Reopening clears the note, so asking for one would be pointless.
- **`resolve(session, id, …)`, not `resolve(id, …)`:** the existing core API is pure functions over a session, and this keeps it that way.
- **New `--resolved` green token (`#2f6b3c`).** The request asked for green chips using existing tokens, but the palette had no green. It's the one addition, checked at 5.77:1 on the background and used only for resolved chips.
- **Chips, not pills.** The design rules ban pills, so a chip is a text label with a 1px border and the standard 4px radius. Pending is neutral (`--rule` border, muted text), so only finished work carries colour.

**How it was verified**
- 49/49 tests pass.
- Playwright against the local server (`npm run serve`), 27 checks, all passing: decide three deviations; resolve one with a note using only the keyboard; resolve one without a note from the proposed changes list; Escape closes the form; reopen; exported JSON shows a reopened entry as pending with cleared fields, an applied entry as resolved with a null note, and no `resolution` on auto-absorbed entries. Also checked: chip colours from computed styles (no left stripe), focus after each step, live-region text, no sideways scroll at 390px, no console errors.
- **Problem hit:** the first two attempts to start a local server from the agent were blocked by the tool's permission check. The browser check waited until the server was started by hand.

## IA pass (2026-11-13)

**Why:** a hiring manager, designer or developer should understand a card without knowing the rule ids. The old card led with "Ask · Hard-coded colour · no-hardcoded-color" and gave no plain-language reason for the flag. The intro line "Set, Explain, Decide, Record." named the steps but didn't help anyone get around the page.

**Done**
- **Card anatomy:** title, meta, snippet, two labelled lines, Reject | Amend, note.
  - **Title:** a plain-language flag such as "Fill #3B82F6 is a shade off color.primary (#2563EB)", "Padding 10px falls between spacing.2 (8px) and spacing.3 (12px)" or "Button has no “destructive” variant".
  - **Meta line:** mode · rule name · file:line, with the rule id dropped.
  - **Labelled lines:** "Why it was flagged" (the contract rule in plain language) and "Why the agent did it" (the agent's reason).
- **`src/core/explain.js`**, pure and tested (`flagTitle`, `flagRule`):
  - Colour titles name the CSS property in plain words (background → Fill, color → Text colour).
  - They say whether the colour is "a shade off" the suggested token (RGB distance ≤ 60), a contract token the component doesn't allow, or far from any token.
  - Spacing titles place the value against the component's allowed scale.
  - Unknown rules fall back to "This line breaks the rule …".
- **Step bar:** replaces the intro line with `Set · Decide (n) · Follow-ups (n) · Record`, in-page links with live counts inside a labelled `nav`. Links move focus to the section heading, not only the scroll position.
- **Follow-ups section:** replaces "Proposed contract changes". It lists every pending code fix (Reject) and contract change (Amend), each with Mark fixed / Mark applied, and done items leave. Before, a rejected deviation's code fix had nowhere to wait except the log. A new `followUps(session)` helper in core supplies the list and count.
- **Auto-fix summary line** moved from Set to the top of Record, next to the entries it links to.
- **Build blocked** is a link while blocked. It scrolls to and focuses the first blocking card, which gets the accent outline. When clear, it's plain text again.
- **Headings:** section h2s are now 32px (up from 20px). The eyebrow labels (Set / Decide / Record) were removed because the step bar now names the steps and links to the headings, so the eyebrows only repeated it.

**Decisions**
- **No title field in `reasons.json`.** The request allowed one "if needed". It wasn't: all three seeded rules get specific titles from the contract and lint data alone. A title would also sit oddly in the agent's file, since it describes why the linter flagged the line, not why the agent made the change.
- **"A shade off", not "one step off".** The example wording implied a colour scale, but the contract has no notion of steps between colours. "A shade off" is true whenever the colours are close.
- **Card title at 16px semibold,** below the Reject and Amend verbs (20px inside 2px-bordered buttons), so the decision stays the dominant element.
- **h2 uses the existing 32px step,** the same as the page title. A 24px step would have meant a new type token, and the request said existing tokens.
- **Follow-ups (n) in the step bar is not a framework step.** It's the Resolve stage between Decide and Record. The framework stays Set / Explain / Decide / Record.

**How it was verified**
- 59/59 tests pass (9 for `explain.js`, 1 for `followUps`).
- Playwright against the local server, 25 IA checks, all passing:
  - card child order and the exact title and meta text
  - both labelled lines, and the missing reason in the warning colour
  - step bar counts at the start, after deciding and after resolving
  - auto-fix line inside Record and gone from Set
  - h2 computed at 32px, and no eyebrows
  - Build blocked link focuses and scrolls to the blocking card, by click and with Enter
  - step link focuses the heading, and the badge turns back to plain text when clear
  - Follow-ups lists both kinds
  - Reject and Amend side by side and identical at 390px, no sideways scroll, no console errors
- The 27-check Resolve script was rerun against the renamed section; all pass.

## Clarity re-theme (2026-11-13)

**Why:** move to the Clarity palette: paper `#F2EFEA`, ice `#DFE5F3`, slate `#557373`, olive-dark `#272401`, ink `#0D0D0D`. Light only, tokens only, no layout changes.

**Done**
- Every colour in `styles.css` was already a custom property, so this was a `:root` swap plus a few new token uses. No hex values remain outside `:root`. A browser audit read the computed colour, background and border of every visible element across five states, and all of them are tokens.
- **Tokens:** `--bg` paper; `--surface` `#F9F7F5`; `--text` ink; `--text-muted` olive-dark; `--accent` slate; `--accent-text` `#4A6666`; `--tint` ice; `--resolved` slate (the green `#2f6b3c` is gone); `--danger` `#9B3B2B`; `--rule` `#C9C6BB`. Renamed tokens: `--field` → `--surface`, `--warning` → `--danger`, `--on-warning` removed (text on danger is `--bg`).
- **New uses:** ice fills the selected dial segment, the auto-fix summary line and pending chips. A selected Block dial is underlined in danger instead of slate. Reject/Amend, inputs and drop zones sit on surface with slate borders, and Reject/Amend fill with slate on hover.

**Contrast, measured on the real page** (AA: 4.5:1 for normal text, 3:1 for large text and UI)

| Pair | Ratio | Where |
|---|---|---|
| `--text` on `--surface` | 18.19:1 | Reject/Amend verbs, input text |
| `--text` on `--bg` | 16.95:1 | body, headings |
| `--bg` on `--text` | 16.95:1 | skip link, Build blocked hover |
| `--text` on `--tint` | 15.40:1 | selected dial label |
| `--text-muted` on `--surface` | 14.68:1 | drop zone text |
| `--text-muted` on `--bg` | 13.67:1 | 13px metadata, hints, lede |
| `--text-muted` on `--tint` | 12.43:1 | pending chip |
| `--danger` on `--bg` | 6.00:1 | "No reason given", note requirement, validation errors |
| `--bg` on `--danger` | 6.00:1 | Build blocked badge |
| `--accent-text` on `--surface` | 5.81:1 | Amend while disabled |
| `--accent-text` on `--bg` | 5.41:1 | links, step bar, link buttons |
| `--accent-text` on `--tint` | 4.92:1 | links in the auto-fix summary line |
| `--resolved` on `--surface` | 4.81:1 | resolved chip (13px semibold) |
| `--surface` on `--accent` | 4.81:1 | Reject/Amend on hover, incl. the 13px gloss |
| UI: `--danger` on `--tint` | 5.45:1 | selected Block underline |
| UI: `--accent` on `--surface` | 4.81:1 | input, button and drop-zone borders |
| UI: `--accent` on `--bg` | 4.48:1 | focus ring, dial underline, link underlines |
| UI: `--accent` on `--tint` | 4.07:1 | selected dial underline |

`--rule` (`#C9C6BB`, 1.49:1 on paper) is decorative: the section separators carry no information.

**Decisions**
- **Slate is never small text on paper.** `#557373` is 4.48:1 on paper, just under AA, so links use `--accent-text` (`#4A6666`, 5.41:1). The resolved chip uses slate text but sits on `--surface`, where it reaches 4.81:1.
- **Text on a slate fill is `--surface`, not paper.** The request said paper text on the accent fill, but paper on slate is also 4.48:1, which fails for the 13px gloss under Reject and Amend. Surface is the palette's lighter paper and reaches 4.81:1. The gloss also lost its 0.75 opacity, which would have lowered the contrast further.
- **"Primary button fill" became the Reject/Amend hover state.** The app has no primary button, and Reject and Amend must stay identical so the UI doesn't suggest an answer. Slate fills whichever one is under the pointer.
- **Red still marks missing reasons and validation errors,** not only Build blocked and Block. The request said "Build blocked and Block only", but "No reason given" in red is a standing design decision: it flags the riskiest Amend. Removing it would have been a behaviour change in a tokens-only pass. It's still one red, and it's easy to remove if wanted.
- **Disabled Amend uses `--accent-text`, not `--text-muted`.** Olive-dark is nearly black, so a muted-text disabled button would look enabled. The dashed border still marks it.
- **`--rule` is a tint of palette colours** (paper with 20% olive-dark), like `--surface`. A separator in one of the five colours would have been either invisible or too heavy.
- **Known trade-off:** with olive-dark as `--text-muted`, metadata is separated from body text by size (13px against 16px) and hue, not lightness. It reads as quieter only slightly, so the visual hierarchy's "smallest, muted" level is now mostly "smallest".

**How it was verified**
- 59/59 tests pass.
- A Playwright theme audit on the local server across five states (initial and blocked, Reject hover, Build blocked hover, resolve form open, decided and resolved with a file error): every rendered colour is a token, and every text/background pair meets AA (the table above).
- The IA (25) and Resolve (27) scripts were rerun with the new colour values; all pass.

## Heading size and muted text (2026-11-13)

**Done**
- **`--fs-section: 24px`** for section headings (h2). The page title stays at 32px (`--fs-4`). The scale is now 13 / 16 / 20 / 24 / 32. This replaces the IA-pass compromise of using 32px for section headings, which flattened them against the page title.
- **`--text-muted: #706E57`.** It's olive-dark (`#272401`) mixed 34% toward white: the lightest tint that holds 4.5:1 on both backgrounds it's used on. Searched in 0.1% steps.

| Pair | Ratio |
|---|---|
| `--text-muted` on `--bg` | 4.51:1 (the binding constraint) |
| `--text-muted` on `--surface` | 4.84:1 |
| `--text-muted` on `--tint` | 4.10:1, **fails**, so it's not used on ice |

**Decision**
- **Pending chips now use `--text` (ink, 15.40:1 on ice) instead of `--text-muted`.** They are the only place muted text sat on ice, and the new value would have failed AA there. The chip is still neutral: grey-blue fill, no colour accent. Resolved chips are unchanged (slate on surface, 4.81:1).
- **Disabled Amend stays on `--accent-text`.** Muted text is light enough to work now, but slate keeps the disabled button in the same family as the active ones. Only the comment changed.

**How it was verified**
- 59/59 tests pass.
- Playwright on the local server: Resolve 27/27, IA 25/25 (h2 now checked at 24px), theme audit all passing. Every rendered colour is a token and every measured text pair meets AA. The lowest pair is `--text-muted` on `--bg` at 4.51:1.

## Bug: Reject seemed to do nothing (2026-11-13)

**Report:** on the live site at 125% browser zoom, clicking Reject did nothing visible. The card didn't move and Follow-ups didn't change.

**Reproduced** on the live URL with Playwright: a 1024 CSS px viewport (a 1280px window at 125%), device scale 1.25, real mouse clicks on a Block card and then an Ask card, screenshots before and after.

**Cause: the click worked, but nothing on screen showed it.** The click fired, the state updated and the page re-rendered, with no console errors. But:
- The next card rendered in exactly the place the decided card had been, so before and after looked almost the same.
- The pointer was then over the next card's Reject button, so it showed the hover fill and looked like the same button being pressed.
- The step bar, build status and Follow-ups were all scrolled off screen. The only confirmation went to a screen-reader-only live region.
- **Worse:** a second click to "try again" would silently reject the next card.

**Fix**
- **Confirmation in the card's place.** After Reject or Amend, an ice band reading "Rejected: Variant in Settings.tsx:42. Moved to Follow-ups as a code fix to do." renders where the card was, with a link to Follow-ups. Focus goes to that link, and Tab from there reaches the next card. Only the latest confirmation is shown, and loading new files clears it. The live-region text now also says "Moved to Follow-ups".
- **500ms double-click guard.** A second Reject/Amend within 500ms of a decision is ignored. The ignored press still moves focus to the button under the pointer, which would let Enter decide that card, so the guard puts focus back on the confirmation link.
- **`scroll-margin-top` on section headings,** so the Follow-ups link doesn't leave its heading flush with the top of the window. At 1.25 scale it landed 0.16px above the edge.

**Decisions**
- **Confirmation in place, not a toast.** A toast in a corner is easy to miss and disappears on its own. Putting the confirmation where the card was keeps it where the user is looking, and it pushes the next card's buttons out from under the pointer, at least for the first decision.
- **Guard by time, not layout.** Later confirmations replace earlier ones at about the same height, so the next card can still land under the pointer. Rather than rely on layout, the guard blocks the double-click directly. 500ms is about the default OS double-click interval and well under the time it takes to read a card.
- **Focus moves to the confirmation, no longer to the next card's Reject.** This changes the Phase 4 behaviour. Landing on the next Reject made Enter-Enter reject two cards without the second card ever being read.

**How it was verified**
- 59/59 tests pass.
- **New e2e check** (`decide-visible`), real mouse input at 125% zoom, no state calls, 25 checks:
  - Reject on the Block card, then a real double-click on Amend for the Ask card. Each decides exactly one card, and the double-click leaves the next card undecided.
  - Each time, the card leaves Decide, the confirmation text is right and fully on screen, focus is on its link, and the step bar and heading counts update.
  - The link focuses the Follow-ups heading with it on screen, and both decisions are waiting there.
  - With the keyboard, Enter on Reject leaves focus on the confirmation. An empty queue still shows the confirmation.
  - No console errors.
- **Problem in my own check:** the first version timed out instead of failing when the confirmation was missing (against the old live site). Missing elements now produce FAIL lines.
- **Run against the live site before the fix:** it fails, as expected, with 12 FAIL lines.
- **Rerun:** Resolve, IA and theme scripts all pass. They now pause 600ms between decisions, because the guard correctly ignores a second decision faster than that.

## Visual polish pass (2026-11-13)

**Scope:** nine items. Four came from my audit of the live site: spacing and alignment, snippets and consequence lines, log titles, a quieter "Your data". Five were added in the follow-up message: cards as panels, a segmented dial, consequence text inside the buttons, a sticky tab bar and a 760px column. Several reverse earlier rules in `CLAUDE.md` ("no cards", consequence text below the buttons, the 960px column). They were asked for explicitly, so `CLAUDE.md` is updated to match.

**Done**
1. **Spacing and alignment:**
   - The confirmation band now sits 24px from the next card, the same as the gap between cards. It was 64px: the band's margin plus the card's padding.
   - The dial help text lines up with the control's left edge. Before, a negative margin pushed the selected segment's ice fill 16px past it.
   - 16px under section headings, 48px between sections, so each heading groups with its own content.
   - 4px half-steps were removed, leaving the 8px scale.
2. **Snippets on ice, padded.** They scroll sideways rather than wrapping. When a snippet overflows (the Settings.tsx line at 390px), app.js shows "The line continues. Scroll sideways to read it all." under it and makes it keyboard-focusable. A text cue, because gradients are banned. Consequence lines carry `<wbr>` after each "." so `Button.allowedTokens.color` wraps at the dots, never mid-word.
3. **Log entries lead with the card's title** (the same `flagTitle`). Decision, dial and time come next, then file path and id as metadata. Paths break after "/".
4. **Quieter "Your data".** Drop zones have a dashed `--rule` outline, no fill, 13px text and 8px padding, in a narrower 280px column. Hover, drag-over and focus bring the slate outline back.
5. **Review cards as panels:** `--surface`, a 1px `--rule` border, 24px padding (16px under 640px), 24px gap. Reject/Amend and the note field sit on `--bg` inside the panel so they read as inset controls.
6. **Autonomy Dial as one bordered segmented control per rule:** a slate outline with slate dividers. The selected segment keeps the ice fill and underline (red for Block).
7. **Consequence inside the buttons.** Line 1 is the verb and its meaning ("Reject · The code is wrong"), line 2 is the consequence. The buttons stay identical and side by side at every width.
8. **Sticky bar.** The step tabs and the build status move out of the masthead into a bar that stays at the top, so the counts and "Build blocked" are always visible. That was the root of the earlier "Reject did nothing" report.
   - The tab for the section under the bar gets `aria-current="location"`. These are links, not an ARIA tablist: they jump within one page rather than switching panels.
   - At 390px the bar wraps to two rows and the status shows only its headline. The count stays in the accessible text.
   - In-page jumps and focus scrolling clear the bar through `scroll-padding-top`, set from the bar's measured height.
9. **760px reading column** (was 960px). The log grid went from three columns to two (meta | reason and outcome) to fit.

**Decisions**
- **No separate "polish directive" had reached me.** Items 5–9 were treated as new instructions when they arrived.
- **Snippets scroll with a text cue, not a fade.** A fade would be a gradient, which is banned.
- **The bar's clearance is measured, not fixed.** A fixed 80px worked at desktop, but the two-row mobile bar is about 90px, so jumps would have landed under it.
- **Double-click check relaxed slightly.** With padded cards, the second click of a double-click can land on the next card's panel, which takes focus. That's harmless (Enter on a card does nothing), so the e2e check now requires that focus isn't on a Reject/Amend button, rather than requiring it on the confirmation link.

**How it was verified**
- 59/59 tests pass.
- **New `polish` e2e script**, 32 checks at each of 1280px and 390px, all passing:
  - column width, card styling, padding and gap, and the band gap matching the card gap
  - the segmented control's border and dividers, and help text aligned with it
  - consequence lines inside both buttons, still identical and side by side
  - snippet on ice and padded; the scroll cue appears only when a snippet overflows
  - consequence lines wrap only at token boundaries, measured per character from layout
  - the bar is sticky and stays at the top, tab jumps land below it, and the current tab follows scroll
  - log entries lead with the card title, and drop zones are compact and quiet
- **Problem in my own check:** the first boundary check flagged normal word wraps as mid-word, because a space at a line break collapses to zero width. It now counts collapsed spaces.
- **Rerun:** decide-visible, Resolve, IA and theme all pass. IA now measures the Build blocked jump against the sticky bar: the card lands just below it, not at the top of the window.
- **Follow-up:** the first section's top rule was dropped. With the bar at its starting position, its bottom border and that rule showed as two parallel lines 48px apart. The bar's border is now the only line above the Autonomy Dial, and the 48px gap stays.
- **Follow-up:** the Build blocked badge is shortened to "Build blocked · 1".
  - **Why:** the full "Build blocked · 1 blocked deviation needs a decision" didn't fit beside the tabs in the 760px column, so the sticky bar wrapped to two rows on desktop (about 95px tall).
  - **Result:** it's now one row, 59px tall, at both 1280px and 1024px. At 390px the bar still wraps, as before, but now shows the count too.
  - **Screen readers:** the visible "· 1" is `aria-hidden`, and a visually hidden span carries the full sentence. The link's accessible name is "Build blocked 1 blocked deviation needs a decision", with no bare "1".
  - **Verified:** a new `badge` e2e script at 1280, 1024 and 390px checks the visible text (excluding hidden text), the screen-reader sentence, the hidden count, one row on desktop, and that the badge still focuses the blocking card. All pass.
  - **Problem in my own check:** `innerText` counts clipped screen-reader text, so the first version read both the visible text and the sentence. That also exposed a missing space in the markup ("Build blocked· 1" when copied), now fixed.

## Oversight and copy fixes (2026-11-14)

**Scope:** six fixes: two limits on Auto-fix, Amends that need more than one contract change, consequence text that broke inside tokens, a green resolved chip, a confirmation after Mark fixed / Mark applied, and US spelling.

**Done**
1. **Auto-fix no longer absorbs what a person should see.**
   - **No reason, no auto-fix.** A deviation with no agent reason stays in Decide under any dial. Its card adds "No agent reason, so a person has to decide." Core decides this (`canAutoFix`, `heldForReview`), so `reject`/`amend` accept it under Auto-fix and log `dialSetting: "auto-fix"`. The dial help says "…unless it gave no reason."
   - **Session dial changes are reversible.** Ids absorbed because someone turned a dial to Auto-fix during the review are tracked in `session.dialAbsorbed`. Moving that dial to Ask or Block removes their auto-absorbed entries, so they return to Decide (and to the build count under Block). Policy-absorbed deviations stay absorbed, and Reject/Amend decisions never move. The live region says how many returned.
2. **`alsoAllowTokens`** on lint-report deviations (optional list of token paths). `proposeChanges` returns every change: the one the snippet implies, plus one per extra token the component doesn't already allow. `proposedChange` in the log is now a list. dev-005 lists `color.danger`, so its Amend reads:
   - add "destructive" to Button.variants
   - add color.danger to Button.allowedTokens.color

   The card, Follow-ups and log show each change on its own line. `validate.js` checks the shape always, and existence against the contract in use when one is passed. `createSession` refuses a report whose tokens the contract lacks, which covers loading a new contract under an existing report.
3. **Tokens never break.** Consequences are now words plus `<code>` tokens with `white-space: nowrap`, so lines break only at a space, before a token. The `<wbr>`-after-dot approach is gone; it was what split `Button.` / `variants`.
4. **Resolved chip is green.** New `--success` `#44704C`: 5.36:1 on `--surface`, 4.99:1 on paper. It replaces the slate `--resolved`.
5. **Resolve confirmation.** Mark fixed / Mark applied in Follow-ups puts "Resolved: contract change in Settings.tsx:42. Moved to the decision log." in the item's place, the same band as the decision confirmation. Its link to the log entry gets focus, and the same sentence goes through the polite live region.
6. **"colour" → "color"** in all UI copy, explain.js output, comments and the README.

**Decisions**
- **Under 640px, the consequences move out of the buttons.** At 390px a half-width button has 134px for text. `Button.allowedTokens.color` is 204px at 13px mono, and even `variant="secondary"` is 149px. Unbreakable tokens, identical side-by-side buttons and consequences inside the buttons can't all hold at that width. So under 640px the buttons show only "Reject · The code is wrong" / "Amend · The contract is wrong". A full-width block under them lists "Reject:" and "Amend:" with their changes. That block is `aria-hidden`, because the in-button copy is visually hidden there but stays in each button's accessible name. Screen readers hear the same thing at every width. At 641px the narrowest button still has ~236px, so the breakpoint holds.
- **The green chip adds a second accent colour.** The request said "the existing green/success token", but the palette had none (the chip was slate). I added one muted green, used only for the resolved chip.
- **Returned deviations leave no log entry.** An absorption undone by the same session's dial change was never a decision anyone stood by, and keeping it would make `isDecided` true. If an audit trail of dial moves is wanted, it belongs in a separate event list, not the decision log.
- **`proposedChange` keeps its name but is now a list**, rather than being renamed. It changes the export shape either way, and keeping the name keeps the schema recognisable.
- **The resolve confirmation is for Follow-ups only.** Resolving from the log already flips the chip in place, under the pointer.

**How it was verified**
- 76/76 tests pass (59 before). New tests cover the no-reason rule on load and mid-session, deciding a held deviation, returning to Ask and to Block, policy-absorbed items staying put, decided items not moving, multi-change Amend, skipping already-allowed tokens, and `alsoAllowTokens` validation (shape, existence, seed file).
- **New `fixes` e2e script**, 28 checks at each of 1280px and 390px, all passing. It covers: no "colour" in the page; dev-005 Amend lists both changes; code tokens `nowrap`; no line break inside a token and no token spilling out of its box (measured per character); buttons side by side; no sideways scroll; held card and its line; absorb, return and announcements; policy-absorbed spacing staying put; changes listed in Follow-ups and the log; the resolve confirmation text, position, focus, link and live-region text; chip colour; no console errors.
- **Problem in my own check:** the classifier blocked starting a local HTTP server, so the script serves the repo files through Playwright request interception instead.
- **Live recheck** (https://drift-detector-psi.vercel.app, deployed about 20s after the push): `fixes` 56/56. Earlier scripts: polish 56, decide-visible 24, badge 14, ia 25, theme 2, all passing. Five of their assertions encoded the old spec and were updated: "colour" in the meta line, the new `--success` token, the new under-button block in the card order, `.follow-ups li` now also matching nested change items, and separate change lines read as one wrapped line.

## Polish pass 2: native-app finish (2026-11-14)

**Scope:** seven items, with a polished native app as the reference: one strong accent, a stat strip with big numerals, rendered previews in every card, white cards with soft depth, a four-size type scale, a pill dial, and motion on decide and resolve. Same structure and data, light theme, AA contrast. Several items reverse rules in `CLAUDE.md` (no shadows, no pills, no cards outside the review queue, slate-outlined Reject/Amend, five type sizes). They were asked for explicitly, so `CLAUDE.md` is updated to match.

**Done**
1. **One accent, as a fill.** Slate fills one hero element per section, with white text: the To decide tile, the selected dial segment and Export JSON (now a pill button). Everything else went neutral: step-tab underline, Reject/Amend outlines and hover, the note field and dial track all use ink or muted olive.
2. **Stat strip** under the intro: Found / To decide / Absorbed / Blocked as 36px bold tabular numerals over 13px muted labels. It re-renders with everything else, so it updates live. The Blocked tile turns red above 0. 2×2 under 640px.
3. **Rendered previews** above Reject/Amend in every card, from contract tokens in pure HTML/CSS. `src/core/preview.js` builds the data (unit-tested), and `render.js` draws it.
   - Variant: three drawn "Delete account" buttons. Agent built falls back to primary, because the contract has no destructive style yet. Reject draws secondary. Amend draws destructive in `color.danger`, which `alsoAllowTokens` lets it use.
   - Color: two swatches with hex, the agent's vs the token's.
   - Spacing: the button's padding at 2×, with the content box dashed and a measured bracket (10px vs 12px). For the `gap` flag, two buttons and a bracket under the gap.
4. **Cards:** white on the warm page, 16px radius, a two-layer soft shadow, no border. Snippets have a 10px radius.
5. **Type:** four sizes (36 / 24 / 16 / 13). The page title and numerals are 36. Section headings and the Reject/Amend verbs are 24 (verbs were 20; they stay the largest interactive text). Section gaps doubled from 48px to 96px (64px on mobile).
6. **Dial:** a pill segmented control. One `::before` thumb in the accent slides 150ms between equal segments, and turns red on Block.
7. **Motion:** 180ms ease. A decided card collapses into its confirmation line; a resolved follow-up does the same. `prefers-reduced-motion` turns off all transitions and animations, in CSS and JS.

**Decisions**
- **The accent is slate, not a blue.** The request said "the deepest blue in the existing Clarity palette". The palette's only blue is ice `#DFE5F3`, and white text on it is 1.26:1, so it can't be a fill. Slate `#557373` is the deepest cool colour in the palette, was already the accent, and holds 5.14:1 with white.
- **Decide has no accent element.** "Primary action" can't be Reject or Amend: they are deliberately identical so the interface doesn't suggest an answer. The accent fills nothing in that section.
- **"Agent built" draws the fallback, not the agent's intent.** The snippet says `variant="destructive"`, but nothing in the contract says what that looks like, so today it renders as the default variant. That makes the Amend drawing a real change, which is the point of "uses color.danger once Amend allows it".
- **Spacing is drawn at 2×,** with a caption saying so. 10px vs 12px is hard to see at 1×. The bracket labels keep the true px values.
- **Motion needed FLIP.** Every render replaces the DOM, so CSS transitions alone would never run. app.js starts the new element where the old one was: the dial thumb at its old `--pos`, the confirmation at the card's old height. Then it lets the change settle.
- **Contract values in style attributes are filtered** to hex colours and px lengths, because users can load their own contract. Anything else falls back to a safe default (tested).
- **`--surface` is now white,** so cards read as lifted off the paper page. `--text-muted` gains contrast on it (5.18:1).

**How it was verified**
- 84/84 tests pass (8 new, for `preview.js`: the three variant drawings and when `color.danger` appears, token padding and radius, swatches, padding and gap measurements, filtering of unsafe values, unknown rules).
- **New `polish2` e2e script**, 39 checks at each of 1280px and 390px, all passing:
  - stat values, size, weight and tabular figures, live update after a decision, Blocked red then white at 0
  - the only accent fills are the hero tile and Export; dial thumbs are accent, and red for Block; Reject/Amend are neutral and identical
  - pill shape; the thumb measured at start, mid-slide and end (it travels)
  - card colour, radius, border and two shadow layers; snippet radius; no left-border stripes
  - a preview above Reject/Amend in every card; drawn colours, padding at 2× (20px and 24px) and gap (12px and 16px); labels line up; nothing overflows
  - only 13/16/24/36px across all rendered text; 8px grid; sentence-case labels
  - AA contrast for every visible text element against its effective background (including the dial thumb)
  - decide and resolve start a 180ms animation from the card's height; reduced motion leaves no animations or transitions
- **Problems in my own check:** the contrast walk missed the dial's `::before` fill and read the selected white text as 1:1; the sentence-case check flagged code identifiers and second sentences. Both fixed in the script; the page was right.
- **Problem found in review:** in the spacing card, the stages differed in height, so the labels didn't line up. Fixed with CSS subgrid rows.
- **Problem found in review:** at 390px, Export JSON wrapped under the Decision log heading and sat flush against the ice band. The heading's bottom margin now lives on the heading row, so a wrapped action keeps the 24px gap (checked: at least 16px).
- **Live recheck** (https://drift-detector-psi.vercel.app): polish2 77/77, fixes 56/56, polish 46, decide-visible 24, badge 14, ia 25, theme 2, all passing. In the older scripts, assertions for rules this pass replaced were updated or retired: bordered cards, the divided dial, 16px under headings, card order without the preview, the old surface colour, and contract colours in drawings. The theme script's contrast walk now reads the dial thumb's `::before` fill.
- **Screenshots** from production, desktop (1280px, 2×) and 390px: `docs/polish-pass-2/` (top with the stat strip, Set, decision cards for variant, color, padding and gap, Record).

## Visual redesign: indigo (2026-11-14)

**Scope:** a full visual redesign on the same structure, logic, data and tests. It replaces the Clarity palette and the pass-2 styling: page `#F4F5F9` with a dot grid, white surfaces, indigo `#2D2FA3` fills, red only for Block. Sora, Inter and JetBrains Mono from Google Fonts. New pieces: a branded header, icon stat cards, a contract hero, an icon tab bar, a single-card dial, indigo-banded decision cards that collapse to rows, and white Reject/Amend cards with icon tiles. `CLAUDE.md` is rewritten so none of the old visual rules remain.

**Done**
- **Header:** 44px gradient logo tile with a drift glyph (a baseline with a line curving off it, ending in a dot). Wordmark "Drift" 700 + "Detector" 300 indigo, with the tagline. On the right, "Load your files" and the build badge (red with an octagon and glow while blocked; white and bordered when clear).
- **Stat cards:** an icon tile, the number in Sora 26/600, and a label. To decide is solid indigo; Blocked turns red.
- **Contract hero:** component, contract and version, counts of variants and allowed tokens, and a "Drift by rule" bar chart from the report. On the right, an inline SVG anatomy of the Button. Its callouts come from the contract: `radius.md`, `spacing.3`, `color.primary` with a real swatch. The red "variant?" pill shows only when a variant deviation exists.
- **Tabs:** icon, label and count chip; the active tab is indigo. A 4-up icon grid on phones.
- **Dial:** one card with a row per rule: icon tile (red on Block), name, meta line with counts and the dial's meaning, and a segmented control (indigo, or red for Block). The 150ms slide is kept.
- **Decision cards:**
  - Indigo header band with a glass rule icon, dial chip, rule name, Sora 20 title, and file:line top-right.
  - The offending value is marked in the snippet. "Why flagged" and "Why the agent did it" are side-by-side tiles.
  - Previews are separate dot-grid tiles at true size, with shadows in each button's own color.
  - Reject/Amend show "→" and "+" consequence lines in mono.
  - Cards after the first collapse to rows with swatches for color flags; click expands, the chevron folds back.
- **Follow-ups, Record, Your data:** white cards with hairline rows, decision chips, and an indigo-tint confirmation band.

**Decisions**
- **Red text on the red tint is a darker red.** `#C93A2E` on `#FBE7E5` is 4.28:1, under AA for 13px code, so the marked value uses `--red-text` `#A8301F` (5.68:1). The base red stays the fill (white on it 5.09:1).
- **Muted text never sits on the indigo tint** (4.30:1). Hero labels in the glow corner are white (6.44:1 on the brightest blend), not `#C9CCF6` (4.12:1).
- **Missing reasons and errors are no longer red.** "Red for Block/blocked only" leaves them ink, bold, with an indigo alert icon. The missing-reason tile also gets a dashed indigo edge. Before, red was their signal.
- **The resolved chip is indigo on the tint.** The new palette has no green, which replaces last pass's green chip.
- **The build badge moved from the sticky bar to the header,** as specified. While blocked, the Blocked stat card is red too.
- **Previews are true size,** so the spacing drawing is 1× (10px vs 12px), with the measured brackets carrying the values. The pass-2 2× scale is gone.
- **The anatomy's "height 36" is the drawing's own annotation:** the contract has no height token. The other callouts come from the contract, so a user-loaded contract relabels them.
- **The wordmark has a visually hidden space,** so screen readers say "Drift Detector", not one word.
- **On phones, Reject/Amend drop their icon tiles.** At half width the tile squeezed "The contract is wrong" onto three lines.

**Problems found**
- **Tab flash on every render (fixed).** The contrast walk found the active tab's count chip at 1:1. The cause was real: every render rebuilt the tabs without `aria-current`, so the indigo fill re-animated from transparent for 150ms after every click. `render()` now carries the current tab into the new markup.
- **Drawn buttons wrapped at 390px (fixed).** "Delete account" broke onto two lines in the narrow preview stage, which isn't true size. Drawn buttons are now `nowrap` in a wider stage.

**How it was verified**
- 89/89 tests pass. That includes the lint-contract tests from the previous change, which isn't committed yet; 84 are in this commit's tree.
- **New `redesign` e2e script,** at 1280px and 390px:
  - palette and dot grid; fonts loaded and used where specified; the type sizes
  - header pieces; stat cards; hero content, texture and phone stacking; tabs
  - dial rows, tiles and thumbs; card band, marked snippet, why tiles, preview tiles (true size, one line, coloured shadows)
  - Reject/Amend identical, with hover lift and indigo border; the note field
  - collapse, expand and fold-back with focus; red used only for Block/blocked
  - AA contrast for every visible text element; no sideways scroll; decide animation; build clear styling; reduced motion
- The `fixes` script was updated for collapsed rows, "+" lines and the indigo chip. It passes.
- **Live recheck** (https://drift-detector-psi.vercel.app): redesign 104/104, fixes 56/56, decide-visible 24/24, all passing. One decide-visible assertion read the old "Follow-ups (1)" tab text and now reads label plus count chip; the counts were right.
- **Screenshots** from production, desktop (1280px, 2×) and 390px, in `docs/redesign/`: top, the Block decision card, Record. The first top shot caught the tab fill mid-slide after scrolling back up, so it was retaken after a 400ms settle. That was a capture-timing artifact, not a page bug.

## Fixes from live review: sticky bar, highlight, Set chip, hero shadow

**What changed**
- **Sticky bar is a full-width bar, not a floating pill.** The tabs' white container is gone; tabs sit straight on the bar, on the left. Once the bar sticks it frosts (`rgba(244,245,249,.85)`, 12px blur) and gets a 1px `#EEF0F5` hairline.
- **Build badge back in the bar,** on the right, the same component as the header's (red link while blocked, white bordered "Build clear" otherwise). The header badge stays. The bar copy is not a live region, so the status is announced once, and it has its own focus key so re-renders restore focus to the right one.
- **Highlight wraps the whole quoted value** (`"destructive"`, not `destructive`), inline with `padding: 0 2px`, so it adds no visible gap around the value.
- **Set has no count chip.** The number of rules never needs attention; the other three counts do.

**Decisions**
- **The bar is clear until it sticks.** That's also the hero-shadow fix (below): a background that's always on paints over the shadow.
- **On phones the bar badge is icon and count only.** "Build blocked" plus four tabs don't fit 358px in one row; the label stays for screen readers.
- **On phones the tab count chips moved to the icon's corner.** Stacked under the label they made the bar 94px tall, about an eighth of a 390px screen; on the corner each tab is two lines.

**Problems found**
- **The hard edge under the hero wasn't a clipping parent.** No ancestor of the hero has `overflow` other than visible (checked in the browser). The hero's shadow (`0 18px 40px`) reaches about 58px below it, and the sticky bar, 24px below the hero, had an 88%-opaque background that painted over it in a straight line. Making the bar clear until it's stuck lets the shadow fall onto the page.

**How it was verified**
- 89/89 unit tests (84 in this commit's tree; the rest are the uncommitted lint-contract tests).
- New `stickybar` e2e script at 1280px and 390px, all checks passing: bar clear before scroll, no clipping ancestor, full width, tabs left / badge right in one row, red badge links to and focuses the blocking card, no second live region, no pill container, Set chip gone, mark is `"destructive"` with `0 2px` inline, stuck bar frosted with blur and hairline, "Build clear" white bordered, no console errors.
- `redesign` (104/104) and `fixes` (57/57) still pass. The redesign checks for the white tab pill, the Set chip and the unquoted mark were updated to the new spec.

## Preview tiles: equal height at every width

**What changed**
- **Side by side (above 640px):** every stage is a fixed 120px (`--stage-h`) with the drawing centred, and the tiles share their rows through CSS subgrid (stage, label, caption). Tiles in a row are the same height, and labels and captions start on the same line.
- **Stacked (640px and under):** the drawing column is as wide as the widest drawing, shared through subgrid so the stage edges line up. Every tile in a card is the same height (at least 104px, `--stage-h-phone`), and the text starts at the same offset in each.

**Problems found**
- **641–900px: the Reject tile was 20px taller.** The stage had `min-height` and wrapping content, so the drawn white button (with its border and shadow) made its stage taller. That pushed its label and caption down. Desktop widths hid it because there the content fit 112px everywhere.
- **Phones: tile heights followed caption length,** so "If you Reject" (one line) was shorter than the other two.

**Decisions**
- **On the narrowest phones (360px and below), tiles grow together rather than clip.** A fixed 104px clipped the variant captions at 360 and 320px. Tiles stay equal within a card, but the variant card's tiles are taller than the color card's. From 390px up every stage is the same height across all cards.

**How it was verified**
- New `previews` e2e script at 1280, 1024, 900, 768, 700, 641, 640, 520, 390, 360 and 320px, with every card expanded. Per row it checks equal tile heights, a fixed stage with no overflow, the drawing centred within 2px, labels and captions aligned, and captions not clipped. From 390px up it also checks one stage height across all cards.
- 89/89 unit tests. `redesign` 104/104, `fixes` 56/56, `stickybar` 32/32.

## Stress test data as a second built-in dataset

**What was built**
- `data/stress/` holds a second set of the four files (provided by the project owner, added unchanged): 15 deviations, 6 color, 5 spacing, 4 variant, all on Ask or Block, 5 with no reason, long paths and snippets, an `rgba()` color, a two-value padding, a `size` prop alongside a variant, and an orphan reason.
- `?data=stress` opens it; no param, or any other value, opens the demo. The source line reads "Using stress test data", and "Stress test data for the rest" after an upload.
- `src/core/datasets.js` loads a built-in set through the same `validate.js` checks as an upload, then `createSession`. The demo now goes through them too.
- **Reset to demo data** always returns to the demo and drops `?data=` from the URL, so a reload doesn't bring the stress set back.

**Decisions**
- **A built-in set that fails its checks doesn't load at all,** rather than mixing in demo files. The page lists every problem by file path (`data/stress/policy.json: …`) and links to the demo. The empty hero, stats, tabs and "Load your files" link are hidden in that state; before, an empty hero band showed above the error.
- **Dataset logic lives in core with fetch passed in,** so it's unit-tested without a browser.
- **The orphan reason (`dev-099`) is accepted and ignored,** the same as for an uploaded reasons file.

**Problems the stress set exposed (fixed in the next change)**
- **Amend for a non-hex color overflows its button.** For `rgba(37, 99, 235, 0.08)` the proposal falls back to one unbreakable line ("allow \`background: rgba(…);\` under no-hardcoded-color"), which runs past the Amend button at 1280px and is clipped.
- **A long file path is clipped in the card header at 390px** (`src/features/billing/components/UpgradePlanBannerWithAnnualDiscountCallout.tsx:87`).
- **The title is wrong when the hard-coded value equals the token:** "Text color #FFFFFF is a shade off color.surface (#FFFFFF)".

**How it was verified**
- 97/97 unit tests, including 8 new ones for `datasets.js`: param parsing (prototype keys like `?data=toString` fall back to the demo), paths, validation problems named by path, the report checked against the set's own contract, and a missing file.
- New `stress` e2e script (19 checks, with a stand-in set served only by the harness): default demo, unknown values, stress source line and fetches, upload on top, Reset, a set that fails its checks, and missing files.
- New `stress-real` e2e script on the real files at 1280px and 390px: 32 of 34 checks pass. It loads, with 15 found and 15 to decide. The badge reads Build blocked · 4, and the hero shows 1.1.0 with bars 6/5/4. Every card opens and every snippet has its marked value. The 5 missing reasons are flagged, and there's no page-wide sideways scroll. Preview tiles are equal height and Reject updates the badge. There are no console errors. The 2 failures are the clipping problems above.
- `redesign`, `fixes`, `stickybar` and `previews` still pass.

## Stress-data display fixes

**What changed**
- **Long proposed values wrap inside the button.** A code value over 32 characters may wrap, but only after its spaces and commas. Each run between them is unbreakable, so "no-hardcoded-color" never splits at a hyphen. Short tokens stay `nowrap`, as before. The dev-004 Amend line ("allow \`background: rgba(37, 99, 235, 0.08);\` under no-hardcoded-color") now takes 2 lines inside the button at 1280px.
- **Long paths are middle-truncated in the header on phones.** `shortPath` keeps the first two folders, then "…", then the file name. A long name is itself cut in the middle: the first 17 and last 7 characters of the stem, plus the extension. The header breaks only after a slash. The full path is in the header's `title`, is what screen readers get, and is shown as a "File" line at the top of the card body. Desktop still shows the full path in the header, and paths of 40 characters or fewer are unchanged at every width.
- **Same value as the token.** When a hard-coded hex equals the suggested token's value (case and 3-digit shorthand normalised), the title reads "Hard-coded #FFFFFF instead of color.surface (same value)". Reject's consequence adds "The value stays #FFFFFF; only the token reference changes." Before, it read "a shade off color.surface (#FFFFFF)", which claimed a difference that isn't there.
- **Stress data:** dev-004's `suggestedToken` changed from `color.surface` to `color.primary` at the project owner's request: the nearest allowed color to a primary tint.

**Problems found along the way**
- **Breaking after an ellipsis.** The first version of the phone header broke after "…" ("UpgradePlanBanner…" / "Callout.tsx:87"), because an ellipsis is a line-break opportunity. So did a hyphen in the Amend line. Wrapping each run in an unbreakable span leaves only the intended break points.
- **Words running together for screen readers.** The two Reject lines had no space between them in the markup, so the button's text read "color.surfaceThe value stays". There's now a full stop and a space.

**Still open (fixed in the next change)**
- **dev-004's title is the generic fallback,** "This line breaks the rule no-hardcoded-color", and its Amend is "allow \`…\` under no-hardcoded-color". The explain and proposal code only recognise hex colors, not `rgba()`. Now it wraps instead of clipping, but a plain-language title and an "add rgba(…) to Button.allowedTokens.color" proposal would be better.

**How it was verified**
- 106/106 unit tests. New ones cover the same-value title (case, shorthand, inline styles), `sameValueAsToken` (the token and value Reject shows; null for a near miss, another token, an unknown token, `rgba()` and a non-color rule), the stress set's dev-006, and `shortPath`.
- `stress-real` on the real files at 1280px and 390px, 44/44:
  - dev-004 Amend wraps inside its button, and every short token is still `nowrap`.
  - dev-004 Reject is `color.primary`.
  - dev-006's header is shortened at 390px, with the full path in `title` and the body. At 1280px it shows in full, with no body line.
  - Short paths get no `title` or body line.
  - dev-006's title and Reject text are right, and the button's text has no run-together words.
  - Nothing is clipped anywhere.
- `redesign` 104/104, `fixes` 56/56, `previews` 174/174, `stickybar` 32/32, `stress` 19/19.

## rgb() and rgba() colors

**What changed**
- **New `src/core/colors.js`** parses hex (3, 4, 6 and 8 digits) and `rgb()`/`rgba()` (comma or space syntax, alpha as a number or a percentage) into channels and alpha. Explain, proposals and preview all use it, replacing three separate hex-only regexes.
- **Titles.** A see-through color near its token reads "Fill rgba(37,99,235,0.08) is a tint of color.primary". An opaque `rgb()` gets the same titles as hex: same value, another token, a shade off, or not a color.
- **Amend** adds the color as written: "add rgba(37, 99, 235, 0.08) to Button.allowedTokens.color". Hex is still uppercased.
- **Swatches** draw on a white chip, as a gradient layer over `#FFFFFF`. An 8% tint shows as it would on a white surface instead of over the preview's dot grid. The same applies to the collapsed row's dots.

**Decisions**
- **"Tint" means see-through and near the token** (within the same RGB distance used for "a shade off", ignoring alpha). A see-through color far from the token still says it isn't a Button color, rather than claiming a tint relationship.
- **Titles use the compact form, `rgba(37,99,235,0.08)`; Amend uses the snippet's own text.** The title is prose, where the compact form reads as one value. The Amend line names what goes in the contract, so it matches the code.
- **Nothing from a snippet reaches a style attribute as written.** The swatch fill is rebuilt from the parsed numbers (`rgba(37, 99, 235, 0.08)`), so a snippet like `rgb(1, 2, 3) url(x)` can't carry anything else in. Tested.
- **An opaque `rgba(255, 255, 255, 1)` now counts as the same value as `#FFFFFF`.** One earlier test asserted the opposite, because only hex was understood; it now asserts this, plus that a see-through white doesn't match.

**How it was verified**
- 122/122 unit tests. New `test/colors.test.js` covers every hex length, comma and space syntax, percentage alpha, first match in a line, out-of-range values, opaque-only sameness, and the Amend text for rgba and hex. New explain tests cover the tint title, shade-off, other-token and not-a-color titles for opaque `rgb()`, a far see-through color, and the stress set's dev-004. New preview tests cover the rgba swatch values and that only rebuilt CSS reaches the style attribute.
- `stress-real` at 1280px and 390px, all passing. dev-004's title is the tint title, its Amend is the rgba line (it fits in the button), and its swatch is the rgba on a white chip, labelled `rgba(37,99,235,0.08)`.
- `redesign` 104/104, `fixes` 56/56, `previews` 174/174.

## Dark-blue palette (2026-11-15)

**What changed**
- Indigo is replaced by dark blue throughout `styles.css`: fills, links, icons, tints, gradients, the hero glow, hero bars, callout strokes, and every shadow and glow. Neutrals moved from indigo-grey to blue-grey. Red and the preview's contract colors are unchanged.
- **Variables renamed** to match what they hold: `--indigo` → `--brand` (`#1E3A8A`), `--indigo-hover` and `--logo-a` → `--brand-light` (`#2F5BD3`), `--logo-c` → `--brand-deep` (`#172F6E`), `--on-indigo*` → `--on-brand*`, `--bar-indigo` → `--bar-blue`, `--shadow-indigo` → `--shadow-brand`.

| Role | Old | New |
|---|---|---|
| Brand fill | `#2D2FA3` | `#1E3A8A` |
| Brand deep | `#1E2080` | `#172F6E` |
| Brand light / accent | `#4146D8`, `#5B61E6` | `#2F5BD3` |
| Tint | `#E9EAFB` | `#E6EDFB` |
| Hero glow | `rgba(98,104,240,.55)` | `rgba(59,130,246,.40)` |
| Hero bar (colors) | `#9EA2F5` | `#8FB0F5` |
| Callout lines | `#C9CCF6` | `#C3D3F5` |
| Muted on brand | `#CACBE8` | `#CDD7EC` |
| Ink / body / muted | `#121433` / `#2A2D4A` / `#686C8A` | `#0F1A2E` / `#26324A` / `#5F6B80` |
| Page / dot grid | `#F4F5F9` / `#D5D8E6` | `#F4F6F9` / `#D3D9E3` |
| Track / border / hairline | `#F0F1F7` / `#DDE0EA` / `#EEF0F5` | `#EEF2F7` / `#D9DFE8` / `#ECEFF4` |
| Code / why / stage / row hover | `#F4F5FB` / `#F7F8FB` / `#FBFBFD` / `#FAFAFE` | `#F3F6FA` / `#F6F8FB` / `#FAFBFD` / `#F8FAFD` |
| Shadows | `rgba(45,47,163,x)`, `rgba(18,20,51,x)` | `rgba(30,58,138,x)`, `rgba(15,26,46,x)` |

**Decisions**
- **Four values weren't in the brief** (muted-on-brand, why tile, preview stage, row hover). They leaned violet, so each got the blue-grey equivalent. Muted-on-brand went one step lighter than plain white-at-75% (`#CDD7EC`, not `#C5D0E8`), so it passes AA even inside the hero's glow corner (4.64:1; the darker one was 4.33).
- **The brief's "Bars #8C91F5" and "Code bg #E6E8F2" weren't in the file.** The actual hero bar was `#9EA2F5`, so that is what became `#8FB0F5`. No `#E6E8F2` existed.
- **Renamed the variables** instead of leaving `--indigo: #1e3a8a`, so the stylesheet doesn't describe a color it no longer uses.

**Contrast (WCAG)**
- Text: ink 17.39:1 on white; body 12.82; muted 5.38 on white, 4.97 on page, 4.79 on `--track` (its lowest surface), 4.58 on `--tint`. White on brand 10.36, on brand deep 12.59, on glass over brand 7.41, in the glow corner 6.71. Brand on white 10.36, on tint 8.81. Muted-on-brand 7.17 on brand, 4.64 in the glow corner. Red pairs unchanged (white on red 5.09, red-text on red-tint 5.68, red on page 4.70).
- Non-text: focus ring 5.90 on white, 5.45 on page; callout lines 6.88 on brand; hero color bar 4.78 on brand.

**How it was verified**
- Every palette hue except red sits between 213° and 224°. A browser sweep of every computed color on the page (text, backgrounds, borders, outlines, shadows, gradients, SVG fill and stroke, every card open, bar stuck) at 1280px and 390px found no hue between 250° and 330°. A grep for every old hex and rgb value in the CSS, HTML and JS finds nothing.
- 123/123 unit tests. `redesign` 104/104 (expected colors updated; its AA check on all visible text passes), `fixes` 56/56, `stickybar` 32/32.
