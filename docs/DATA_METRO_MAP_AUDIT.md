# Data Metro Map — forensic audit methodology, coverage and maintenance

Companion document to two artefacts built from the same audit:

| File | What it is | Who it is for |
|---|---|---|
| [`docs/data-journeys.html`](./data-journeys.html) | **Start here.** 19 journeys through the app. Pick one, press **Play**, and watch each exchange animate step by step with plain-English narration. Technical detail — endpoint, payload, SQL, validation, source line — sits in a side panel, in the order the events happen. | Anyone: product, operations, a new engineer, a stakeholder who needs to understand a flow |
| [`docs/data-metro-map.html`](./data-metro-map.html) | The exhaustive reference: 307 stations and 386 edges covering **every** page, control, endpoint, table and external system in one zoomable map. | Engineers auditing coverage, tracing a specific control, or checking nothing was missed |
| [`docs/JOURNEY_VALIDATION_GUIDE.md`](./JOURNEY_VALIDATION_GUIDE.md) | The brief for validating the journeys against the **running** UAT application in a browser: per-journey scripts, environment caveats, scope rules, and a gap-recording template. | An independent reviewer driving the real app |

The journeys file is a readable path through the same evidence, not a simplification of it: every step carries the same `file:line` citations. It covers the flows that matter; the metro map is what guarantees nothing is missing.

- **Audited commit:** `cf1000de5625801a57164a957fd6b9402cd881ce` (branch `UATNew`)
- **Audit date:** 2026-09-30
- **Scope:** the entire application — every page, every actionable control, every API route and method, every table, and every external system
- **Method:** static forensic read of the repository. Code and migrations were treated as authoritative; existing documents under `docs/` were treated as leads to verify, never as evidence.

---

## 1. What the deliverable answers

`docs/data-metro-map.html` is a single self-contained file (no build step, no server, no CDN, no network) holding an interactive metro map of every data flow in the application. For any control a non-developer can point at, it answers:

| Question | Where it is answered |
|---|---|
| Which screen and which exact control starts this? | Control station; label and CSS class replicated from the repository |
| What event/function does it invoke? | Control drawer → **Handler** (`file:line`) |
| Which endpoint and method? | API station → **HTTP contract** |
| What is the exact request payload? | **Request payload** field table (name, type, required, example, notes) |
| What auth, authorization, feature flags, preconditions and field validation apply? | Validation-gate stations + **Validation, in code order** |
| Which service handles it? | Service station → **Steps, in order** |
| Which tables / external systems / browser storage are touched? | Store and external stations; **Data operations** |
| Read, insert, update, upsert, delete, push, derive or cache? | Edge verb + operation colour |
| What is returned, and how are success, partial success, warning and failure shown? | Result stations, with all four states distinguished |
| For multi-step flows: order, transaction boundaries, partial-failure behaviour? | Flow **order**, **transaction**, **partialFailure**, **idempotency** |

Every station and every edge carries repository evidence as `file:line-range` plus the relevant symbol, resolved through a 142-entry evidence registry.

---

## 2. Method

1. **Read every applicable `AGENTS.md` first.** A recursive search found **none** anywhere in the repository, and no `CLAUDE.md` or `.cursorrules` either. There were therefore no repo-specific rules to obey beyond the task brief. This was checked before any file was written.
2. **Inventoried pages by file, not by navigation.** `find app -name page.tsx` → 23. Comparing against `components/shared/app-navigation.tsx` showed only 12 are reachable from the mega-menu, so **11 pages are URL-only**, including three admin/debug screens and the QPart hierarchy, metadata and compatibility editors.
3. **Inventoried API surface by exported method, not by file.** 67 route files export **88 `(method, route)` pairs** — the brief estimated ~50 files, so the real surface is 34% larger.
4. **Traced each control end-to-end** through handler → `fetch` → route → validation → service → SQL/external client, reading the actual statements rather than inferring them.
5. **Read the schema and all 15 migrations**, and distinguished internal Neon tables from the external PostgreSQL tables even where names overlap conceptually.
6. **Extracted validation only from code.** No rule appears in the map unless a specific line enforces it. There is no schema-validation library in `package.json`, so every rule is a hand-written check in a service.
7. **Mechanised the claims that are countable.** Guard census, transaction census, orphan detection, env-var extraction and table cross-referencing were all done with scripts, then re-run as acceptance tests against the finished map.

### Corrections made during the audit

Two of my own intermediate findings were wrong and were corrected before publication — recorded here because they affect how much weight to put on similar claims:

- **Env-var count.** An initial grep for `process.env.X` missed keys read through helpers (`readOrDefault('CPQ_INSTANCE', …)`), and a follow-up single-line grep then missed `CPQ_BASE_URL` because its call spans two lines. The multiline-aware scan gives **47**, which is what the map states and what the acceptance test enforces.
- **External transaction control.** A case-**sensitive** grep for `BEGIN`/`COMMIT`/`ROLLBACK` returned nothing and I briefly concluded there was no transaction control in `lib/external-pg/` at all. A case-insensitive search found three lines — all inside `runExternalVariantTablesWriteDiagnostic`. The accurate statement, now in the map, is that transaction control exists **only** in the rollback-always write diagnostic and in **no production external write path**.
- **Two outbound hosts initially missed.** The first external-system list was built from the known integrations. Sweeping every `https://` literal in the code surfaced `flagcdn.com` (country flag SVGs fetched by the operator's *browser* on both allocation pages) and `via.placeholder.com` (mock data only). Neither carries application data, but both are real outbound boundaries, so they are now modelled as a sixth external system.

Two defects in the deliverable itself were caught by its own acceptance tests and fixed:

- **The coverage panel computed "unexplained" by subtraction**, which double-counted: a control can be both wired into a flow *and* classified (a client-only control still has an edge to browser storage). It displayed `-15`. It now computes a set difference — neither wired nor classified — and the browser test asserts the rendered tiles read `0`.
- **The first layout squeezed all 307 stations into a narrow vertical column**, so fit-to-screen scaled everything to ~0.19 and nothing was readable. Stage columns now size themselves to their busiest lane and wrap into sub-columns, shared stations get dedicated columns disjoint from the domain lanes (making station overlap impossible by construction — the overlap detector confirms **0**), and the aspect ratio is 1.55 rather than 0.36.

---

## 3. Inventory totals

| Inventory | Count | Note |
|---|---:|---|
| Page files (`app/**/page.tsx`) | **23** | 12 in navigation, **11 URL-only** |
| API route files | **67** | brief estimated ~50 |
| `(method, route)` pairs | **88** | GET 30 · POST 42 · PUT 10 · DELETE 11 · PATCH 1 |
| Actionable controls inventoried | **78** | 62 wired to a traced flow, 16 classified navigation/client-only |
| `fetch(` call sites | **86** | across 21 files |
| Distinct tables (schema + migrations) | **24** | all 24 referenced in code — no unused tables |
| Stored functions | **2** | `app_list_pk_sequence_health()`, `app_resync_pk_sequence()` |
| External PostgreSQL tables | **2** | `variants`, `variant_eligibilities` |
| External systems | **6** | CPQ, CPQ Copy (orphaned), BigCommerce, Vercel Blob, OpenAI, asset CDNs |
| Environment variables | **47** | excluding `NODE_ENV` |
| Migrations | **15** | partly supersede `sql/schema.sql` |
| `lib/` modules | **56** | |
| Component files | **45** | largest: `bike-builder-page.tsx` at 4033 lines |
| **Map stations** | **307** | 0 overlapping, verified geometrically |
| **Map edges** | **386** | every one carries a verb and a direction marker |
| Evidence entries | **142** | all referenced; none orphaned |

---

## 4. Coverage

Coverage in the HTML panel is **computed in the browser from the embedded inventories at load time**, not typed in. The acceptance tests below re-derive the same numbers from the repository and diff them.

| Dimension | Discovered | Mapped | Unexplained |
|---|---:|---:|---:|
| Pages | 23 | 23 | **0** |
| Actionable controls | 78 | 78 | **0** (62 in a flow + 16 classified) |
| `(method, route)` pairs | 88 | 88 | **0** (88 in a flow; 8 also classified, 6 flagged orphan) |
| Tables in SQL | 24 | 24 | **0** |
| Tables referenced in code | 24 | 24 | **0** |
| External systems | 6 | 6 | **0** |
| Data-store objects (incl. functions and external) | 28 | 28 | **0** — every one touched by ≥1 edge |

**Five pages have no data flow**, each justified: `/` and `/bike-builder` are server `redirect()` calls; `/cpq/process` and `/cpq/ui-docs` are static documentation; `/admin/data-point` renders a constant. (`/cpq/results` and `/qpart` *do* read data and are mapped — see §6.)

### Orphans — reachable over HTTP with no caller

Found by searching `app/`, `components/` and `lib/` for each route path and each exported symbol.

| Operation | Why it matters |
|---|---|
| `GET /api/cpq/configuration-references` | Returns the full row including `json_snapshot`, unauthenticated. The UI uses `/api/cpq/retrieve-configuration` instead. |
| `GET /api/qpart/compatibility` | Duplicate of `GET /api/qpart/compatibility/reference-values` — same service function; only the latter has a caller. |
| `PATCH /api/setup/users/[id]/status` | Can deactivate **any** account, fail-open, with no caller anywhere. |
| `GET /api/debug/external-postgres-test` | Discloses external host, port, database, schema and SSL settings. |
| `POST /api/debug/external-postgres-test` | Byte-identical behaviour to the GET. |
| `POST /api/debug/external-postgres-write-test` | Opens **write transactions** against the external production database, unauthenticated. |
| `lib/cpq/runtime/copy-configuration.ts` (whole module) | A complete CPQ CopyConfiguration client — `copyConfigurationToCanonicalDetail` and `getCanonicalCopyCapability` have **zero** callers. Matches `docs/CANONICAL_SAVE_CAPABILITY_GAP.md`. |

---

## 5. Special flows explicitly verified

Each of these was traced a second time, and every destructive or external-write flow was re-read independently.

| Flow | Verified finding |
|---|---|
| Login / logout / session | scrypt + `timingSafeEqual`; only the SHA-256 hash of the token is stored; session lookup requires `is_active = true`, so deactivation invalidates live sessions instantly. **No rate limiting.** |
| Per-page permissions vs client admin mode | `PageAccessGate` is client-only. "Admin mode" is a `sessionStorage` flag set after a password comparison in browser JavaScript. |
| CPQ init → configure → finalize → canonical → sampler | **Three untransacted calls**, all issued by the browser. Three distinct split-brain states, documented per boundary. |
| Retrieve / replay | Retrieve opens a **brand-new** CPQ session; the returned `sessionId` is not the saved one. |
| Image-layer lookup | Driven by `cpq_image_management`; features flagged `ignore_during_configure` silently vanish from the preview. |
| Mock vs remote | `CPQ_USE_MOCK=true` short-circuits init and configure but **not finalize** — there is no mock branch on finalize. |
| Copy-configuration | **Orphaned.** Complete client, zero callers. |
| Bike allocation single toggle | Five sequential steps, no transaction: BC read → prior-state read → UPDATE → audit INSERT → external push. |
| Bulk update / bulk push | Scope hardcoded `current_page` **server-side** for bikes. Bulk push has **no confirmation dialog** despite writing to another system. |
| External status | The only thing that populates the ✓/≠ sync glyphs; blank until pressed. |
| Launch into CPQ | Small context in the query string; bulky replay payload in `sessionStorage` under a one-shot token, removed on read. |
| BigCommerce gating | `bc_ok = both ids present AND bc_status = 'OK'`. **The table that sets this is writable with no authorization.** |
| Internal save vs external sync | Separate systems, no cross-database transaction; `variants` always written before `variant_eligibilities`. |
| Audit logging | Written by toggle and bulk-update paths **only** — push paths write nothing, so pushes are invisible to the audit page. |
| QPart allocation equivalents | Same shape, plus a **lazy back-fill** that inserts rows before the requested write. |
| Update-all authorization | Genuine second factor (Edit required first), but with a hardcoded in-code fallback password and a non-per-user HMAC cookie. |
| QPart CRUD / hierarchy / metadata | Hard deletes, three with **no confirmation dialog at all**. |
| Compatibility derivation | Read-only; suggestions persist only if kept and saved. |
| Localization / AI translation | Base value mandatory; OpenAI output written straight to the database, one write per locale, no review step. |
| CSV preview / apply / export | `dryRun` defaults to **true** — the safest write pattern in the QPart domain. Rows still applied non-transactionally. |
| Image upload / delete via Vercel Blob | Upload: blob then metadata (recoverable). **Delete: blob first** — the route's own 500 admits "manual metadata cleanup may be required". |
| CPQ setup CRUD / picture sync / flags | Feature flags update **every row** sharing a label. Sync moves its watermark **before** writing the harvested data. |
| CPQ replay validation | Run is genuinely read-only. Overwrite is the **only** properly-fenced write in the app — see below. |
| User management / status / permissions | **Authorization fails open for anonymous callers.** |
| Sequence resync + external PG diagnostics | Guarded only by a forgeable `x-admin-mode: true` header, and one of them writes. |

### The one flow that gets it right

`POST /api/admin/cpq-replay-validation/overwrite` is worth studying as the in-repo reference for how the others should look:

- Requires **Admin** (the only such gate in the app) and returns the user so the actor is recorded.
- Caps at 25 rows; validates the client's view of each row against the live row first.
- **Re-runs the replay server-side** — a tampered browser payload cannot be persisted.
- Archives the previous row and updates both live rows in **one transaction**, with each `UPDATE` carrying an `exists(...)` guard against the archive row for that batch, so a live row cannot be updated unless its archive landed first.
- Generates the batch id server-side so a client cannot reuse an older batch's archive as cover.
- Performs exactly **one** narrow external update after the commit, explicitly outside the transaction because no cross-database transaction exists — and says so in a comment.
- Reports a zero-row external update as `warning`, never as success, and never retries it.

---

## 6. Findings that change how the map should be read

23 findings are embedded in the **Audit coverage** panel with evidence. The ones that materially affect trust in the system:

### Authorization

1. **User-management authorization fails open.** `canManage()` and `guard()` both `return true` when `getCurrentUser()` yields no user; the status route only runs its check when `user` is truthy. An unauthenticated caller can list every account, **create a user with `isSystemAdmin: true` and sign in as a full administrator**, reset any password, or deactivate every administrator. Signing in with insufficient permission is *more* restricted than not signing in at all.
   `app/api/setup/users/route.ts:8-12`, `app/api/setup/users/[id]/route.ts:7`, `app/api/setup/users/[id]/status/route.ts:5`
2. **37 of 67 route files apply no server-side authorization** (measured). Includes all 19 QPart operations — hard delete, CSV import, blob upload/delete, paid AI translation — every `/api/cpq/*` runtime route, all three BigCommerce routes, both external-PostgreSQL debug routes, and `GET /api/setup/permission-pages`.
3. **Six route files import a guard and never call it.** Their collection siblings in the same directories *do* call it, which makes this read as a regression rather than a decision.
4. **The BigCommerce gate is writable without authorization.** `POST /api/bigcommerce/item-map/upsert` writes exactly the columns the external-push gate checks.
5. **Two admin gates are cosmetic**, and `assertAdminMode` — a check that the request header `x-admin-mode` equals `'true'` — guards a route that mutates primary-key sequences.
6. **Per-tab CPQ setup permissions are cosmetic**: the page resolves a per-tab key, every API checks the single key `cpq.setup`.
7. **Sampler Results is hidden by the nav but reachable by URL**, and performs no check.
8. **No rate limiting on login**, and sessions accumulate with no expiry sweep.

### Transactions and data integrity

9. **`sqlTransaction` is called from exactly one module** in the entire codebase. Everything else is independent auto-committing statements.
10. **Saving a QPart part can destroy its child data.** `saveChildCollections` DELETEs across five child tables, then re-INSERTs; the channel allow-list check throws during the INSERT phase. An invalid channel value wipes translations, metadata, channels, bike types and compatibility rules, restoring none.
11. **Save Configuration spans three untransacted calls** with three distinct documented failure states.
12. **External PostgreSQL production writes use no transaction at all.**
13. **The picture sync moves its watermark before writing what it harvested** — a failure loses the combinations permanently, because the next run skips processed rows.
14. **Image deletion removes the external file before the database row**; deleting a part does not delete its blobs at all.
15. **External pushes write no audit rows**, so the audit page cannot answer "when was this last pushed?" — precisely the question a sync discrepancy raises.

### Contract and type issues

16. `POST /api/cpq/configure` uses a bare `await req.json()` where every sibling uses `.catch(() => ({}))`, so a malformed body yields an unhandled 500 instead of a clean 400.
17. The configure route's normalized `context` is accepted by the client's TypeScript signature and then discarded with `void context` — **the type advertises behaviour the runtime does not have**. Shown in the drawer as a flagged mismatch.
18. `Number.isFinite` is used for `[id]` validation in ~14 routes, so `12.7` passes and then 404s.
19. `PATCH /api/setup/users/[id]/status` **deactivates an account when sent an empty body** (`!!undefined === false`).

### Two items marked UNVERIFIED

Labelled as such in the map rather than guessed:

- **Whether database cascades actually clean up QPart child rows.** `deletePart` issues one bare `DELETE`; no application code removes the six child tables or `qpart_country_allocation`. Whether those rows disappear depends on `ON DELETE CASCADE` in the *live* schema, and `sql/schema.sql` is partly superseded by migrations. This is a static audit with no live database, so the effective constraint set could not be confirmed. **If the cascades are absent, every part delete orphans rows across seven tables.**
- **The exact upstream CPQ response shape.** `mapCpqToNormalizedState` searches several candidate fields for the session id and falls back to `'unknown-session'`, which implies the shape varies by CPQ configuration. Only the fields the mapper actually reads could be confirmed as load-bearing.

---

## 7. Acceptance tests

Three suites were run against the finished artefact. All are re-runnable.

### Suite 1 — map self-integrity (`validate.js`)

```
total distinct station ids: 307          OK: no duplicate station ids
total edges: 386                         OK: every edge endpoint resolves
evidence entries defined: 142            OK: every evidence reference resolves
                                         0 defined-but-unreferenced
controls 78 | in a flow 78 | classified 16   OK: none unexplained
apiOps  88 | in a flow 88 | classified  8    OK: none unexplained
pages   23 | referenced by a flow 23
stores  28 | touched by an edge  28      OK
external systems 6 | in the graph 6      OK
secret scan                              OK: no credential literals present
                                         31 "[secret — omitted]" placeholders
=== ALL CHECKS PASSED ===
```

On its first run this suite failed on four items, each a genuine gap rather than a test artefact: a missing evidence entry (`ev.qpart.countries`), an API read (`GET /api/qpart/compatibility/reference-values`) that was documented but never wired into a flow, and two data-reading screens (`/cpq/results`, `/qpart`) mapped as pages but with no flow behind them. All four were fixed by adding the missing evidence and flows, not by relaxing the assertions.

### Suite 2 — repository-vs-map diff (`coverage.js`)

Independently re-enumerates the repository and diffs against the embedded inventory:

```
page.tsx files                  repo=23  map=23   OK   (+ per-URL set diff: clean)
route.ts files                  repo=67  map=67   OK
(method, route) pairs           repo=88  map=88   OK   (+ per-pair set diff: clean)
tables in schema+migrations     repo=24  map=24   OK   (+ per-table set diff: clean)
env vars (excluding NODE_ENV)   repo=47  map=47   OK
route files with a guard call   repo=30  map=30   OK
route files with no guard call  repo=37  map=37   OK
dead guard imports              repo= 6  map= 6   OK
sqlTransaction call sites       repo= 1  map= 1   OK
external begin/commit/rollback  repo= 3           OK   all in variant-tables.ts:949,970,988
fetch( call sites               repo=86  map=86   OK
migration files                 repo=15  map=15   OK
=== MAP MATCHES THE REPOSITORY ===
```

This suite also sweeps every `https://` host in the code, which is how the two presentational asset CDNs (`flagcdn.com`, `via.placeholder.com`) were found and added as a sixth external boundary.

### Suite 3 — browser behaviour (`browsertest.js`)

Headless Chromium, run with the browser context **offline** to prove self-containment. **61 assertions, all passing.** Covers:

- offline load with **zero** non-`file://` requests, no console errors, no uncaught errors;
- every station and every edge in the data actually rendered (counts derived in-page, so the assertion cannot go stale);
- every edge label beginning with a verb, and every edge path carrying a `marker-end` so direction is visible at any zoom;
- wheel, keyboard (`+` `-` `0`, arrows), click-drag and pinch camera control; progressive detail at low zoom and legible labels at close zoom;
- station and edge drawers — payload field table, all five code samples, validation, data operations, side effects, UI feedback, evidence list, button replica, "View on page";
- trace upstream/downstream; all eleven layer toggles; all five filters; search by label, route, table, payload field, function and source file;
- URL-hash deep linking; reset; both modal panels; button-replica click-to-focus;
- accessibility: `role`, `aria-label`, `tabindex` and accessible name on every station, Enter-to-activate, `prefers-reduced-motion`, print rules, 74 non-colour cue badges;
- dependency-free SVG export (produces a ~350 KB standalone `image/svg+xml` blob).

Eight screenshots at 1600×950 and 420×860 are written to `docs/screenshots/metro-map-*.png`.

A ninth check runs outside the suite: a geometric overlap detector comparing every pair of station boxes. It reports **0 overlaps**.

### Repository checks

`lib/sales/allocation-territory.test.ts` and `lib/sales/csv.test.ts` are the repository's only tests (Node's built-in runner, `npm test`). Run unchanged: **57 tests, 11 suites, 57 pass, 0 fail**. `npm run typecheck` could not be run because `typescript` is not installed in `node_modules` in this environment; no `.ts` file was modified, so the typecheck result is unchanged from baseline either way.

No application file was modified by this audit. `git status` shows only new files under `docs/`: the map, this document, and eight screenshots.

### Secrets

No credential value is embedded. Three in-repo literals were deliberately **not** reproduced: the client-side admin-mode password, the QPart update-all fallback password, and any API key. Each reads `[secret — value intentionally omitted]`, and the automated scan asserts the literals are absent. No customer or personal data appears; all payload examples use invented placeholders (`A000286`, `BBLV6-GL-M-BLK`, `ops.user@example.com`).

---

## 7b. The journey player

`docs/data-journeys.html` presents the same audited truth as **19 journeys, 141 steps**, grouped into five categories: Everyday, Building and saving a bike, Allocating stock to countries, Product data, and Admin and maintenance. Each journey is a sequence diagram whose lanes are the real participants — the operator, the browser page, the app server, the internal database, and whichever external systems are involved.

Pressing **Play** reveals one exchange at a time: an arrow with a verb (READ, INSERT, UPSERT, PUSH, CHECK, RETURN…), a label naming the data that moves, and a plain-English sentence in the caption bar. Past steps stay visible but dimmed. Transport controls allow pause, single-step in both directions, restart, three speeds, and clicking any step on the diagram. When the journey ends, a summary states what was read, what was written in our database, what was sent to another system, whether the whole thing is all-or-nothing, and what happens if a step fails.

The **Technical detail** panel is the nerdy half, and it is deliberately the same ordered sequence rather than a separate reference: entry *n* in the panel is step *n* in the diagram, and the panel follows the playback, expanding and scrolling to the current step. Each entry carries the endpoint, the authorization applied, the validation in code order, the request payload, the SQL or downstream request, the response and error shapes, and the `file:line` evidence. Warnings and things done well are called out inline where they belong.

Findings surface where they are felt rather than in a list: the three untransacted writes appear as callouts on the CPQ save journey, the deletes-before-validation hazard is step 4 of *Save a part*, the fail-open check is step 3 of *Create a user*, and the file-before-record deletion order is step 6 of *Add and remove a part picture*. The replay-overwrite journey is marked as the one that gets it right, with its interlocks explained step by step.

Verified by **53 browser assertions** run offline: self-containment, play/pause/step/restart, panel synchronisation in both directions, deep links, keyboard control, the end-of-journey summary classifying by destination actor, accessibility, and phone-width layout. Three defects were caught and fixed during that testing:

- **Playback died after one step.** `syncTech()` sets `details.open` on the current entry; `<details>` fires a `toggle` event when it does, the handler treated that echo as a user click and called `goTo()`, which calls `stop()`. Now the handler ignores a toggle whose index is already the current step.
- **The landing page and the player rendered on top of each other.** `.stageWrap{display:grid}` outranks the user-agent rule for the `hidden` attribute. Fixed with an explicit `[hidden]{display:none!important}`; the test now asserts computed display rather than the attribute, which is what let the bug through.
- **On a phone the narrated step was off-screen.** The diagram overflowed sideways. It now scales to the viewport, and the scroll maths derives the scale factor from what was actually laid out.

## 8. Using the map

- **Start from a button.** *App buttons* lists every control as a styled replica grouped by screen; clicking one focuses its complete end-to-end path and dims the rest.
- **Filter to a question.** *Read vs write* → "Writes only" shows every mutation. *Operation type* → "Destructive" shows every delete. *Domain* isolates one metro line.
- **Search anything.** Label, route, table, payload field, function name or source file path.
- **Follow a chain.** Open any station and use **Trace upstream** / **Trace downstream**.
- **Share a finding.** Every station is addressable: `data-metro-map.html#api.post.setup_users`.
- **Check the numbers.** *Audit coverage* recomputes coverage and both integrity checks at load time.

Reading conventions: **▲!** no server-side authorization · **⛒** write after commit or with no rollback · **TX** inside a transaction · **◎** interchange shared by 2+ lines. Solid edges are unconditional, dashed are conditional or feature-flagged, dotted are derived or client-only. Shape encodes station kind and colour encodes operation, never colour alone.

---

## 9. Maintaining and regenerating the map

The HTML is hand-authored from audited evidence, not generated from source — a generator would only be able to assert what the code *shapes* look like, not what the validation *means* or where a transaction boundary *should* have been. The inventories are machine-checkable, so drift is caught rather than guessed at.

### When code changes

| Change | Update |
|---|---|
| New page | `pages[]` entry; a flow or an explicit no-data justification |
| New control | `controls[]` entry with `label`, `replica`, `handler`, `files`, `evidence`; wire it into a flow or set `classification` |
| New route or method | `apiOperations[]` entry; wire it into a flow or set `classification`/`orphan` |
| New table | `dataStores[]` entry; at least one edge must touch it |
| Changed validation | The relevant `validation[]` array and its gate station |
| Changed transaction behaviour | The flow's `transaction` and `partialFailure`; add/remove `tx` or `risk:"postcommit"` |
| New external system | `systems[]` entry plus edges |
| Any of the above | Bump `meta.commit` and `meta.generatedAt`, and update `inventory` |

### Re-running the checks

The three suites live in the session scratchpad rather than the repository, since the brief was not to add tooling to the app. To re-establish them:

1. **`validate.js`** — parse the `const DATA = {…}` block out of the HTML, then assert: no duplicate station ids; every edge `from`/`to` resolves; every `evidence` id resolves; every control is in a flow or classified; every API operation is in a flow or classified; every store is touched by an edge; no credential literals present.
2. **`coverage.js`** — re-enumerate `page.tsx` files, `(method, route)` pairs by scanning exported method names, tables from `sql/schema.sql` + `sql/migrations/*.sql`, env vars (multiline-aware — see the correction in §2), the guard census, `sqlTransaction` call sites, and `fetch(` sites. Diff each against `DATA.inventory` **as sets, not just counts** — the set diff is what catches a renamed route that keeps the total the same.
3. **`browsertest.js`** — Chromium via `playwright-core` at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, context `offline: true`, asserting the behaviours listed in §7.

The single most valuable check is the `(method, route)` **set** diff: it is what would catch a new endpoint being added without a corresponding station.

### Known maintenance hazards

- `components/cpq/bike-builder-page.tsx` is 4033 lines and holds ~20 controls. Its bulk runner repeats the same init/configure/finalize/save calls already mapped, so it is modelled as one automatic flow rather than one station per generated row.
- `lib/admin/data-point-registry.ts` is a hand-maintained inventory rendered at `/admin/data-point`. It performs no data access, so it cannot detect its own drift. It was used as a seed here, never as proof; treat it the same way.
- `sql/schema.sql` is partly superseded by `sql/migrations/*`. Where they disagree, the migration wins — `qpart_part_images` in particular is redefined by `2026-04-30_qpart_part_images_v2.sql`.
- Existing documents under `docs/` are useful leads but several are stale. `CANONICAL_SAVE_CAPABILITY_GAP.md` is the one this audit independently confirmed.

---

## 10. Unresolved questions for the team

1. Is the fail-open `if (!user) return true` in the user-management guards deliberate (perhaps a bootstrap affordance) or a regression? It is the highest-impact finding and the cheapest to fix.
2. Were the six dead guard imports in `app/api/cpq/setup/**/[id]/route.ts` removed by accident? Their collection siblings still call the guard.
3. Should `/api/qpart/**` be authorized at all? 19 operations including hard delete, CSV import and paid AI translation are currently open, and the nav entry advertises a `qpart.parts` page key that nothing enforces.
4. Should the three untransacted CPQ save calls be consolidated into one server-side endpoint wrapped in `sqlTransaction`, with a compensating action for the CPQ-finalized-but-not-persisted case?
5. Should `saveChildCollections` move inside a transaction? It is a five-table delete-then-reinsert with a validation throw in the middle.
6. Should the picture sync mark its watermark *after* the inserts, or wrap both in a transaction?
7. Should image deletion delete the metadata row before the blob, making the failure recoverable?
8. Should push paths write audit rows? Their absence is the one gap that makes the audit page unable to answer the question it exists for.
9. Should `assertAdminMode` be replaced with a real permission check, given it currently guards a sequence-mutating write?
10. Can the `QPART_UPDATE_ALL_PASSWORD` in-code fallback be removed, and the token made per-user and per-session?
11. Should the six orphaned endpoints be deleted, or wired up? Three of them are unauthenticated diagnostics against the external production database.
12. Is `lib/cpq/runtime/copy-configuration.ts` still wanted? It is complete, tested by nothing, and called by nothing.
13. **Do the `ON DELETE CASCADE` constraints for the QPart child tables exist in the live database?** This is the one question a static audit genuinely cannot answer, and the answer decides whether every part delete orphans rows across seven tables.
