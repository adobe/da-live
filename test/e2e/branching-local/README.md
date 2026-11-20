# Isolated branching checks (partial WP-I2)

This separate Playwright config never imports the shared setup/teardown, IMS
state, or Stage/Prod sweepers. It tests a **partial** integration, not the PoC
demo: `source.local.spec.cjs` talks to a real local da-rs; the component spec
mounts the real da-live selector, Changes, conflicts, and Site History in a
small test shell against that same da-rs. The shell serves local product modules
through Playwright, supplies only two NX provider-identity exports, and blocks
all other network requests and WebSockets. The UI test edits Source directly,
not through the editor, sheet, config, or media UI. It is not a full app test.

The default run uses an owned loopback HTTP notification sink returning 503;
it does not test collaboration. An optional **separate** collab run starts the
real da-collab Worker with a new local Durable Object store and a local-only
Source bridge. It mounts the actual legacy editor connection in a tiny shell,
rewrites only its logical `ws://localhost:4711` transport to the owned Worker,
and retains logical `http://localhost:8787` room names for notifications. The
legacy provider performs a real browser reload of the tiny test shell; the test
reconnects a new provider explicitly, not the full editor UI. The default
component suite uses direct Source uploads; the separate product-route suite
uses the actual browse media picker. No AEM delivery is tested. The control
site's empty selector is checked after an actual `supported:false` response,
not after a capability error.

## Run

Requires Java 25, offline Maven dependencies for da-rs, `rsync`, `lsof`, Node,
installed Google Chrome and the pinned Playwright dependencies:

```sh
cd /Users/jelmini/git/da/da-live/test/e2e
npm ci --ignore-scripts --no-audit --no-fund
cd /Users/jelmini/git/da/da-live
POC_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/branching-local/run.cjs
```

For the separate real Worker/room test, with da-collab's existing Wrangler
dependencies installed, use:

```sh
POC_MODE=collab POC_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/branching-local/run.cjs
```

Wrangler runs only locally with a scratch HOME, no credentials, a freshly
generated bridge, loopback listeners and a new DO state directory. The bridge
forwards only Source HEAD/GET/PUT from the fixed logical localhost origin to
the new da-rs port. No Source or collab functionality is mocked. Listener PID
ancestry and loopback addresses are checked before the fixture is seeded; the
runner stops only its own process groups. `collab.log` records bridge requests
and literal conditional headers. Network routes block all other browser
destinations. No Stage/Prod setup is involved. `late-gate.cjs` is a loopback
transport gate: only the named `poclate` collab PUT can be held, and the
released request is forwarded to real da-rs with its method, body and
conditional headers preserved; Host and transport headers are normalized. Its
local-only control uses a per-run random nonce; it does not fabricate a Source
response.

`product.local.spec.cjs` additionally loads the real da-live browse, legacy
editor and sheet blocks in a local route shell. It uses the checked-in WTR NX2
client fixture with its DA origin rewritten to the owned da-rs, and small
test-only NX menu/dialog/IMS/provider-discovery shims. The Source and collab
operations are real. NX icons and NX style files missing from the WTR fixtures
are reported in the test log; no Stage/Prod asset is loaded. Branch-side
sidekick configuration GETs are answered by a local empty JSON fixture. This is
not the complete AEM-hosted DA shell, and a real IMS session is not exercised.

For product-route tests, use `POC_MODE=product`; optionally set `POC_CASE` to
`browse`, `switch`, `mixed`, `control`, or `history` for one scenario. The
`POC_MODE=collab` run contains the room tests only. These configs are separate
so product failures do not mask the existing collaboration regressions:

```sh
POC_MODE=product POC_SCRATCH_ROOT=/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode node test/e2e/branching-local/run.cjs
```

## Verification receipt — 2026-11-20

After the branch-navigation and media-picker fixes, the three commands above
passed against fresh private stores: **5 Source/component, 2 Worker, and 5
product-route tests**. The product run includes an explicit check for no
preview/live/snapshot delivery requests during branch editing, deletion and
publish. The Worker run holds a real persist with its literal Source ETag,
completes sync and room invalidation, then releases it and observes da-rs `412`.

Retained scratch evidence:

- Source/component: `/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode/branching-i2-770zTF/da-rs.log`
- Worker: `/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode/branching-i2-cNr2fp/collab.log`
- Product routes: `/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode/branching-i2-6b778y/`

The product fixture blocked the spreadsheet logo GET
`http://bossanova.uk/jspreadsheet/logo.png` and the non-enabled control's GET
`https://api.aem.live/poccompat/sites/control/config.json`; the tests do not
exercise those external resources. Missing NX fixture CSS and icons are logged.
`npm run lint`, JS syntax checks and tracked/untracked whitespace checks passed;
the full WTR suite was not rerun for this receipt.

The runner checks all three branches, makes a unique private scratch directory,
copies current da-rs source without its `.git`, target, data or env files,
builds the copy with offline Maven, creates a new Oak/blob store, binds da-rs
and its notification sink to numeric IPv4 loopback on ephemeral ports, and
stops its own processes. It retains the scratch directory and prints the log
and results paths. It refuses to write fixtures without checking the listening
PID, loopback address, security flag and exact new store path. It does not
reuse the I1 seed script, which is hard-wired to port 8787. It never uses an
real IMS token. Reruns require new scratch/store and do not delete any old data.

Each test checks its target does not exist before seeding. The API fixture uses
`If-None-Match: *` for seed writes and reads back content before enablement;
no editors or rooms have been opened. Do not delete/reuse branch IDs without
draining editors and pending persistence. Cross-folder transfers do not move
sibling assets; long offline use is outside the PoC.

Optional full unit test validation without WTR's wildcard-bound listener,
after confirming port 2000 is free (`lsof -nP -iTCP:2000 -sTCP:LISTEN`):

```sh
NODE_OPTIONS="--require=$PWD/test/e2e/branching-local/wtr-loopback.cjs" npm test -- --concurrency 1
```

The preload forces only port 2000 to IPv4 loopback while preserving WTR's
`localhost` browser origin; verify the listener with `lsof` before continuing.
The existing unit suite can log attempts to access external test resources; this
preload does not constrain browser egress. Do not substitute `npm run test:e2e`.

Remaining work for WP-I2/I3 includes the complete AEM-hosted DA shell and real
IMS/auth integration, which are intentionally not used by this local fixture.
The mixed-kind product test opens a separate Default browse tab for History;
open-editor 4412 reloads are covered separately at the real legacy provider
boundary, not in that same mixed-kind UI flow. Media delivery/display and
long-offline behavior are not tested. Do not call this the AEM-hosted demo.
