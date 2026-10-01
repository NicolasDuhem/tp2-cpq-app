# Journey validation guide — checking the map against the running app

This is the brief for an independent reviewer who will drive the **UAT** application in a real browser and compare what actually happens against what [`docs/data-journeys.html`](./data-journeys.html) claims.

**The point of this exercise is to find the gap** between the documented behaviour and the observed behaviour — and a gap is a useful result, not a failure.

---

## Run 1 — completed 30 September 2026

> **This guide has been used once, and its results are already folded into the map.** Seventeen of the nineteen journeys were opened against `tp2-cpq-app-uat.vercel.app` (deployment `dpl_9qSgkHYHTRLoAHtktPwpWRYPnHbW`) with every request and response body captured, and **fifteen produced step-level results**. Eight claims were refuted and corrected, ten undocumented calls were added, and the headline risk — a failed external push reported as success, in green — was confirmed exactly.
>
> **Read [`DATA_METRO_MAP_AUDIT.md` §6b](./DATA_METRO_MAP_AUDIT.md#6b-what-the-uat-validation-run-changed) before re-running anything.** It lists what was confirmed, what was refuted, what was added and, most importantly for a second run, **what is still unobserved**. The journeys file now marks every checked step with its verdict, so a step with no flag is one nobody has watched happen.

### What a second run should target

The gaps left by run 1, in order of value:

1. **Every production external PostgreSQL write path.** The external database accepts only the live tool's IP address, so from UAT every push times out after ~9.5 s and nothing about the two-table write order, the `Qpart` marker literals or the batch concurrency could be observed. **This cannot be closed from UAT at all** — it needs a run from a host whose IP the external database accepts.
2. **The replay overwrite apply path** (`#replay-overwrite` steps 5–10): archive, the guarded update, the single external update. Run 1 stopped at the Apply button. These are the most carefully fenced writes in the codebase and the only ones still entirely unobserved. A safe target exists: the throwaway reference **`CFG-20260930-633B97DA`**, created by run 1.
3. **`#qpart-updateall`** and **`#seq-resync`** — both need a password that run 1 did not have. The *Update all* unlock is a genuine second factor with a hardcoded fallback; worth confirming the dialog wording changes when it is armed, which run 1 could not check.
4. **`#qpart-picture`** — needs a working `BLOB_READ_WRITE_TOKEN`. The delete ordering hazard (file removed before the record) is still unobserved.
5. **`#qpart-translate` steps 5–6** — needs a real OpenAI key. Note that run 1 proved no spend occurs with a placeholder key, because the call is rejected at authentication.
6. **`#signin`** — never run, because the tester was already signed in. The login POST, the focus trigger and the redirect are all unobserved.
7. **`#create-user`** — still out of scope (see the hard rules). This leaves the audit's **most serious** finding, the fail-open authorization guard, resting on code-reading alone.

### Clean-up still owed from run 1

| What | Where |
|---|---|
| Part `ZZ-CLAUDE-TEST-0930` (id 2633) | `/qpart/parts/2633` — a throwaway part, safe to delete |
| `CFG-20260930-633B97DA`, `CFG-20260930-89C1F08A` with sampler rows **599 and 600** | Both inserted `active = true`, so two G Line bikes are allocatable in AT. Run 1 could not check this on Bike Allocation, where G Line was not offered as a ruleset filter — **worth checking before a demo** |
| 17 `cpq_image_management` rows, 18 sampler rows marked processed | The picture sync's watermark is one-way and cannot be moved back from the interface |

---

## 0. Fill these in before you start

| Blank | Value |
|---|---|
| UAT base URL | `__________________________` |
| Login email | `__________________________` |
| Login password | `__________________________` |
| A ruleset / bike type that has data | `__________________________` |
| A test part number in QPart PIM | `__________________________` |
| Countries safe to toggle | `__________________________` |
| “Update all” password (optional) | `__________________________` |

Open `docs/data-journeys.html` in a second tab. Every journey is deep-linkable: `data-journeys.html#bike-toggle`.

---

## 1. Hard rules

**🔴 Do not touch the Setup User section.** Do not open `/setup/users`. Do not call any `/api/setup/users*` endpoint. Do not create, edit, deactivate or inspect any user account. The journey **“Create a user and set permissions”** (`#create-user`) is **excluded from this exercise** — read it in the map if you like, but do not execute it.

Everything else in the application is fair game: this is a UAT environment and writes are acceptable.

Additional rules:

- **Never type a real production credential** anywhere. Use the UAT login provided above.
- **Do not record any password, API key or token** in your report, even one you can see. Write `[redacted]`.
- **Do not attempt the unauthenticated findings.** The map documents endpoints that lack permission checks. Do **not** test them by calling the API directly with the session cleared — that is a security test, not a journey validation, and it is out of scope here. Only observe what the UI itself sends.
- If a journey step would clearly destroy something you cannot restore, **stop and report it** rather than proceeding.

---

## 2. Environment facts that change what you should expect

These are not defects. Record them as `ENV`, not as `GAP`.

### 2.1 The external PostgreSQL database is unreachable

The external database allow-lists by IP address, and only the live tool's IP is accepted. Traffic from this UAT browser session will **not** reach it.

This makes several journey steps fail — and that is itself one of the most valuable things you can verify, because the map makes specific claims about how those failures surface:

| Action | Journey claim to verify | Expected observation with the database off |
|---|---|---|
| Single bike/part toggle | *“a failed external push still returns a success status — the failure appears only inside the message”* | **HTTP 200**, and the body contains `result.externalSync.state: "error"` with a connection message. **Verify this specifically — it is a headline claim.** |
| `⤴` push a single cell | Push route returns 500 on external error | **HTTP 500** with `stage: "allocation_external_sync"` |
| Refresh external status | Typed error with a stage, status derived from failure type | **HTTP 502** (unreachable) or **504** (timeout), body carrying `errorType`, `errorCode`, `errorHint`, `stage` |
| Push all BC OK (bulk) | Failures collected, batch not aborted, reported as counts | **HTTP 200** with a non-zero `errors` count |
| Bulk update (bike or part) | Internal change commits; push failure does not roll it back | Allocation **does** change on screen; push counts show errors |

That last row is the clearest demonstration of the “no transaction” finding: the internal write survives while the external one fails. Please capture it.

### 2.2 Other switches that change behaviour

| Switch | If it is off / on | Effect you will see |
|---|---|---|
| `BIGCOMMERCE_BC_STATUS_ENABLED` | If not exactly `true` | **Check BC Status** returns a successful empty result and the column shows *Not checked*. Not a bug. |
| `CPQ_USE_MOCK` | If `true` | Start and Configure return fixture data; **Finalise still calls live CPQ and will fail**. If you see this, it confirms the “no mock branch on finalise” finding. |
| `NEXT_PUBLIC_CPQ_DEBUG` | If `true` **and** admin mode is on | The Bike Builder shows an in-page debug panel listing each call with its request and response. Use it if present — it is easier than DevTools for the CPQ journeys. |

---

## 3. How to observe what is actually happening

1. Open **DevTools → Network**, filter on `/api/`, and tick **Preserve log**.
2. Before each journey, **clear the log**.
3. Perform the journey.
4. For each request, record: **method**, **path**, **status**, and the **response body** (and request body where the journey documents a payload).
5. Screenshot the screen state at the point the journey describes.

For CPQ journeys, if the in-page debug panel is available (admin mode + debug flag), it already shows request and response per call with a trace id — capture that instead.

---

## 4. The prompt to give Claude in Chrome

Paste everything between the lines, after filling in section 0.

---

```
You are validating a technical document against a live application, in a browser.

CONTEXT
I have a journey map at docs/data-journeys.html that claims to describe exactly what
happens inside a web application — which screens, which API calls, which payloads,
which database writes and which external systems, step by step. It was written by
reading the source code and has never been run against a live system.

Your job is to drive the real UAT application and tell me where the document is
WRONG, INCOMPLETE, or MISLEADING. Finding gaps is the goal. Do not try to confirm
the document — try to break it.

ENVIRONMENT
- UAT base URL: <FILL IN>
- Login: <FILL IN EMAIL> / <FILL IN PASSWORD>
- This is a UAT system. Creating and changing data is acceptable.

ABSOLUTE RULES
1. NEVER open /setup/users or touch anything in the Setup User section. Do not
   create, edit, view, deactivate or delete any user account. That whole area is
   out of scope. If a journey leads there, stop and say so.
2. Never write a password, API key or token into your report. Write [redacted].
3. Do not call API endpoints directly to probe for missing authorization. Only
   observe the requests the user interface itself makes.
4. If an action looks irreversible and you are not certain it is safe, stop and ask
   me before doing it.

KNOWN ENVIRONMENT CONSTRAINT — READ THIS BEFORE REPORTING FAILURES
The external PostgreSQL database is firewalled by IP and is NOT reachable from this
browser session. Steps that push to it WILL fail. That is expected. Classify those
as ENV, not as a gap. But DO verify HOW they fail, because the document makes
specific claims about that:
- A single allocation toggle should still return HTTP 200 while reporting
  externalSync.state = "error" inside the body. Confirm or refute this specifically.
- The single "push this cell" action should return HTTP 500.
- "Refresh external status" should return 502 or 504 with errorType / errorCode /
  errorHint / stage fields.
- A bulk action should still change the allocation internally even though the push
  fails. Confirm the internal change survives.

METHOD
For each journey I give you:
1. Open DevTools -> Network, filter "/api/", tick Preserve log, clear the log.
2. Perform the steps exactly as listed.
3. Record every /api/ request: METHOD, PATH, STATUS, and the response body.
   Record request bodies where the journey documents a payload.
4. Compare against the journey's steps IN ORDER.
5. Take a screenshot at each point where the journey describes what the user sees.

WHAT TO REPORT — for every journey, fill in this table:

| # | Journey step (as documented) | What actually happened | Verdict |
|---|---|---|---|

Verdicts:
- MATCH    - behaves as documented
- MINOR    - same behaviour, wording or a label differs
- GAP      - behaviour genuinely differs from the document
- MISSING  - a call or a step happened that the document does not mention
- EXTRA    - the document describes a step that did not happen
- ENV      - failed only because of the environment constraint above
- BLOCKED  - could not test, and why

Be specific. "Step 6 documents POST /api/cpq/sampler-result returning 201, but the
response was 400 with 'ruleset is required'" is useful. "Mostly correct" is not.

Pay particular attention to:
- Calls the document does NOT mention (these are the most valuable findings).
- The ORDER of calls, especially where the document claims one thing happens
  before another.
- Whether the document's claimed status codes and error messages are the real ones.
- Whether on-screen labels and messages match what the document quotes.

Start with the journey I name next. Do not move on until I confirm.
```

---

## 5. Journey-by-journey scripts

Risk key: 🟢 safe · 🟡 writes data (fine in UAT) · 🟠 do the minimum scope · 🔴 do not run.

### 🟢 1. Signing in — `#signin`
Go to the base URL, sign in with the UAT credentials.
**Verify:** `POST /api/auth/login` → 200. `GET /api/auth/me` fires on load and again on window focus (click away and back — the map claims three triggers: mount, focus, and an auth-changed event). After login you land on **Bike Allocation**, not the page you first asked for.
**Look for:** how many times `/api/auth/me` fires in total. The map calls it "the hottest endpoint"; check whether that is visibly true.

### 🟡 2. Configure a bike and save it — `#cpq-save`
Go to `/cpq`. Pick an account code and a ruleset. **Start a new session** → choose two or three options → **Save Configuration**.
**Verify the order:** `/api/cpq/init` → `/api/cpq/configure` (once per option) → `/api/cpq/finalize` → `/api/cpq/configuration-references` → `/api/cpq/sampler-result`.
**Key claims to test:**
- The last three are **three separate requests from the browser**, not one server call.
- `configuration-references` returns **201** and the reference looks like `CFG-YYYYMMDD-XXXXXXXX`.
- `sampler-result` returns **201**.
- After saving, the session **closes** and cannot be edited.
- `/api/cpq/image-layers` fires after each configure (the map says it drives the preview).

### 🟡 3. Finalise a configuration at CPQ — `#cpq-finalize`
Same as above but watch only the finalise call.
**Verify:** the request body is exactly `{"sessionID":"..."}` — note the capital **D**, and that `/api/cpq/configure` uses `sessionId` instead. Confirm the two really do differ.
**Try:** pressing Save twice, or saving with no session. The map claims *"Missing session ID before finalize"* with `errorCategory: "missing_session_id"`.

### 🟢 4. Reopen a saved configuration — `#cpq-retrieve`
Paste the `CFG-` reference from journey 2 into the reference box → **Retrieve Configuration**.
**Key claim:** the session id that comes back is **different** from the one that was saved — reopening starts a brand-new CPQ session. Compare the two ids and confirm.

### 🟠 5. Configure many bikes at once — `#cpq-bulk`
**Keep it tiny: tick ONE row and ONE country.** This journey multiplies rows × countries and can produce hundreds of calls.
**Verify:** `/api/cpq/setup/picture-management` is read first, then per execution `init` → `configure` ×N → `finalize` → `configuration-references` → `sampler-result`.
**Key claims:** each execution gets a **fresh** `detailId`; the row moves through *pending → configured → finalized → saved*; the final message reads *"Bulk run finished: X succeeded, Y failed, Z saved."*
**Also check:** whether every other control on the page is disabled while it runs.

### 🟡 6. Allocate one bike to one country — `#bike-toggle`
Go to `/sales/bike-allocation`. Click one **Active/Inactive** cell.
**Verify the claimed five internal steps** happen in one request, and:
- the response is **HTTP 200** with `externalSync.state: "error"` (external DB is off) — **this is the headline claim, confirm it precisely**;
- clicking the cell **back to the state it was already in** returns **404** *"No matching sampler rows found for this cell"*;
- a cell showing a **dot** opens the configurator instead of toggling.
**Then** go to `/sales/allocation-audit` and confirm your change appears with your name, the before/after state and the BigCommerce status.

### 🟡 7. Check BigCommerce readiness — `#bc-check`
On the same page press **Check BC Status**.
**Verify the three-call chain:** `item-map/lookup` → `variant-status` → `item-map/upsert`.
**If the flag is off:** `variant-status` returns `{"enabled":false,"items":{}}` with a **200** and the column shows *Not checked*. Record which case you saw.

### 🟡 8. Bulk activate a page of bikes — `#bike-bulk`
Press **Bulk activate**. **Read the confirmation dialog carefully before confirming.**
**Key claims:** the dialog names the **exact** bike count, country count and country list, and states that other pages are untouched. Confirm the wording matches. Then confirm the internal change **did** apply even though the external push failed.

### 🟡 9. Allocate one part to one country — `#qpart-toggle`
Go to `/sales/qpart-allocation`. **Pick a part that has never been allocated if you can.** Click one cell.
**Key claim to test:** the map says a back-fill runs **before** the toggle and can insert a row for **every active country**. After toggling one cell, check whether the other countries for that part suddenly show as *Inactive* rather than blank. That is the back-fill becoming visible.
**Also:** the accepted status values differ from the bike screen (`inactive` here vs `not_active` there) — visible in the request body.

### 🟡 10. Allocate many parts at once — `#qpart-bulk`
Press **Bulk activate** on the parts screen.
**Key claim:** unlike the bike screen, this **pushes as well as updates in the same request** — you should see external push counts in the response of `bulk-update` itself, without pressing Push all BC OK.
**Also:** the map says this confirmation dialog, unlike the bike one, does **not** state the counts or the scope. Confirm or refute.

### 🟠 11. Unlock "Update all" for parts — `#qpart-updateall`
Only if you have the password. Tick **Update all** and enter it.
**Verify:** `POST /api/sales/qpart-allocation/update-all-auth` → 200, and a cookie is set that page scripts cannot read.
**Then STOP.** Do **not** run a bulk action with it armed unless you first apply a filter that matches only one or two parts — with it on, scope becomes every filtered page.
**Report:** whether the confirmation dialog looks any different once armed. The map claims it does not, which it calls a risk.

### 🟡 12. Save a part — `#qpart-save`
Open a test part in `/qpart/parts`, change something, **Save part**.
**The headline claim:** the five related lists are **deleted before** the channel values are validated, so saving with an invalid channel wipes them.
**Do NOT deliberately corrupt a real part to test this.** Instead: create a throwaway part, give it a translation and a metadata value, save it successfully, then confirm the request/response shape matches. If you can trigger an invalid-channel error *safely on a throwaway part*, check whether its translations survive. **If in doubt, skip the destructive half and report it as untested.**

### 🟡 13. Add and remove a part picture — `#qpart-picture`
On a throwaway part, upload an image, then delete it.
**Key claims:** upload path is derived from the part number (`qparts/<part_number>.jpg`); re-uploading **replaces** the previous file with no version history; on delete the **file goes before the database row**.
**Check:** whether deleting the whole part leaves its images behind (the map says blobs are never cleaned up).

### 🟢/🟡 14. Import parts from a spreadsheet — `#qpart-csv`
Use **Export CSV** first to get a valid file. Edit one row. Then **Preview import**.
**Key claim:** preview writes **nothing** — confirm no write requests fire and no data changes. Then deliberately break a cell (put text in a number column) and confirm the error names the row number and the field.
Only press **Apply import** if you are comfortable writing; keep it to one or two rows.

### 🟠 15. Translate a field with AI — `#qpart-translate`
**This spends money on a real OpenAI account. Do one field, once.**
**Key claims:** it refuses to run when the base-language value is empty (*"Base (…) value is required before translation"*), and the result is **saved immediately** with no review step. Confirm both — especially that the translation is already persisted when it appears.

### 🔴 16. Create a user and set permissions — `#create-user`
**DO NOT RUN.** Out of scope. Skip entirely.

### 🟢 then 🟠 17. Correct stored configurations — `#replay-overwrite`
Go to `/admin/cpq-replay-validation` (needs permission).
- **Load references** and **Run** are **read-only** — safe, and worth verifying: confirm **no write requests** appear in the Network tab during a Run.
- **Apply selected replay results** is a real write. If you do it, **select exactly one row**. The map claims the server re-runs the replay itself and ignores the browser's result, archives before updating, and does it all in one transaction — then makes one external update that will **fail** here (database off). Confirm the response reports the Neon part as applied and the external part as failed, separately. That is the cleanest possible demonstration of the post-commit boundary.

### 🟠 18. Collect new picture combinations — `#picture-sync`
`/cpq/setup?tab=pictures` → **Sync from sampler results**.
**Caution:** this moves a one-way watermark. Rows marked processed are skipped forever after. Run it **once** and record the summary counts. The map's claim is that the watermark moves *before* the harvested combinations are written — you cannot observe the ordering from outside, so record this as **not externally verifiable** unless an error occurs.

### 🟠 19. Repair a database counter — `#seq-resync`
`/qpart/admin/sequences`, after turning on admin mode.
**Verify:** the page loads counter health automatically with no button press, and the request carries an `x-admin-mode: true` header (visible in DevTools → Headers).
**Only press Resync** on a counter that is genuinely reported as drifted. If none are drifted, skip the write and just report the read.

---

## 6. Gap record — the deliverable

One table per journey, plus this summary at the end:

| Journey | Steps | MATCH | MINOR | GAP | MISSING | EXTRA | ENV | BLOCKED |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Signing in | 8 | | | | | | | |
| Configure a bike and save it | 10 | | | | | | | |
| Finalise a configuration at CPQ | 6 | | | | | | | |
| Reopen a saved configuration | 5 | | | | | | | |
| Configure many bikes at once | 11 | | | | | | | |
| Allocate one bike to one country | 10 | | | | | | | |
| Check BigCommerce readiness | 5 | | | | | | | |
| Bulk activate a page of bikes | 7 | | | | | | | |
| Allocate one part to one country | 8 | | | | | | | |
| Allocate many parts at once | 8 | | | | | | | |
| Unlock "Update all" for parts | 7 | | | | | | | |
| Save a part | 7 | | | | | | | |
| Add and remove a part picture | 7 | | | | | | | |
| Import parts from a spreadsheet | 8 | | | | | | | |
| Translate a field with AI | 6 | | | | | | | |
| Create a user | — | — | — | — | — | — | — | OUT OF SCOPE |
| Correct stored configurations | 10 | | | | | | | |
| Collect new picture combinations | 5 | | | | | | | |
| Repair a database counter | 6 | | | | | | | |

Then answer these five directly:

1. **Which calls did the application make that the journey map does not mention at all?** (Most valuable finding.)
2. **Where was the documented order of events wrong?**
3. **Which documented status codes or error messages did not match reality?**
4. **Which on-screen labels differ from the ones quoted in the map?**
5. **Is there anything the map presents as a risk that is actually handled correctly in the running app** — or the reverse?

---

## 7. Feeding the result back

Send back the filled tables and the five answers. Each confirmed **GAP**, **MISSING** or **EXTRA** should become a correction to `docs/data-journeys.html` and, where the same claim appears there, to `docs/data-metro-map.html`.

**How run 1's results were applied, as the pattern to follow.** Each refuted claim had its step text rewritten — not annotated, rewritten, so the step no longer says the wrong thing — and gained a `uat:{v:'GAP', t:'what was actually observed'}` entry recording that it had been wrong and what replaced it. Undocumented calls became new steps flagged `MISSING`. Payload and label differences became `MINOR`. Steps that could not be exercised were flagged `ENV` (a dependency was off or unreachable) or `BLOCKED` (not reachable from the interface) rather than left looking verified. The same corrections went into the metro map at operation level, eight new findings went into both artefacts, and all five test suites were re-run. **Nothing was left saying two different things in two places** — that is the part worth copying.

Then update the run record at the top of this guide, so the next reviewer starts from the gaps rather than from the beginning.

Both files carry `meta.commit` / an audited-commit note. If the UAT deployment is running a different commit than the one the map was built from (`cf1000de5625801a57164a957fd6b9402cd881ce`), **say so first** — a difference in behaviour may simply be a difference in version, and that changes how every other finding should be read.
