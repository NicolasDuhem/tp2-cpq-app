# Data Metro Map — forensic audit methodology, coverage and maintenance

Companion document to two artefacts built from the same audit:

| File | What it is | Who it is for |
|---|---|---|
| [`docs/data-journeys.html`](./data-journeys.html) | **Start here.** 19 journeys through the app. Pick one, press **Play**, and watch each exchange animate step by step with plain-English narration. Technical detail — endpoint, payload, SQL, validation, source line — sits in a side panel, in the order the events happen. | Anyone: product, operations, a new engineer, a stakeholder who needs to understand a flow |
| [`docs/data-metro-map.html`](./data-metro-map.html) | The exhaustive reference: 307 stations and 386 edges covering **every** page, control, endpoint, table and external system in one zoomable map. | Engineers auditing coverage, tracing a specific control, or checking nothing was missed |
| [`docs/JOURNEY_VALIDATION_GUIDE.md`](./JOURNEY_VALIDATION_GUIDE.md) | The brief for validating the journeys against the **running** UAT application in a browser: per-journey scripts, environment caveats, scope rules, and a gap-recording template. | An independent reviewer driving the real app |

The journeys file is a readable path through the same evidence, not a simplification of it: every step carries the same `file:line` citations. It covers the flows that matter; the metro map is what guarantees nothing is missing.

> **This audit is no longer purely static.** On **30 September 2026** the journeys were driven through the running UAT application in a browser, with every request and response body captured — fifteen of the nineteen produced step-level results. The results are in [section 6b](#6b-what-the-uat-validation-run-changed): eight claims were refuted and corrected, ten calls the map never mentioned were added, and the headline risk — *a failed external push reported as success, in green* — was confirmed exactly. Both HTML artefacts now carry the verdicts inline: the journey player marks every checked step, and the metro map has a **UAT validation** panel.

- **Audited commit:** `cf1000de5625801a57164a957fd6b9402cd881ce` (branch `UATNew`)
- **Audit date:** 2026-09-30 · **Validated against UAT:** 2026-09-30
- **Scope:** the entire application — every page, every actionable control, every API route and method, every table, and every external system
- **Method:** static forensic read of the repository, **then** a browser-driven validation run against UAT. Code and migrations were treated as authoritative; existing documents under `docs/` were treated as leads to verify, never as evidence; observed traffic overrides both.

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

**31 findings** are embedded in the **Audit coverage** panel with evidence — 23 from the static audit and 8 produced or confirmed by the UAT run (findings 20–27 below, also listed in the map's **UAT validation** panel). The ones that materially affect trust in the system:

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

### Produced or confirmed by the UAT run

20. **The finalise detail-id check does not stop a finalise that returns nothing.** `bike-builder-page.tsx:1544` reads `finalizedState.detailId ?? state.detailId ?? ''`, so the guard on the next line fires only when the live session also has no working id. Observed live: CPQ returned an empty body (`rawResponse {}`, `parsed.sessionId: "unknown-session"`, no `detailId`), no error was raised, and the configuration was saved with `finalized_detail_id` set to the **browser-generated working id from init**. Everything downstream — the canonical reference, the sampler row, and any external `DetailId` push — then carries an identifier CPQ never issued, and the only confirmation a normal operator sees is `Reference: …` / `Finalized detailId: …`, which looks entirely normal. The **bulk path does not share this weakness**: it fails the execution with *"Bulk finalize response did not return detailId."* The same CPQ response is therefore accepted by one save path and rejected by the other.
    `components/cpq/bike-builder-page.tsx:1543-1550`
21. **A failed external push is reported as success, in green** — confirmed on both allocation screens. HTTP 200 with `externalSync.state: "error"`, rendered in the green success banner with the timeout text appended; only the cell pill, which turns to "Error", differs. Each toggle also blocks for ~9.6–9.8 s on the connect timeout first. The per-cell retry endpoints (`POST …/push`) by contrast return a real 500 with `stage: "allocation_external_sync"` and a red banner, so the honest reporting already exists — just not on the path people use.
    `lib/sales/allocation-external-sync.ts:92-143`, `app/api/sales/qpart-allocation/push/route.ts`
22. **`GET /api/auth/me` and `POST /api/bigcommerce/item-map/lookup` dominate the traffic**, and neither appeared in this audit as a recurring call. `auth/me` fires twice per full page load and again on focus, because the header, the navigation and each guarded page re-read the session independently rather than sharing one result — every call a database round trip. `item-map/lookup` fires on every load, refresh, toggle, bulk action and **filter keystroke** (eight pairs for a seven-character search), with no permission check and up to 2500 codes per call. Together they are the largest source of avoidable database traffic in the application.
    `lib/auth/session.ts:28-45`, `app/api/bigcommerce/item-map/lookup/route.ts:4-17`
23. **The bulk CPQ run has no completion message and does not lock the page.** The documented *"Bulk run finished: …"* line never appears, so a finished run looks like a stalled one; and the account/ruleset selects, the saved-page-state buttons and Retrieve Configuration all stay enabled, so the context the run depends on can change mid-run.
    `components/cpq/bike-builder-page.tsx:2265-2683`
24. **Saving a QPart part writes the country allocation matrix, unauthenticated and unaudited.** `PUT /api/qpart/parts/[id]` carries `country_codes`, and the form states that *"Country selection edits the same allocation matrix used by /sales/qpart-allocation (selected = active, unselected = inactive)"*. Allocation state therefore has two write paths with completely different controls: the Sales screen requires Edit on `sales.qpart_allocation` and audits every changed cell; this endpoint requires **no permission at all** and writes **no audit row**. Anyone who can reach it can change what is sold where, invisibly to the audit page.
    `app/api/qpart/parts/[id]/route.ts:16-28`, `components/qpart/qpart-part-form-page.tsx`
25. **`GET /api/qpart/parts/[id]/image` returns 500 with an empty body on every part detail page in UAT**, because the reconcile step reaches the Blob store and the token is missing. Since every part detail page calls it, every operator opening any part generates a server error — and because the body is empty there is nothing to render or log, so it is completely silent. This is also the endpoint already documented as *a GET that can write*.
    `app/api/qpart/parts/[id]/image/route.ts:14-23`
26. **Two one-way actions have no confirmation, and one triggers a second call by itself.** *Sync from sampler results* moves a watermark that cannot be moved back from the interface — it moved it for all 18 rows it scanned — with no dialog. *Push all BC OK* writes to another system for every ready row in scope, also with no dialog, and additionally causes the page to fire `POST …/external-status` automatically, producing a 504 the operator never requested.
    `app/api/cpq/setup/picture-management/sync/route.ts:1-21`, `app/api/sales/bike-allocation/bulk-push/route.ts`
27. **The replay validation `Run` is read-only for Neon, not for CPQ.** The page's banner and this audit both call it read-only, and it does issue no write against this application's database. But each selected row opens a fresh CPQ session and **finalises** it (`finalizeSucceeded: true`), so a 25-row run creates and finalises 25 real configurations with the same no-undo property as any other finalise. Separately, the **OpenAI error text including a partly masked key is relayed to the screen verbatim**, and the image endpoint's nested error renders as the literal text `[object Object]`.
    `app/api/admin/cpq-replay-validation/run/route.ts:33-111`, `lib/qpart/translations/field-translation-service.ts:332-420`

### Two items marked UNVERIFIED

Labelled as such in the map rather than guessed:

- **Whether database cascades actually clean up QPart child rows.** `deletePart` issues one bare `DELETE`; no application code removes the six child tables or `qpart_country_allocation`. Whether those rows disappear depends on `ON DELETE CASCADE` in the *live* schema, and `sql/schema.sql` is partly superseded by migrations. This is a static audit with no live database, so the effective constraint set could not be confirmed. **If the cascades are absent, every part delete orphans rows across seven tables.**
- **The exact upstream CPQ response shape.** `mapCpqToNormalizedState` searches several candidate fields for the session id and falls back to `'unknown-session'`, which implies the shape varies by CPQ configuration. Only the fields the mapper actually reads could be confirmed as load-bearing.
  **Partly answered by the UAT run.** The fallback is not hypothetical: a live finalise returned a completely empty body and `parsed.sessionId` came back as the literal `'unknown-session'` with no `detailId`. The start and configure replies, by contrast, were broader than the map assumed — a `traceId` alongside the session id, and `parsed` carrying the ruleset and the **raw CPQ pages** rather than only a flattened feature list. The mapper therefore passes the upstream envelope through as well as normalising it, which is why every configure round trip is a large response rather than a small delta.

---

## 6b. What the UAT validation run changed

On **30 September 2026** the journeys were driven through the running application at `tp2-cpq-app-uat.vercel.app` in Chrome, as a system administrator, with an in-page fetch logger capturing every `/api/` request and response body. Seventeen of the nineteen journeys were opened, and **fifteen produced step-level results**: *Unlock "Update all"* and *Repair a database counter* were reached but entirely blocked by a password nobody had, and *Create a user* (out of scope) and *Signing in* (the tester was already signed in) were not run at all. The findings below are folded into both HTML artefacts; this section is the record of what moved.

### 0. Read this first — which build was tested could not be proven

The application exposes no commit SHA. The only build identifier available was the Vercel deployment id **`dpl_9qSgkHYHTRLoAHtktPwpWRYPnHbW`**, taken from the `?dpl=` suffix on the JavaScript chunks. **Check it against `cf1000de5625801a57164a957fd6b9402cd881ce` in the Vercel dashboard before trusting any presentation detail.**

This matters, because the Bike Allocation screen in UAT looks *older* than this audit: it has a "Show filters" drawer and a flat button toolbar with no Actions or Legend popovers, unconfigured cells read **"Not configured"** instead of showing a dashed dot, and the sync pill shows the words **"Unknown" / "Error"** instead of the `✓ ≠ BC ! ⤴` icons. Every bike-page *presentation* difference recorded below may therefore be a version difference rather than a map error. Behavioural findings — status codes, payloads, call ordering — are not affected by this doubt.

### Environment at the time of the run

| Switch / dependency | Observed | Consequence for the audit |
|---|---|---|
| **External PostgreSQL** | **Unreachable by design** — it accepts only the live tool's IP address. Every push failed with `External PostgreSQL timeout during connect: timeout expired` after ~9.5 s. | No production external write path could be observed end to end. Everything about the two-table write order, the `Qpart` marker literals and the batch concurrency remains static-only evidence. |
| `BIGCOMMERCE_BC_STATUS_ENABLED` | **On.** `variant-status` returned `"enabled":true` and live catalogue data. | The BigCommerce gate and its unprotected write were exercised for real. |
| `CPQ_USE_MOCK` | **Off.** Session ids were real (`BROMPTON_TRN~BROMPTON_TRN~…`). | Every CPQ claim was tested against the live configurator. |
| `OPENAI_API_KEY` | **A placeholder.** It satisfies the presence check and is then rejected by OpenAI with 401. | No spend occurred. The failure path was exercised; the success path was not. |
| `BLOB_READ_WRITE_TOKEN` | **Missing or invalid.** Uploads fail with `Cannot get store id from token or header`. | The whole picture upload/delete journey is untested, including the dangerous delete ordering. |

### Confirmed — the map was right

- **A failed external push is reported as success, in green.** This was the audit's headline UX risk and it reproduced exactly, on both allocation screens: HTTP **200**, `externalSync.state: "error"`, and a **green success banner** with the timeout text appended. Only the cell's sync pill, which turns to "Error", distinguishes it from a complete success.
- Save Configuration really is three separate untransacted browser requests — observed at **+0 ms, +758 ms and +2146 ms**, in the documented order.
- An **empty 200 finalise body really is accepted as success**: `rawResponse` was literally `{}`.
- Reopening a saved configuration really does open a **second live CPQ session** (saved `…7f24bd04…`, retrieved `…57a452b6…`).
- The bulk combination generator sends nothing: **288 rows generated, zero requests**.
- The CSV preview writes nothing: one request fired and the data was unchanged.
- The bike bulk dialog states the exact counts, and the server independently enforces the page-only scope.
- A saved sampler row is inserted with `active` already true, so a bike becomes allocatable without anyone visiting the allocation screen.
- The picture sync moved its one-way watermark for all 18 rows it scanned (`samplerRowsMarkedProcessed: 18`, `unprocessedRowsRemaining: 0`) — with no confirmation dialog in front of it.
- Every permission check described as present behaved as described; every endpoint described as unguarded was reachable.

### Refuted — the map was wrong, and has been corrected

| # | What the map said | What the application does | Where it is now corrected |
|---|---|---|---|
| R1 | A finalise that returns no detail id stops the save with *"Unexpected CPQ response: finalized detail ID missing"* | **It does not stop.** `bike-builder-page.tsx:1544` reads `finalizedState.detailId ?? state.detailId ?? ''`, so the guard fires only when the live session *also* has no working id. CPQ returned an empty body, no error was raised, and `CFG-20260930-633B97DA` was saved with `finalized_detail_id` set to the browser-generated working id from init. | `flow.cpq.save` step 4, `gate.cpq.save`, journeys `#cpq-save` step 7 and `#cpq-finalize` step 5 |
| R2 | The bulk run ends with *"Bulk run finished: X succeeded, Y failed, Z saved."* | **Never shown**, after either a failed or a successful run. The page kept displaying `Running: execution 1/1 · row 1 · country - · feature -`. A finished run is indistinguishable from a stalled one except by reading each row. | `resp.cpq.bulk`, journey `#cpq-bulk` step 11 |
| R3 | Every other control is disabled during a bulk run | **Refuted.** The account and ruleset selects, Restore/Clear saved page state, the reference input and **Retrieve Configuration** all stayed enabled, so the context a running batch depends on can be changed underneath it. | `flow.cpq.bulk` edge detail, journey `#cpq-bulk` contract |
| R4 | The BigCommerce check begins with `item-map/lookup` | The real order is **`variant-status` → `item-map/upsert` → RSC refetch → `item-map/lookup`**. The lookup is not part of this chain at all. | journey `#bc-check`, `api.post.bigcommerce_item_map_lookup` |
| R5 | QPart parts get no allocation row until first toggled | **They have rows from creation or page load.** A brand-new, never-toggled part already showed Inactive in all **29** countries. The back-fill is a safety net, not the thing that creates the matrix — and anything it inserts is inserted *inactive*. | `api.post.sales_qpart_allocation_toggle` side effects, journey `#qpart-toggle` step 3 and contract |
| R6 | Only the QPart bulk update pushes in the same request | **The bike bulk update does too.** The in-request push is the pattern on both screens, not a difference between them. | journey `#qpart-bulk` contract, `#bike-bulk` step 6 |
| R7 | Saving a part rewrites five child lists | **Six.** The body carries `country_codes`, so saving a part **writes the country allocation matrix** — unauthenticated and unaudited. See finding 24. | `api.put.qpart_parts_id`, journey `#qpart-save` step 2 |
| R8 | CSV import sends `dryRun`; errors come back 200 with `errors:[{row,message}]` and a `failed` count | The field is **`dry_run`**; a file with row errors returns **HTTP 400**; `errors` is a **count** and the detail lives in `rowResults[].errors[]`; there is **no `failed` field**. | `api.post.qpart_parts_import`, journey `#qpart-csv` step 5 |
| R9 | An empty source field is refused by the server with *"Base (en-GB) value is required before translation"* | The **browser** refuses first — *"Enter English description before translating."* — and sends no request, so the server message is unreachable from the interface. This is the *better* behaviour: it costs nothing. | journey `#qpart-translate` step 3 |

### Added — real traffic the map never mentioned

1. **`GET /api/auth/me` fires twice on every full page load**, and again on window focus — about six times while one page stayed open. The header, the navigation and each guarded page re-read the session independently rather than sharing one result, and every call is a database round trip. It is the busiest call in the application.
2. **`POST /api/bigcommerce/item-map/lookup` is second-busiest.** Every load and refresh of both allocation screens, after every toggle, after every bulk action, after a BigCommerce check, and **after every filter keystroke** on the parts screen — typing `Q100010` produced eight refetch-and-lookup pairs. It has no permission check and accepts up to 2500 codes per call.
3. **An RSC refetch** (`GET /sales/…?_rsc=…`) follows every allocation mutation.
4. **`POST …/external-status` is fired automatically** by the page after *Push all BC OK*, on both allocation screens — a 504 the operator never asked for. Neither *Push all BC OK* nor *Sync from sampler results* has a confirmation dialog.
5. **`POST /api/cpq/image-layers` fires immediately after `init`**, before any option is chosen, and again after `retrieve-configuration`. In a replay launched from a Bike Allocation cell it fires **before** `init`.
6. **Opening a QPart part page issues seven loads**: `locales`, `hierarchy`, `metadata?activeOnly=true`, `bike-types`, `countries`, `parts/:id` and `GET parts/:id/image`. The last returns **HTTP 500 with an empty body on every part detail load**. See finding 25.
7. **`GET /api/admin/cpq-replay-validation/options`** fires on page load.
8. **`GET /api/sales/allocation-audit?itemCode=…&entityType=all&sort=desc`** powers the audit page.
9. **`GET /api/cpq/setup/picture-management`** is re-fetched after a picture sync.
10. **The replay validation `Run`, documented as read-only, finalises a fresh CPQ session per row** (`replaySessionId …28f0e223…`, `finalizeSucceeded: true`). See finding 27.

### Payload and label corrections

Behavioural claims held; shapes and wording needed work. The notable ones:

- `POST /api/cpq/init` also carries `partName`, empty `sourceHeaderId` and `sourceDetailId`, and a **context of eight keys** (`accountCode`, `company`, `accountType`, `customerId`, `currency`, `language`, `countryCode`, `customerLocation`), not four.
- `POST /api/cpq/configure` also carries `optionId`, `ruleset` and a `context` object. A 10-feature bulk row produced only **4** configure calls, because ignored features and options already at the required value are skipped.
- `partId` / `partIds` are sent as **strings** on both QPart allocation endpoints, though the route validates `partId` as a finite number.
- `item-map/upsert` sends `sourcePage: "bike-allocation"` (not `"sales.bike_allocation"`) and forwards the **full variant-status object** per item, not a trimmed `bcProductId`/`bcVariantId`/`bcStatus` triple.
- The bulk `externalSync` block has **eleven** fields on both screens: `attempted`, `totalTargets`, `pushed`, `pendingBc`, `errors`, `variantsInserted`, `variantsUpdated`, `eligibilityInserted`, `eligibilityUpdated`, `skipped`, `timingsMs`.
- The replay run body is **`{referenceIds, limit}`**; comparison fields are `existingItemCode` / `replayedItemCode` / `finalizedItemCode` / `selectionSource` / `samplerRowId`; the summary is `{total, match, different, failed, skipped}` with `maxLimit: 25`.
- The picture-sync summary has four extra fields: `selectedOptionsScanned`, `samplerRowsMarkedProcessed`, `syncErrors`, `total`.
- `translations/field` also sends `fill_missing_only: true`, which is why pressing the button twice does not re-charge for languages already filled in.
- Labels: **"Configure all ticked items"** not "Run"; **"Auto-translate"** not "Translate with AI"; bulk row states are `pending → running · … → configured · … → saved` with **no "finalized" state**; the BigCommerce summary uses a 12-hour clock; the bike bulk dialog pluralises properly ("1 country (AT)"); the QPart bulk dialog reads *"This will activate N currently loaded items across all selected markets."*
- The confirmation messages this audit quoted for the CPQ save and retrieve are **admin-mode diagnostics**. A normal operator sees only `Reference: CFG-…` and `Finalized detailId: …` — and therefore has no way to notice that the detail id is the working one rather than one CPQ issued.
- The image upload is **re-encoded to JPEG in the browser** and renamed after the part number before it is sent.
- `external-status` returns `errorType`, `errorCode` and `stage` but **no `errorHint`** on a timeout. This is consistent with the code rather than contrary to it: `errorCode`, `errorDetail` and `errorHint` are copied from the thrown error's own `.code` / `.detail` / `.hint` (`lib/external-pg/errors.ts:164-171`), and a connect timeout is an `ExternalPgPushError` the application constructs itself (`errors.ts:88-91`), carrying only `.code`. **Do not expect `errorHint` on the failure mode you are most likely to see.**

### Risk re-balancing

**Handled better than this audit claimed:**

- The QPart bulk dialog **does** state the item count and the "currently loaded" scope. It still omits the countries and their number, and whether its wording changes when *Update all* is armed is untested.
- An empty-source translation is blocked **in the browser**, so it costs nothing (R9).
- The invalid-channel wipe **cannot be triggered from the form** — Channels is a fixed multi-select of four values. The hazard is real only for a caller going straight to the endpoint, which still needs no permission.
- The CSV preview wrote nothing, exactly as claimed.
- The **per-cell push endpoints report failure honestly** — a real 500 with `stage: "allocation_external_sync"` and a red banner. The application already knows how to surface this; it just does not do so on the path people actually use.

**Worse than this audit claimed, or newly visible:**

- Every single toggle **blocks for ~9.5–9.8 s** on the external connect timeout before the UI updates at all.
- A failed push shows a **green success banner** (confirmed).
- *Push all BC OK* and *Sync from sampler results* have **no confirmation**, and the former triggers a second call by itself.
- During a bulk CPQ run the **context can be changed mid-run** (R3).
- The replay `Run` **finalises a CPQ session per row** — read-only for Neon, not for CPQ.
- The **OpenAI error text, including a partly masked key, is shown to users**, and the image endpoint's nested error renders as the literal text **`[object Object]`**.
- `GET /api/qpart/parts/[id]/image` **500s on every part detail page** in UAT, silently.

### Still unobserved

- **Every production external PostgreSQL write path**, because the database is unreachable from UAT. This is the largest remaining gap: the two-table write order, the `Qpart` marker literals, the batch concurrency and the no-transaction hazard are all still static-only evidence.
- **The whole replay overwrite apply path** — archive, guarded update, external update. The tester's own safety check blocked it. It remains the most carefully fenced write in the codebase and the one most worth exercising next, on the throwaway reference `CFG-20260930-633B97DA`.
- The *Update all* unlock and the database-counter repair, because no password was supplied for either.
- **The Setup User area in full**, including the fail-open authorization guard — excluded from the run by instruction. Finding 1 therefore remains static-only evidence, and it is still the most serious finding in this audit.
- The part-picture upload and delete, because the Blob token is missing.

### Data left behind in UAT

| What | Detail |
|---|---|
| Part `ZZ-CLAUDE-TEST-0930` (id 2633) | Inactive, title "Claude validation throwaway part EDITED", a de-DE translation, channel Ecom, all 29 countries inactive, no pictures |
| `CFG-20260930-633B97DA`, `CFG-20260930-89C1F08A` | G Line, AT, account A000718, with **sampler rows 599 and 600 inserted `active = true`** — i.e. two G Line bikes are now allocatable in AT. This was not checked on Bike Allocation, where G Line was not offered as a ruleset filter. |
| `cpq_image_management` | 17 new rows |
| `CPQ_sampler_result` | 18 rows marked `processed_for_image_sync = true` by the one-way sync |
| Allocations | Restored: `Q100010 × AT` and `H4L0BBBS6C00R000C0070120BBBB00 × AT` are Active again. The audit log keeps the intermediate entries. |
| CPQ | Several sessions opened and finalised on the BROMPTON_TRN instance, including one per row of the replay validation run |

---

## 7. Acceptance tests

Five suites were run against the finished artefacts — three against the metro map, one against the journey player, and the repository's own tests. All are re-runnable, and all were re-run after the UAT corrections were applied.

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

Headless Chromium, run with the browser context **offline** to prove self-containment. **66 assertions, all passing** (61 originally, plus 5 for the UAT validation panel added after the 30 September run). Covers:

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

`docs/data-journeys.html` presents the same audited truth as **19 journeys, 152 steps**, grouped into five categories: Everyday, Building and saving a bike, Allocating stock to countries, Product data, and Admin and maintenance. Each journey is a sequence diagram whose lanes are the real participants — the operator, the browser page, the app server, the internal database, and whichever external systems are involved.

Pressing **Play** reveals one exchange at a time: an arrow with a verb (READ, INSERT, UPSERT, PUSH, CHECK, RETURN…), a label naming the data that moves, and a plain-English sentence in the caption bar. Past steps stay visible but dimmed. Transport controls allow pause, single-step in both directions, restart, three speeds, and clicking any step on the diagram. When the journey ends, a summary states what was read, what was written in our database, what was sent to another system, whether the whole thing is all-or-nothing, and what happens if a step fails.

The **Technical detail** panel is the nerdy half, and it is deliberately the same ordered sequence rather than a separate reference: entry *n* in the panel is step *n* in the diagram, and the panel follows the playback, expanding and scrolling to the current step. Each entry carries the endpoint, the authorization applied, the validation in code order, the request payload, the SQL or downstream request, the response and error shapes, and the `file:line` evidence. Warnings and things done well are called out inline where they belong.

Findings surface where they are felt rather than in a list: the three untransacted writes appear as callouts on the CPQ save journey, the deletes-before-validation hazard is step 5 of *Save a part*, the fail-open check is step 3 of *Create a user*, and the file-before-record deletion order is step 6 of *Add and remove a part picture*. The replay-overwrite journey is marked as the one that gets it right, with its interlocks explained step by step.

### The UAT validation layer

Since the 30 September 2026 run (section 6b) the player carries the verdicts inline, so a reader can see what is observed fact and what is still code-reading. **125 of the 152 steps** now carry a verdict; a step with no flag is one nobody has watched happen:

- The landing page opens with a **validation banner** stating the date, the host, the deployment id that was tested, the counts, a legend explaining the six verdicts, and the four caveats that bound the run — chiefly that the deployed commit could not be proven and that the external database is unreachable from UAT by design.
- Every checked step carries a **verdict flag** in the diagram's right-hand gutter (`MATCH`, `MINOR`, `GAP`, `MISSING`, `ENV`, `BLOCKED`), repeated as a pill in the technical panel with the observation underneath it — the real payload, the real status code, the real on-screen wording.
- Each journey header and card shows its **overall verdict**, and the four journeys with no step-level result (*Create a user*, out of scope; *Signing in*, not re-run; *Unlock "Update all"* and *Repair a database counter*, blocked for want of a password) say so plainly rather than appearing validated.
- The end-of-journey summary gains a **"Checked in UAT"** cell, so the playback never ends without stating whether what was just shown has been observed.

Where observation contradicted the code reading, the step text itself was rewritten and the flag records that it was. Nothing was left saying two different things.

Verified by **60 browser assertions** run offline: self-containment, play/pause/step/restart, panel synchronisation in both directions, deep links, keyboard control, the end-of-journey summary classifying by destination actor, the presence of the UAT verdict flags and observations, accessibility, and phone-width layout. Three defects were caught and fixed during that testing:

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

The suites live in the session scratchpad rather than the repository, since the brief was not to add tooling to the app. To re-establish them:

1. **`validate.js`** — parse the `const DATA = {…}` block out of the HTML, then assert: no duplicate station ids; every edge `from`/`to` resolves; every `evidence` id resolves; every control is in a flow or classified; every API operation is in a flow or classified; every store is touched by an edge; no credential literals present.
2. **`coverage.js`** — re-enumerate `page.tsx` files, `(method, route)` pairs by scanning exported method names, tables from `sql/schema.sql` + `sql/migrations/*.sql`, env vars (multiline-aware — see the correction in §2), the guard census, `sqlTransaction` call sites, and `fetch(` sites. Diff each against `DATA.inventory` **as sets, not just counts** — the set diff is what catches a renamed route that keeps the total the same.
3. **`browsertest.js`** — Chromium via `playwright-core` at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, context `offline: true`, asserting the behaviours listed in §7, including that the UAT validation panel renders its five sections, names the deployment that was tested, and warns that the build could not be proven.
4. **`journeytest.js`** — the same Chromium setup against `docs/data-journeys.html`: transport controls, panel synchronisation in both directions, deep links, keyboard control, the end-of-journey summary, the UAT verdict flags and observations, phone-width layout, and the secret scan. Derive expected step counts **from the embedded `JOURNEYS` data rather than hardcoding them** — hardcoded counts turn every added step into a false regression, which is exactly what happened when the UAT corrections landed.

The single most valuable check is the `(method, route)` **set** diff: it is what would catch a new endpoint being added without a corresponding station.

### Keeping the UAT layer honest

The validation record is a snapshot of one run against one deployment, and it will rot differently from the rest of the map. Two rules keep it trustworthy:

- **Never silently refresh a verdict.** If a step changes, either re-run it and update the observation, or drop the `uat` entry so the step reads as code-only again. A stale `MATCH` is worse than no flag, because it claims evidence that no longer exists.
- **Re-run the whole thing after any change to a flagged path**, and record the new deployment id. `DATA.meta.uat.deployment` and the banner on the journeys landing page both carry it, and both should move together.

The parts still unobserved are listed in §6b. The external PostgreSQL write paths are the largest gap, and they cannot be closed from a cloud session at all — they need a run from a host whose IP the external database accepts.

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

### Added after the UAT run

14. **Should the manual save adopt the bulk path's finalise check?** The bulk runner rejects a finalise that returns no detail id; the manual save substitutes the browser's own working id and carries on, so the system stores an identifier CPQ never issued (finding 20). The one-line fix is to drop the `?? state.detailId` fallback at `bike-builder-page.tsx:1544` — but that turns a currently silent condition into a visible failure, so it needs a decision about what *should* happen when CPQ answers an empty body.
15. **Why does CPQ return an empty finalise body at all?** It happened on every finalise observed in UAT. Either the instance is configured not to return the finalised detail, or the call is being made in a state CPQ does not consider finalisable. Until this is answered, every `finalized_detail_id` in UAT should be assumed to be a working id rather than a CPQ-issued one.
16. **Should a failed external push stop being a success?** Finding 21. The per-cell push endpoints already return a real 500 with a stage; the toggle and bulk paths return 200 with the failure buried in a green banner. Making them agree is a small change with a large effect on whether operators can trust what they see.
17. **Should `PUT /api/qpart/parts/[id]` be allowed to write allocations?** Finding 24. Either it needs the same permission check and audit rows as the Sales screen, or `country_codes` should be split out of the part save.
18. **Can `/api/auth/me` be read once per page instead of twice-plus?** Finding 22. The same applies to `item-map/lookup` on the parts screen, where it fires on every keystroke rather than on a debounce.
19. **Should the bulk run report that it finished, and lock the controls it depends on?** Finding 23.
20. **Should *Push all BC OK* and *Sync from sampler results* ask before acting?** Finding 26. The sync in particular moves a watermark that cannot be moved back from the interface.
21. **Why does the part detail page's image read 500 in UAT, and should a missing Blob token be a 500 at all?** Finding 25. An empty-bodied 500 on every page view is both noise and a silent failure.
22. **Should the replay page stop calling its Run "read-only"?** Finding 27. It is read-only for Neon and not for CPQ, and the distinction matters to anyone deciding whether to run it against live data.
23. **Should upstream provider errors be relayed to the screen?** The OpenAI 401 arrived with a partly masked key in it and was displayed verbatim. Logging it and showing something actionable would be both safer and more useful.
