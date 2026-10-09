# Block sidebar extension implementation plan

## Goal and scope

Move the block sidebar on the `blocktab` branch out of the core canvas product
and into a configured iframe extension. Preserve its current behavior while
keeping ProseMirror, editor transactions, collaboration, permissions, and
document persistence owned by the host.

The extension receives the full live, instrumented page HTML and submits
targeted JSON operations using the existing instrumentation indexes. Do not
introduce `data-da-target`, expose editor objects, or write the whole document
through a source API as a substitute for live editing.

This document is a proposed design, not a description of available SDK APIs.
Implementation spans da-nx's SDK, da-live's canvas host, and the extension.
Legacy edit and sheet hosts must explicitly report unsupported capabilities;
implementing equivalent editing APIs in those hosts is outside the first release.

**Review status:** Claude Opus 5.5 assessed this as feasible with changes, not
implementation-ready. The review below identifies blocking serialization and
field-model assumptions. Resolve those before implementing the proposed contract.

## Existing implementation and constraints

| Surface | Current evidence | Consequence |
| --- | --- | --- |
| SDK | da-nx `nx/utils/sdk.js:5-53`, `74-84` exposes insertion, selected HTML, authenticated fetch, navigation, panels, and prompts. | Add subscriptions and acknowledged targeted writes; existing insertion methods are not sufficient. |
| Iframe bridge | `blocks/canvas/ew-panel-extensions/iframe-protocol.js:18-122` initializes a MessageChannel and dispatches SDK actions. | Extend this boundary rather than inventing another iframe protocol. |
| HTML serialization | `blocks/canvas/editor-utils/editor-utils.js:240-325` produces AEM-shaped HTML with `data-prose-index`, `data-block-index`, and `data-image-index`. | Reuse the existing attribute names and position values. They are snapshot addresses, not stable IDs. |
| Change detection | `blocks/canvas/editor-utils/extensions-bridge.js:11-21` emits `canvasBus.editorDocState`; `blocks/canvas/ew-editor-doc/ew-editor-doc.js:110-114` emits instrumented HTML. | Host-local coordination must use canvasBus. Subscriptions must cover all document transactions, not just existing preview refreshes. |
| Selection | `blocks/canvas/editor-utils/blocks.js:59-74` finds an enclosing block even for a collapsed cursor. | HTML changes alone cannot identify the active block. Include a separate selection signal. |
| Sidebar | `blocks/canvas/ew-block-properties/ew-block-properties.js:282-351`, `575-623`, `736-965`. | Move library/schema interpretation and form state to the extension; replace editor access with SDK calls. |
| Extension registration | `blocks/canvas/ew-panel-extensions/helpers.js:253-274`, `575-585`, `669-683`. | Register the extension through configuration; remove the hard-coded native Block view only after parity is achieved. |

Numeric indexes can shift after any edit, including a collaborator's edit.
`view.posAtDOM(element, 0)` can point to an element's content rather than its
node boundary. The host must resolve each instrumentation kind using a
snapshot-generated registry, not blindly call `doc.nodeAt(index)`.

The existing HTML is not a lossless editor tree. Block tables become divs,
their header becomes block classes, and only outermost editable elements are
instrumented (`blocks/canvas/editor-utils/editor-utils.js:187-204`). Rows, cells, links, list-item text, and
nested blockquote text cannot be assumed to have their own indexes.

## Ownership

**Extension:** UI, field definitions and validation messages, library and option
loading, variant choices, repeating-item previews and drag state, chat prompts,
and selection of the intended operation.

**Host:** authoritative editor state, snapshot serialization and addressing,
permission checks, schema validation, HTML-to-editor translation, transactions,
selection mapping, undo grouping, collaboration, image upload integration, and
opening existing host-owned dialogs where needed.

Use canvasBus inside the canvas. Keep shared panel/chat operations on da-nx's
PANEL_EVENT/CHAT_EVENT boundary and quick-edit host/iframe operations on the
existing MESSAGE_TYPES boundary. SDK traffic uses the extension MessageChannel;
do not forward internal canvasBus objects or editor positions as executable APIs.

## Proposed SDK contract

API names below are provisional. SDK initialization advertises a versioned
`editor` capability so extensions can distinguish a supported canvas host from
older hosts instead of waiting indefinitely.

```js
const { actions, capabilities } = await DA_SDK;

const unsubscribe = await actions.subscribeDocument((snapshot) => {
  // Replace the extension's authoritative page snapshot.
});

const unsubscribeSelection = await actions.subscribeSelection((selection) => {
  // Follow the active block without requiring a content edit.
});

await actions.applyChanges({
  documentId: snapshot.documentId,
  revision: snapshot.revision,
  changes: [{
    type: 'setText',
    target: { attribute: 'data-prose-index', index: 5 },
    value: 'Updated title',
  }],
});
```

A document snapshot contains `{ documentId, revision, html, editable }`.
`html` is the full live instrumented body representation, including sections,
blocks, and metadata, not a rendered preview or stored-source fetch. Do not
include an IMS token in change broadcasts.

`documentId` is a fresh identity for each editor session, including reloads of
the same URL. `revision` increases on every document change, including remote
edits and undo/redo. Neither is an authentication token.

A selection message contains the document identity and revision, the enclosing
block's instrumentation target or null, and an optional addressed item. Emit
selection changes even when HTML is unchanged; resolve both source-editor and
quick-edit selections through the host's existing selection coordination.
Opening the extension must immediately deliver current content and selection.

### Subscription lifecycle

1. Install the document observer at editor initialization, independently of
   whether an extension is subscribed. Increment the revision synchronously
   with document changes.
2. Serialize after the transaction is applied, publishing the HTML and target
   registry from the same editor state. Do not attach a new revision to HTML
   cached from a previous state.
3. Each subscription receives an initial snapshot followed by a full snapshot
   for every document-changing transaction. Selection-only transactions do not
   require another HTML serialization.
4. Share serialization between subscribers for a revision. Do not reuse the
   preview's `suppressRerender` gate to suppress SDK updates.
5. Report editor-unavailable/read-only transitions explicitly. On navigation,
   invalidate the old document session before publishing the new one.
6. Unsubscribe and channel teardown remove listeners and pending requests.
   Define event ordering so snapshots and selection cannot be confused across
   document sessions.

The baseline promise is every document change, not debounced latest-state
delivery. Measure large-page costs before release; any future coalescing must
be an explicit contract change or opt-in.

### Request/response transport

Use request IDs, explicit success/error replies on the MessageChannel, and
bounded request timeouts. Add routing for subscription events, correlated
responses, unsubscribe, and channel disposal in `nx/utils/sdk.js`.

Do not copy `getSelection()`'s one-shot window-message listener for these APIs:
new concurrent requests need correlation, and host errors already travel over
the port. Preserve the existing SDK methods for backward compatibility.
Unknown actions and unsupported hosts must return a structured error.

## Addressing and targeted writes

### Snapshot-scoped targets

The base target is `{ attribute, index }`, where `attribute` is an allowlisted
existing instrumentation name. Validate safe integers and require an exact
entry issued by the host for the current snapshot. An extension cannot submit
an arbitrary numeric editor offset or choose arbitrary document selectors.

During serialization, retain host-only mappings from emitted targets to their
source nodes, bounds, types, and supported operations. Check uniqueness in the
serialized output: shared positions across attribute kinds are not the same
target. No registry data is persisted in source HTML.

For uninstrumented descendants, propose an optional `path` of element-child
indexes relative to an instrumented ancestor in the delivered HTML. The host
must create/validate the connecting mapping while serializing; it must not
equate an AEM div path with a ProseMirror child path. Paths identify only
supported source-backed descendants in the exact snapshot.

Prove that this mapping survives block conversion, picture wrappers, list
wrappers, cell spans, and serializer normalization before making it public.
If that proof fails, keep descendants unsupported until the serializer can
provide the mapping without adding a new data attribute. Do not silently
replace a larger ancestor as a fallback for a requested field edit.

### Operation semantics

| Proposed operation | Required behavior |
| --- | --- |
| `setText` | Change one source-backed text field or list-item text. Preserve the current supported marks; reject mixed/unsupported rich content rather than flatten it. |
| `setAttribute` | Initially allow image source and link href through explicit host handlers. Preserve other attributes and validate URLs using repository rules. Never write arbitrary DOM attributes. |
| `replaceElement` | Parse allowed HTML and replace the exact source-backed element. Block divs require the existing AEM-block-to-table conversion, not direct schema parsing of the div wrapper. |
| `insertElement`, `removeElement`, `moveElement` | Initially support repeating block rows and list items within their existing parent. Use validated source-node operations, retain header/cell structure, and preserve the list's minimum one-item rule. Define destination anchors rather than indexes whose meaning changes midway through a batch. |
| `setBlockVariant` | Update the table header through the existing host helper. The source header is not present as an editable field in serialized block HTML. This semantic command avoids requiring the extension to know the internal table representation. |

The extension must use the smallest supported target; do not replace the whole
page or whole block for every field edit. Preserve unchanged editor nodes.
One explicit variant command is justified by the serialization boundary; do
not move field definitions or the sidebar UI back into core.

### Validation and concurrency

1. Require the active document session, exact current revision, editable
   state, and a supported target/operation.
2. Resolve all targets against the request's base snapshot before changes.
   Reject duplicates or overlapping/conflicting edits unless their semantics
   are explicitly defined.
3. Build one host transaction, mapping later operations through earlier steps.
   Validate the complete candidate before dispatch; a failure applies nothing.
4. Map the existing selection through the transaction; do not use the current
   selection as the write target or steal focus from the extension.
5. Dispatch once through the existing editor path. Verify local undo grouping,
   collaboration visibility, and quick-edit refresh rather than assuming that
   one transaction alone guarantees them.
6. Acknowledge with the document ID and resulting revision; publish the
   authoritative snapshot. Request IDs associate acknowledgements with pending
   UI, not with an assumed selection.

Structured failures include unsupported capability, unavailable editor,
wrong document, stale revision, read-only, invalid target, unsupported content,
invalid operation, and malformed payload. Apply sensible payload/batch limits
and never silently reinterpret or drop an invalid operation.

The first release rejects stale revisions even when the intervening edit was
elsewhere. Preserve the user's draft and explain the conflict; do not blindly
retry with a new revision/index. The extension should serialize writes and
avoid rebuilding an actively edited input on every incoming snapshot.
Target-specific conflict detection and host-internal relative anchors are
possible future work, not prerequisites or promises of this design.

## Functional parity checklist

| Current sidebar behavior | Extension implementation and host dependency |
| --- | --- |
| Follow enclosing selected block; empty/read-only states | Document and selection subscriptions plus editable state. Preserve no-selection behavior and react to permission changes. |
| Field schema and options | Move template matching, fields metadata parsing, IGNORE handling, structural mismatch errors, dropdowns, and multiline/read-only rules to extension-owned code. Remove ProseMirror schema dependencies from that code rather than importing da-live internals. |
| Text and link edits | `setText` and link attribute updates; preserve existing supported marks and reject unsupported rich content. |
| Lists | Address nested item text, add/delete/reorder with keyboard and drag interactions; retain at least one item. |
| Variants | Load library choices in the extension and submit `setBlockVariant`; preserve unknown variants and the no-variant option. |
| Repeating blocks | Resolve the library's authoritative multi setting, use the correct variant template row, and add/delete/reorder source rows. Preserve expansion state and clear stale drag targets. |
| Item navigation | Add an acknowledged select/reveal action using the same snapshot target, translated into existing host selection/reveal mechanisms without exposing editor objects. |
| Replace block | Extension-owned library UI plus `replaceElement`, or a scoped request to the existing host library modal. Plain `showPanel('blocks')` is insufficient because its current callback inserts rather than replaces. |
| Image upload | Add a scoped upload action accepting a structured-clone File and target. Host reuses source/upload context and existing size/type validation. Separate upload from the synchronous edit batch and revalidate the target/revision before replacement; preserve the original image on failure. |
| AEM Assets | Add a scoped picker request with completion/cancellation. Reuse the existing host-owned selector but replace its view/selection callback with a validated explicit image target. |
| Generate/repair fields | Use existing `setPrompt(text, { autoSend: true })`; keep the branch's library/variant-specific prompt and validation context. |
| Refresh library | Invalidate extension-owned caches and reload variants, multi settings, fields, and options without editing the current page. |

Image upload/asset selection can outlive their snapshot. Under strict revisions,
an intervening edit causes an explicit conflict even after upload succeeds.
Document that a successful media upload can leave an unused asset if replacement
is rejected; do not silently retarget it to the current image.

## Implementation sequence

1. **Specify and prove addressing.** Add serializer/resolver tests for the
   real sidebar fixtures, especially uninstrumented nested fields, block
   headers, repeated rows, pictures, spans, and lists. Finalize the supported
   target/path contract before building the extension.
2. **Implement snapshot and selection subscriptions.** Add capability
   negotiation and correlated transport in da-nx; wire editor lifecycle and
   canvasBus state in da-live. Confirm local/remote updates and teardown.
3. **Implement the host edit adapter.** Add validation, atomic transactions,
   error replies, select/reveal, and the five operation families above. Reuse
   existing block/variant/list helpers where compatible; refactor helpers that
   implicitly target the current selection to accept explicit validated targets.
4. **Bridge media and replacement dialogs.** Scope image upload, asset
   selection, and optional block-library requests to the same document/revision.
   Keep async dialog/upload completion out of synchronous edit batches.
5. **Build the extension.** Port styles, controls, schema/library interpretation,
   prompts, previews, drafts/conflict UI, and caches. Use SDK data only: no
   getExtensionsBridge(), canvasBus subscription, parent DOM access, or
   ProseMirror imports from extension code.
6. **Run both implementations for parity evaluation.** Make the extension
   explicitly configurable and avoid duplicate Block views for participating
   sites. Gate the migration while keeping the native view available.
7. **Remove the native sidebar after acceptance.** Remove its dedicated
   registration/component and sidebar-only state wiring. Retain helpers and
   toolbar behaviors still used by the product; do not equate UI extraction
   with deleting every block-related core change on this branch.
8. **Document and release both repositories.** Publish the SDK action/event
   contract and supported-host matrix in da-nx. Document extension registration,
   capability failures, concurrency UX, and rollback in da-live. Deploy the host
   capability before requiring it from the extension.

The extension's hosting repository/location is not selected by this plan.
That choice does not change the SDK boundary or acceptance criteria.

## Verification and acceptance

- SDK tests: initialization/capabilities, concurrent request correlation,
  success/error routing, subscribe/unsubscribe, timeouts, teardown, and old-host
  failure without breaking existing actions.
- Host subscription tests: initial full snapshot, every local and remote
  document change, undo/redo, selection-only changes, read-only transitions,
  preview suppression, navigation/reload, and multiple subscribers.
- Target/adapter tests: content-start versus node-start indexes, reused indexes
  in a new revision/session, malformed/forged targets, unsupported descendants,
  normalized block/picture/list mappings, mark preservation, attribute
  allowlists, malformed HTML, schema errors, conflicting batches, and atomicity.
- Behavioral tests: all parity rows above, unrelated-node preservation,
  selection/focus behavior, undo/redo, collaborator visibility, and quick-edit
  refresh. Test delayed uploads/picker completion after content/permission/page
  changes, plus cancellation and unused-upload handling.
- Extension tests: draft preservation, deterministic pending-write ordering,
  stale errors without auto-retargeting, loading/schema errors, cache refresh,
  missing capabilities, and actual iframe operation rather than native-element
  tests alone.
- Performance: measure full-page serialization and delivery during sustained
  typing on representative large pages with multiple subscribers. Share work
  per revision; do not silently weaken the every-change guarantee.

Use each repository's existing browser test runner and lint tooling. In
da-live, run selected test files with the existing wtr configuration, starting
with iframe-protocol, editor-utils, block-fields/items/variants, and migrated
sidebar cases; add iframe end-to-end coverage for the resulting extension.
Run broader suites only when targeted results or cross-surface changes require it.

Acceptance requires all existing sidebar functionality to operate in a real
configured extension without importing editor internals, changing persistence
semantics, or losing collaboration/undo behavior. A prototype limited to
selection insertion or whole-block replacement does not satisfy the goal.

## Feasibility review

### Local prototype status

The prototype now exists on local da-live/da-nx `main` and ew-extensions
`blockext`, with the extension at `tools/block-editor/block-editor.html`.
Start `node tools/sdk-block-editor/server.mjs` from da-live and open
`http://localhost:3001/tools/sdk-block-editor/`. See the adjacent README for
real-canvas configuration and the boundaries of the fixture editor.

Following the clarified scope, the prototype accepts the existing instrumented
AEM preview serialization rather than introducing a lossless ProseMirror export.
It accompanies that HTML with source-backed plain block/field descriptions,
typed sub-targets under existing block indexes, source URL values, preview image
URLs, and transient row keys for UI expansion state. No new DOM target attribute
is introduced. The SDK streams combined document/selection snapshots; selection
updates retain the current revision. Global revision rejection remains explicit.

The review below is historical design feedback, not a claim that these concerns
have been fully validated. Authenticated media, collaboration/undo, dialogs,
cross-origin preview access, and real-canvas behavior still need manual validation.

Claude Opus 5.5 independently reviewed this plan and da-live/da-nx source on
2026-10-09. The review was read-only; no implementation or tests were run.
Verdict: **feasible with changes**. Existing indexes can remain the public base
addresses, but the current preview serializer and field-resolution code cannot
be reused unchanged. The following feedback qualifies the proposed design above.

### Blocking assumptions

1. **The current instrumented HTML is a lossy preview, not a faithful document
   snapshot.** `getInstrumentedHTML()` enables preview serialization
   (`blocks/canvas/editor-utils/editor-utils.js:320`). The reviewer found removal/transformation
   of page and section metadata, icon text, URLs, block headers, cell spans, and
   list wrappers in `blocks/shared/prose2aem.js:162-168`, `197-263`, `309-335`.
   It also carries remote-cursor decoration. Required correction: implement an
   SDK-specific source-faithful serialization mode or carry authoritative source
   values/structure alongside the presentation HTML. Retain existing index
   attribute names. Do not write back values inferred from rewritten preview
   URLs or text. Snapshot completeness/normalization tests gate the contract.
2. **Moving the field model is not just moving its UI.** Template matching,
   field classification, read-only detection, marks, and list resolution use
   ProseMirror nodes and schema parsing
   (`blocks/canvas/editor-utils/block-fields.js:7-74`, `140-191`).
   Required correction: choose between a tested editor-independent field model
   and host-generated source-backed JSON for blocks/rows/cells/fields, optionally
   with a library-fragment normalization action. Extension ownership of labels,
   IGNORE, options, prompts, and controls remains unchanged. Do not import
   ProseMirror into the extension to close this gap.

### Necessary refinements

| Area | Reviewer feedback and required follow-up |
| --- | --- |
| Nested targets | Prefer typed host-issued sub-addresses in a JSON sidecar over public DOM element paths. Outermost cell paragraphs already have indexes; list/blockquote descendants and rows need explicit mappings. Prove indexes' content-start versus node-start semantics before choosing the public target shape. |
| Operations | Define `setText` using the existing supported mark/read-only rules. Prefer a semantic `setLink` on a text field over arbitrary writes to an anchor. Keep image writes on scoped host media handlers. Explicitly define list-node reconstruction and its minimum-item invariant. |
| Block replacement | Accept original library table HTML or use the scoped host dialog. Reconstructing an original table from preview block divs loses source header/span information (`blocks/canvas/ew-panel-extensions/helpers.js:25-64`). Row insertion should use the library row template, as the current sidebar does. |
| Concurrency | Strict global revisions reject unrelated collaborator edits and successful delayed uploads. This is more conservative than today's node-identity guard (`blocks/canvas/ew-block-properties/ew-block-properties.js:766-772`; `blocks/canvas/ew-editor-doc/prose-plugins/imageDrop.js:18-25`). Prototype normal typing/upload workflows before accepting this UX. |
| Focus and selection | Current row/variant helpers select the block and sometimes focus the editor. Define which existing behaviors to preserve and which are intentional changes; refactor selection-dependent helpers to accept explicit targets. |
| Expansion/drag state | Current expanded-item preservation depends on ProseMirror row identity (`blocks/canvas/ew-block-properties/ew-block-properties.js:298-310`). Pure snapshot indexes do not supply equivalent identity. Decide whether a host-side row identity sidecar is necessary; do not claim parity until reorder/remote-edit tests pass. |
| Transport | Add the SDK's port listener, correlation, and lifecycle errors. Put capabilities in initialization: old hosts ignore unknown messages. Consider an explicit iframe hello/ready handshake instead of relying only on the current 750 ms timer. |
| Selection bridging | Existing quick-edit selection handlers already update the host editor for supported node selections; derive subscription state there instead of inventing a second selection mechanism. Verify collapsed-caret behavior separately. |
| Asset picker | The native sidebar currently owns its picker container. An extension needs a host dialog/container and explicit completion/cancellation, not just reuse of the native sidebar DOM callback. |
| Placement | Configuration normally places third-party views under Extensions. Define a gated replacement slot/site setting for the native `block` view, accounting for plugin allowlisting/title deduplication. |
| Read-only transitions | Detect permission/editability changes independently of document-changing transactions. |
| Undo and session longevity | Verify Yjs undo capture boundaries and token refresh during long-lived extension sessions. |

### Suggestions that are not yet accepted contract changes

The reviewer recommended target-specific preconditions with host-internal
anchors instead of strict global revision rejection, and latest-state/coalesced
HTML delivery instead of every-change delivery. Both are tradeoffs, not automatic
changes to the agreed direction.

The plan retains the requested full-HTML-on-every-change behavior unless that
requirement is explicitly changed. Optimize shared serialization first.
Strict revision rejection remains the baseline safety rule; adopting mapped
targets/expected-value checks requires evidence that remote updates preserve
resolvable anchors and a precise conflict contract. Do not silently rebase
extension writes.

### Additional acceptance tests and unresolved evidence

Add source-vs-preview serializer fixtures for metadata, icons, URLs, and spans;
field-model parity fixtures; collaborator typing during a blur commit; upload
completion after an unrelated edit; capability-less old-host initialization;
missed initialization messages; original library table/row replacements; and
selection/focus outcomes after row/variant edits.

The reviewer did not verify da-y-wrapper's remote update/anchor behavior,
cross-origin image preview access, whether panel switching retains the iframe,
the producer of editability changes, or legacy/sheet host protocols. These are
explicit investigation/prototype tasks, not proven absences. The current
quick-edit collapsed-caret path also needs a parity check.

**Implementation gate:** finalize source-faithful snapshots and the field/
sub-target representation first. Then validate concurrency UX, transport
lifecycle, and feature parity before removing the native sidebar.
