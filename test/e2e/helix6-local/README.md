# Isolated Helix 6 Canvas harness

## B5 qualified branch acceptance (coordinator only)

Run from the integrated `da-live` `rs-poc` checkout, with the reviewed B1–B4 working
trees in their sibling `da-rs` and `da-collab` directories. The runner snapshots
those trees into a new private scratch directory, builds da-rs, and starts only
fresh loopback listeners and stores. Coordinate every run: do not overlap any
other service, build tree, port or store owner. Dependencies and isolation are
the same as H5 below. Do not execute from the detached B5 patch worktree.

First, run **only** the qualified Canvas checkpoint. It creates draft with the
real selector on a real marked, branching-enabled site, checks browser CORS and branch headers,
and requires Canvas's flush plus a real Worker's raw qualified H6 PUT carrying
the previous strong ETag. The runner enables H6 Source but leaves the branch
transport at its default. Default content must remain unchanged:

```sh
env -u H6_BASELINE -u H6_BASELINE_NO_UPGRADE -u H6_BRANCH_BASELINE -u H6_FULL -u H6_EARLY_FULL -u H6_CASE -u H6_DIAGNOSTIC_BUILD -u H6_BRANCH_FULL -u H6_BRANCH_GATE_OFF H6_LIVE=1 H6_BRANCH=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
```

Only after that passes, the unfiltered full run repeats the checkpoint in its
own fresh store before any dependent tests. No prior marker or receipt is reused:

```sh
env -u H6_BASELINE -u H6_BASELINE_NO_UPGRADE -u H6_BRANCH_BASELINE -u H6_FULL -u H6_EARLY_FULL -u H6_CASE -u H6_DIAGNOSTIC_BUILD -u H6_BRANCH_GATE_OFF H6_LIVE=1 H6_BRANCH=1 H6_BRANCH_FULL=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
```

The full scenarios exercise two Canvas tabs, branch media and version restore,
Browse copy/trash and selector switching on both marked and legacy controls.
They dirty Canvas in each direction and hold the real Default or draft Worker
`page.html` PUT while the selector's flush is outstanding: the URL and source
bytes must remain unchanged, the editor and page must be inert, and a positive
Worker flush acknowledgement must precede navigation. They then restore the
original Default page with an exact conditional write before reconciliation;
this restore itself is a real Default history mutation. The scenarios also cover
qualified aliases, private snapshots, mixed kinds, pinned Changes, visual and
source diffs, real marked-branch sync/conflict/publish controls, and Site History
revert. They hold a real qualified Worker PUT and its corresponding genuine branch notice separately,
then require exact `If-Match`, Source `412`, socket `4412`, real Canvas reload,
and independent Default/sibling connections. After the branch notice, each
independent room must propagate a real Yjs edit to a second client and flush it
through the real Worker with its own strong validator, without modifying the
other rooms. The raw alias observer uses the production 4412 fence to retire its
old provider and Y.Doc; after the held notice is forwarded, a newly admitted Y.Doc
must match the newer Source without stale or duplicated edits. Raw observers use
`disableBc` so their propagation is through the real Worker, not cross-tab
broadcast. A second held PUT spans checked
delete/recreate and must not overwrite the new branch instance. Logs and receipts
are retained under the fresh `helix6-h5-*` scratch path.

Run the gate-off control separately, also with a fresh store:

```sh
env -u H6_BASELINE -u H6_BASELINE_NO_UPGRADE -u H6_BRANCH_BASELINE -u H6_FULL -u H6_EARLY_FULL -u H6_CASE -u H6_DIAGNOSTIC_BUILD -u H6_BRANCH_FULL H6_LIVE=1 H6_BRANCH=1 H6_BRANCH_GATE_OFF=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
```

This verifies the marked DA alias still works directly but carries the unavailable
hint and is rejected by the bound real Worker; qualified H6 must fail closed.
The site marked but not branching-enabled is tested in the checkpoint. The
bridge/gates allow only the explicitly named `work~draft`, `work~other`, and
`control~draft` branch scopes in addition to the pre-existing bare scopes. The
bridge checks its fixed origin and methods; the loopback gates check their nonces
and forward genuine bytes, responses and notifications. No CORS is injected.
The saved PUT gate can hold only the explicitly named `race`, `race-reverse`,
`page`, or `reuse` collab PUTs on the permitted bare/draft H6 scopes. The reuse
case seeds its own Default and draft documents, independently of the race case.
The saved PUT gate
and notice gate deliberately control **timing**, not the Source
or Worker result. The shell, NX, IMS, token, and network substitutions are exactly
those described under Isolation and substitutions below; none is real hosted NX
or IMS. The live harness does not force Workerd eviction. The separate
`da-collab` suite simulates wake through the production `DocRoom.webSocketMessage`
handler with retained storage and serialized attachments. A browser reconnect
does not count as a Workerd hibernation test.

### Local acceptance receipt

The unfiltered normal-build qualified run `helix6-h5-if550H` passed all seven
active scenarios, with only the separate gate-off scenario skipped. A real
Canvas flush sent raw `text/html` to `/h6test/sites/work~draft/source/page.html`
with the previous strong ETag and received `201` and an advanced ETag. Default
was unchanged. The run also verified scoped media and version restore, both
dirty switch barriers, mixed-kind publish and revert, alias and room isolation,
and `412`/`4412` on both a stale write and same-name branch recreation. All
captured qualified browser traces had zero external requests and page errors.
The separate gate-off `helix6-h5-pNRs7S` run passed its only active case.
See `da-rs/HELIX6_BRANCHING_WIRE.md` for the wire contract and compatibility
receipts. Retained scratch logs are local evidence, not part of the checkout.

This directory is independent of the shared E2E setup and the existing
`branching-local` runner. The dedicated H5 suite exercises real local Source,
Worker and Canvas routes; the coordinator owns the overall acceptance verdict.
The baseline case uses a legacy site and must never be reported as the H6
Canvas exit gate.

## Frozen baseline trace

Requirements: Java 25, offline Maven dependencies, `rsync`, `tar`, `lsof`,
Node, installed Chrome, `test/e2e/node_modules`, and the existing
`da-collab/node_modules` Wrangler installation. All three repositories must be
on `rs-poc`. No existing service or repository store is used.

```sh
cd /Users/jelmini/git/da/da-live
H6_BASELINE=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
```

This archives `da-rs` `529232b`, `da-live` `4265d3b4`, and `da-collab`
`8219727` into a new retained `helix6-h5-*` scratch directory, builds the
archived server offline, and starts an empty Oak and a new Wrangler Durable
Object store. It seeds the org ACL and a synthetic legacy HTML document over the
real API. The strict baseline blocks NX's external upgrade probe; this is a
diagnostic failure, not a bypass or H6 acceptance. To continue diagnosing
legacy Canvas without that external dependency, this **baseline-only** shim
replaces the checked-in NX test fixture's upgrade probe with `false`:

```sh
H6_BASELINE=1 H6_BASELINE_NO_UPGRADE=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
```

Never use that shim for H6 acceptance. The initial strict run at
`helix6-h5-uWaGVB` reached the real Canvas route and real authorized
`GET /config/h6test/`, then blocked `GET https://admin.hlx.page/ping/h6test/work`;
no document HEAD or Worker socket occurred. NX button styles and some icon
assets were missing locally. The first non-baseline scratch build also failed
Spotless while the server implementation was being edited; it was not a live
checkpoint. With the baseline-only NX shim, `helix6-h5-SC0xAU` opened the real
Canvas Content editor: browser HEAD and Worker HEAD/GET/PUT reached the local
legacy Source. The Worker PUT used the legacy `If-Match: *`, not an H6 fence.
The guarded browser also attempted public AEM config, preview cookie and preview
document requests; all were blocked. The shell's NX hash-state path is made
relative, consistent with the Canvas unit-test hash-state contract; the first
attempt incorrectly supplied a leading slash.

## First live checkpoint (coordinate before running)

The following command is intended for the coordinator-approved H1/H2 + H3 + H4
vertical slice, not final H5 acceptance. It snapshots tracked and non-ignored
untracked files from all three current uncommitted working trees to scratch,
excluding local credentials and stores, before building and running. It never enables the
baseline NX upgrade shim:

```sh
env -u H6_CASE -u H6_FULL -u H6_EARLY_FULL -u H6_CLOSE_DIAGNOSTIC -u H6_LEGACY_CLOSE_DIAGNOSTIC -u H6_DIAGNOSTIC_BUILD -u H6_BASELINE -u H6_BASELINE_NO_UPGRADE H6_LIVE=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
```

The vertical case provisions a marked site and a legacy control, restarts its
owned da-rs against the same scratch Oak, verifies real browser CORS discovery,
and attempts to edit and persist through the actual Canvas and Worker. A success
requires a real H6 Worker PUT with the previously read literal ETag, raw
`text/html` and `X-DA-Initiator: collab`, a local
document HEAD, and no blocked external browser requests. Other H5 exit scenarios
are separately gated by `H6_FULL=1` or `H6_EARLY_FULL=1`. Only an unfiltered
normal-build full run on the reviewed tree is a full local H5 receipt.

During concurrent development only, `H6_DIAGNOSTIC_BUILD=1` skips the scratch
Maven Spotless check and starts a second disposable Wrangler binding probe that
issues real authorized Source HEADs with several redirect modes. Neither this probe
nor the skipped check is acceptance evidence. The flag is rejected with
`H6_BASELINE` or final `H6_FULL`; a normal build and full suites remain required.

```sh
H6_LIVE=1 H6_DIAGNOSTIC_BUILD=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
```

The diagnostic run `helix6-h5-sEF5Xw` observed a real authorized `dars` HEAD
return `200` and `X-DA-Source-Mode: helix6` with `redirect: follow`, while
Workerd rejected `redirect: error` with `TypeError` before the bridge was
entered. Consequently the real Worker's admission returned 503 in that historical
run. H4 subsequently fixed and reviewed this path.
Run `helix6-h5-IPTvF1` additionally verified that `redirect: manual` reached the
real bridge and returned the same authorized 200/mode response. Its probe HEAD
returned ETag `"0f7dfcec-0f47-46c8-8c61-a5915ccf7f05:1"`; this is **not** a
Worker PUT validator. Both diagnostics
reopened the marked store and the browser made the H6 HEAD locally; neither
observed an H6 Worker PUT.

Normal-build run `helix6-h5-e0oHwy` reopened the marked store and produced a real
Canvas flush frame and Worker H6 raw `text/html` PUT with initiator `collab`:
`If-Match: "bca21b0c-07b3-4faa-bf7c-95431765ecb0:1"`, response `201`, new ETag
`"bca21b0c-07b3-4faa-bf7c-95431765ecb0:2"`, and persisted edit readback. The
browser trace recorded no blocked external requests. The overall test failed
after that receipt because it asserted the same-document legacy-control HEAD
before hash-navigation completed; the harness now waits for that request and
the distinct control content. The normal-build rerun `helix6-h5-fRuRLi` passed
the vertical case, including that control: the Worker PUT sent
`If-Match: "78853e72-83cf-4276-bf80-d54fc8c874d8:1"`, `Content-Type: text/html`,
and `X-DA-Initiator: collab`, received 201 and ETag
`"78853e72-83cf-4276-bf80-d54fc8c874d8:2"`, and real `forceSave()` emitted a
flush frame. The test read back the edit and recorded no blocked external browser
requests. This is the vertical slice, not full H5 acceptance.

Early full diagnostic `helix6-h5-BHRpoa` passed the vertical and exercised
cross-alias reads, ETags, actor history, copy, and snapshot up to trash. Its API
case failed because the harness expected a filename containing the original
basename. The server intentionally generates an opaque UUID trash name; the
harness now identifies entries by their real shared `X-da-id`. Later cases in
that run were skipped and require a fresh diagnostic.

Early diagnostic `helix6-h5-9KuHgx` (Spotless skipped) passed the vertical,
cross-alias API/identity/trash case, and both delayed-412/4412 race directions;
its Canvas flow reached two-tab flush and image upload/render after reload but
timed out because the local panel shortcut opened Versions without opening the
new-version row. The harness now uses the real Create version button. The race
has also been tightened to flush its room-sharing sentinel before arming and to
require that the held real PUT contains the synthetic edit. That earlier race is
therefore diagnostic, not final proof of the strengthened case. Worker logs in
the same run also show 403 on last-connection-close H6 saves after the races;
the legacy control had a similar 403 in `helix6-h5-fRuRLi`. These close-path
failures need separate investigation and must not be hidden by connected flushes.

Normal-build early diagnostic `helix6-h5-48H4WX` passed the strengthened mixed-case
alias race in both external-write directions: each held PUT contained the actual
synthetic edit, used raw `text/html` and `collab` with the last strong ETag,
returned 412, and produced a Canvas 4412 before the real held notification was
forwarded once. The UI flow created a version with a real 201 POST, but Restore
left the newer text in place and made no version-bytes GET. It also reproduced
the H6 last-close 403. This diagnostic is not final H5 acceptance.

Normal-build early diagnostic `helix6-h5-hY3MAd` again passed the vertical,
cross-alias API case and both strengthened races. Its restore instrumentation
showed the actual editor bridge was present and selected version ID
`f5ccffae-7412-4b48-956f-f54f749c1112.html`; the bound adapter's version-ID
validator rejected the dot before a GET. Its H6 last-close test also returned
403 with absent auth and unsaved content. H3 and H4 subsequently fixed these
paths; the unfiltered `3YYW72` run below exercises both fixes.

Browse create/copy/trash now also has an independent real-route case, so a
History restore failure does not hide that coverage. It does not replace the
combined Canvas snapshot → restore → browse/trash case, which remains required.
In early diagnostic `helix6-h5-IW4t6e`, Browse created a folder and page, opened
Canvas, saved the page, and copied it to the folder with a real H6 PUT (200).
The subsequent delete confirmation failed because the harness looked for the v2
dialog while `?browse=1` loads the legacy `da-dialog`; the locator is corrected
and the filtered normal-build diagnostic `helix6-h5-vRnouF` passed both its
vertical setup and independent Browse case. It observed real folder/page POSTs,
copy PUT 200, trash DELETE 204 and retained identity/version; it is not a full
H5 receipt.

Frozen-baseline close diagnostic `helix6-h5-DQIWcQ`, using Worker `8219727` and
the real authenticated legacy Source, reproduced an unflushed close returning
403 with `auth=absent`; the sent edit was not stored. This establishes that the
legacy issue predates H4. It does not resolve the H6 close failures. The bridge
records only whether authorization is present, never its value. An explicit
`H6_CLOSE_DIAGNOSTIC=1` run exercises both the legacy control and H6 close paths;
the H6 unflushed-close case is also required in full mode. The normal vertical
case separately requires a connected legacy edit/flush and real multipart PUT.
In normal-build diagnostic `helix6-h5-OV5SmW`, that connected legacy edit/flush
passed (`auth=present`, `If-Match: *`, multipart, 201 and stored readback). The
separate H6 unflushed-close test sent raw `text/html` with
`If-Match: "23e8eb19-21e7-4ef0-969f-505ba0c22471:1"`, but had `auth=absent`,
received 403, and did not store the edit. H4 subsequently fixed and independently
reviewed the H6 path; the legacy diagnostic remains separately identified as a
pre-existing issue.

Reproduce the two close diagnostics independently, with fresh stores:

```sh
env -u H6_LIVE -u H6_FULL -u H6_EARLY_FULL -u H6_DIAGNOSTIC_BUILD H6_BASELINE=1 H6_BASELINE_NO_UPGRADE=1 H6_CLOSE_DIAGNOSTIC=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
env -u H6_FULL -u H6_EARLY_FULL -u H6_DIAGNOSTIC_BUILD -u H6_BASELINE -u H6_BASELINE_NO_UPGRADE H6_LIVE=1 H6_CLOSE_DIAGNOSTIC=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
```

After the vertical slice passes but before review completes, an explicitly
labeled early diagnostic can run the full scenarios using a normal build. One
Playwright worker runs the cases in order. Each full case requires a marker from
the passing vertical case; if a later full case fails, the other independent cases
can still run. This early command is never final acceptance:

```sh
env -u H6_CASE -u H6_FULL -u H6_CLOSE_DIAGNOSTIC -u H6_LEGACY_CLOSE_DIAGNOSTIC -u H6_DIAGNOSTIC_BUILD -u H6_BASELINE -u H6_BASELINE_NO_UPGRADE H6_LIVE=1 H6_EARLY_FULL=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
```

For focused early debugging, add `H6_CASE=browse`, `history`, `race`, or `close`;
each selection includes the vertical setup and is explicitly not full coverage.
`H6_CASE` is rejected outside early mode, including final mode.

If the in-progress server snapshot cannot pass Spotless, an early **diagnostic
only** may add `H6_DIAGNOSTIC_BUILD=1`. This skips that scratch formatting check
and enables the extra read-only binding probe; it must later be repeated with a
normal build on the reviewed tree.

After the vertical slice and independent H2/H4 reviews, the full harness command is:

```sh
env -u H6_CASE -u H6_EARLY_FULL -u H6_CLOSE_DIAGNOSTIC -u H6_LEGACY_CLOSE_DIAGNOSTIC -u H6_DIAGNOSTIC_BUILD -u H6_BASELINE -u H6_BASELINE_NO_UPGRADE H6_LIVE=1 H6_FULL=1 H6_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/helix6-local/run.cjs
```

Unfiltered normal-build run `helix6-h5-M9z8tM` is **red**: 5 passed, 1 failed,
2 intentionally skipped. The H6 last-close PUT was authenticated, raw HTML,
used the exact prior ETag and returned 201, but the stored edit was truncated
after Chromium closed following per-character sends that had not been confirmed
by another client. The cause of that truncated run was not established. The
harness now sends one update and waits for a second real collaborator to observe
the complete edit before disconnecting it and closing the last writer. The
filtered normal-build diagnostic `helix6-h5-rfFu5Q` passed the
corrected close and next-room checks: the last-close PUT was authenticated,
raw `text/html`, `If-Match: "088c4480-0f6a-4b55-8a89-6fcc9738ddce:2"` → 201,
with the complete edit persisted. A new room then saved another edit using
`If-Match: "088c4480-0f6a-4b55-8a89-6fcc9738ddce:3"` → 201 without losing the
prior edit. This filtered diagnostic is not full H5 acceptance. The same
unfiltered `M9z8tM` run passed the combined Canvas image, History
snapshot/restore and Browse trash/copy case, the independent Browse case, the
alias API case, and the two delayed-write/4412 race directions.

Unfiltered normal-build run `helix6-h5-3YYW72` passed **6 tests**, with two
intentional skips: the frozen-baseline case and the optional pre-existing legacy
unflushed-close diagnostic. Its real H6 vertical PUT used
`If-Match: "7eb5154f-c96b-43ee-993c-396eab4dcf13:1"`, raw `text/html` and
`X-DA-Initiator: collab`, and returned 201 with ETag
`"7eb5154f-c96b-43ee-993c-396eab4dcf13:2"`; `forceSave()` sent a flush frame.
The connected legacy control edited and flushed with auth present, multipart and
`If-Match: *`, receiving 201 and a successful readback.

The observer-confirmed H6 last-close PUT used
`If-Match: "5c64a8b0-2db5-4f4f-a86e-c791fd7f13a4:2"`, auth present and raw
HTML, returned 201 and preserved the complete edit. A new room then saved its
own edit using `"5c64a8b0-2db5-4f4f-a86e-c791fd7f13a4:3"`, retaining the prior
edit. The combined two-tab/image/reload/History snapshot and restore/Browse
trash and copy case, independent Browse case, and alias API case all passed.
The real delayed PUTs for mixed-case aliases used
`"b544f5bb-edce-41f1-860c-2ff59a032122:2"` and
`"c5b26876-90fd-4077-a81a-cdbc21b49793:2"`, returned 412, and closed the
Canvas socket 4412 before each real held notification was forwarded once.
The newer external bytes survived both directions. Browser traces recorded no
blocked external requests or page errors. The pre-existing legacy unflushed-close
diagnostic remains red and is not represented as a passing H6 case.

Run the unchanged old-branch suites separately, after the feature changes, rather
than counting an earlier baseline as a post-feature regression. Run these serially,
after the three working trees have stopped changing. The old runner copies da-rs
to its own scratch directory, but its product modules and Worker come from the
live da-live/da-collab trees; unlike the H6 runner it does **not** snapshot all
three. Record non-secret fingerprints before and after the serial runs:

```sh
node test/e2e/helix6-local/tree-fingerprint.cjs
```

The fingerprint covers HEAD, tracked working-tree changes and non-ignored
untracked files. It deliberately excludes `test/e2e/helix6-local/` and local
`.env*` / `.dev.vars*` files; it is a drift check for these compatibility runs,
not an exhaustive attestation of the machine. Any changed fingerprint requires
investigation and a rerun on frozen inputs. Record HEAD and status as well:

```sh
git -C /Users/jelmini/git/da/da-rs rev-parse HEAD
git -C /Users/jelmini/git/da/da-rs status --short --branch
git -C /Users/jelmini/git/da/da-live rev-parse HEAD
git -C /Users/jelmini/git/da/da-live status --short --branch
git -C /Users/jelmini/git/da/da-collab rev-parse HEAD
git -C /Users/jelmini/git/da/da-collab status --short --branch
```

Clear an inherited case filter so the product command covers every case:

```sh
env -u POC_MODE -u POC_CASE POC_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/branching-local/run.cjs
env -u POC_CASE POC_MODE=collab POC_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/branching-local/run.cjs
env -u POC_CASE POC_MODE=product POC_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/branching-local/run.cjs
```

These are legacy compatibility tests, not evidence for H6 CORS or authenticated
Canvas: the old runner disables da-rs security, and its product shell rewrites
Source responses' CORS headers and substitutes NX discovery. Preserve each run's
scratch ID, selected mode, complete result, and any failures; do not silently
count a filtered product case or the earlier baseline as a full regression run.

Provisional post-feature runs passed: Source/components `5/5` in
`branching-i2-KgHPXY`, old Worker/room `2/2` in `branching-i2-7lWzxD`, and all
old product-route cases `5/5` in `branching-i2-meZ1F0`. The latter recorded
blocked spreadsheet-logo and AEM config attempts in legacy fixture scenarios.
The live da-live working-tree status changed during the compatibility window, so
these are not frozen-tree final receipts; rerun after the browser lane is frozen.

Frozen-tree reruns, executed serially after the product lanes stopped, passed:

| Mode | Scratch | Result |
| --- | --- | --- |
| Source/components | `branching-i2-nzkWMI` | 5/5 passed |
| Old Worker/room | `branching-i2-r6wryw` | 2/2 passed |
| Old product routes | `branching-i2-ufcwXX` | 5/5 passed |

The fingerprint tool produced the same hashes before and after the first two
runs and after the third: da-rs
`0707d6d6f7f43deee5976b0d25164a9b2f838f29dd5e4e2a04769da5fe76ab0e`, da-live
`610d5b77097f6049144c9370e65f7711451a5bd46eca7678007c41f39b360743`, and
da-collab `f7f7e5ee0c01715c0384599bd71f606db9c3eb6c08b2036f959d62843373c6b6`.
The old product fixture answered a sidekick request locally and blocked the
spreadsheet-logo and legacy-control AEM-config attempts; it did not send them
out and is not an authenticated H6/CORS receipt.

## Isolation and substitutions

The runner allocates new loopback ports for the UI, da-rs, Wrangler, Wrangler's
inspector, and the Source gate. It checks each Source listener and Wrangler
process ancestry, only terminates children it started, retains scratch logs and
state, and refuses arbitrary endpoints or stores. The browser route guard performs
the same PID, parent, command, port and loopback
checks asynchronously, coalescing only checks concurrently in progress and never
caching a completed result. The guard records check counts, joined requests,
maximum concurrent waiters and capability wait times. B5 case traces also record
sanitized per-tab requests, responses, request failures and readiness; the paste
trace records the actual target and status. No capability response is simulated
and the product discovery deadline is unchanged. API calls still verify the
dedicated runner and use its synthetic bearer; gate controls verify the runner
and use their per-run nonce.
The Worker is real Wrangler; both `daadmin` and `dars` are explicit local service bindings to a fixed-origin,
allowlisted transport bridge. They have separate Worker service bindings.
`DA_RS_ORIGIN` is exactly the per-run Source
origin. The bridge and gate forward real Source responses and never synthesize
CORS. The gate can delay only a named collab PUT; its local control uses a
per-run nonce, and its status contains the conditional validator and response
status, not authorization. A second loopback gate forwards genuine, shared-secret
authenticated notifications to the real Worker. In the race case it holds one
named canonical `syncadmin` request until the real delayed PUT returns 412 and the
Canvas socket closes 4412; it then forwards that unchanged request. This separates
the 412-driven close from notification-driven invalidation. The server notification
sender has a short timeout, so a retry or timeout is a test failure, not evidence
of exactly-once delivery. A separate nonce-protected control restarts only the
runner-owned da-rs once so the marked Oak can be reopened. da-rs notifications
and the Worker share an ephemeral secret stored in the private scratch directory.

The notification gate has a harness-only check with a local sink, not a real
Worker or Source and not acceptance evidence:

```sh
NO_PROXY='*' node --test test/e2e/helix6-local/notification-gate.test.cjs
```

The synthetic author's `/work/+**` write grant covers both the original document
and its `.trash` location. H5's retained-version checks are positive authorized
cases only; they do not prove denial when the original path is unreadable. The
server's dedicated trash/origin ACL tests and their independent review own that
negative case unless a separate browser case is added.

The UI is a minimal local route shell that imports the actual route modules. It
uses the checked-in NX/NX2 fixtures plus local menu, dialog, panel, identity and
style shims, not real hosted NX or IMS. The local NX Workspace flag is enabled
to make browse select Canvas independently of Source mode; the marked site's
real local configuration also sets `ew.enabled=true` for the bound provider.
The NX panel shim mounts the real registered DA tool panel and versions UI.
The import map also names the checked-in `hast-stub.js` for the parser's
non-browser module-resolution branch; that stub throws if called. The browser
uses the real bundled parser with DOMParser, and success requires no page errors.
An ephemeral synthetic identity token is
installed in da-rs's local identity provider and exposed through the browser's
test IMS shim; the org config grants the synthetic email `CONFIG` and explicit
`/work/+**` write rights. The runner patches only the **served test environment
configuration** for the selected ephemeral DA and collab origins and token
allowlist. Browser requests outside the UI and Source origins are blocked, and
WebSockets are restricted to the owned Worker; recorded request paths omit
headers, query strings and token values. The test does not use a real Adobe
identity, Stage, Prod, or hosted Source. Real Source CORS headers must permit
the UI origin; Playwright never injects them.

Scratch files and the running test process contain a synthetic token; treat the
scratch directory as private. This local identity provider is not real IMS and
does not validate expiry or revocation. A route shell, locally patched provider
constants or a passing legacy route are not proof of the complete hosted app.

Run the full live suite only on the completed working trees. The coordinator
reported H2's 410-test suite and re-review, H3's final serial WTR `4453/4`, and
H4's independently rerun 338 tests plus lint and follow-up review. Those are
separate lane receipts, not checks run by this harness. Codelore was not
available in this session, so no Codelore safeguard is claimed. The coordinator
owns the combined acceptance verdict.
