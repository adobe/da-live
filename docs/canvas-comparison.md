# Native canvas comparison

The canvas comparison is a read-only, non-modal surface over the editor mount. The current editor stays mounted (temporarily inert), and the right-hand panel remains visible and interactive. `ew-comparison` owns the comparison renderer; version history imports it. Both use the shared HTML diff builder. The existing version-history modal is unchanged unless `embedded` is explicitly set.

## Inputs

- Opening a `document` or `preview` comparison first awaits the host's save of the matching loaded editor. If it reports `not-writable`, comparison opens without saving so read-only reviewers can compare. Other returned or rejected save failures remain visible errors and prevent document serialization and delivery reads.
- `document` versus `live`: after the save attempt, serialize the matching loaded editor (including edits received while saving), read live Markdown through the shared NX API, normalize both into document HTML, then compare.
- `preview` versus `live`: after the save attempt, read both existing delivered Markdown resources through the shared NX API. Opening a comparison does not refresh preview or publish; unsaved-to-preview source edits are not included in the staged comparison.
- `proposal` versus `source` (internal chat host only): read both `/<org>/<site>/.da/<path>.html` and the original `/<org>/<site>/<path>.html` from authenticated DA source. Never save or serialize the current editor or read live delivery. Both paths must belong to the current site; another page in that site can be compared without navigation. The diff labels are Current content and Proposed changes. Unsaved editor-only changes are not included. Missing source files are errors, not empty baselines.
- Live 404 is the never-published empty baseline; other failures remain visible errors.
- Executable markup, non-content/custom elements and unsafe URL schemes are removed before rendering. Relative URLs are resolved against the page's delivery origin. Content links open separately rather than navigating the EW host.

## Host actions

`canvasBus.comparisonRequest` connects the in-process host to the existing plugin iframe protocol. Plugin `openComparison` and `closeComparison` are fire-and-forget commands; save, loading and delivery errors appear in the host comparison surface. Plugin comparison candidates are limited to `document` and `preview`, with `live` as baseline. The host supplies the page context; plugin-supplied paths, URLs and HTML are not used. There is no capability negotiation; deploy the supporting host before its SDK and consumers.

`saveDocument` remains a separate, acknowledged action that confirms the matching writable editor's collaboration flush, including for submission flows that do not open comparison. Document/preview comparison-open uses the same host save callback internally; proposal comparison never does. During navigation, a route/editor identity mismatch rejects reads and flushes. Requests from an old iframe context are rejected rather than applied to a new page.

## Chat proposal actions

Canvas mounts chat with `onArtifactAction` and an `artifactActionNames` allowlist
containing only `editor.viewDiff`. The callback receives the action and its
owning artifact. The host resolves only
`context.proposedPath: { path: "/proposals/<id>" }`, where `<id>` identifies
a literal string in that artifact's `dataModel.proposals`. Coworker's
`add_artifact` populates `a2ui_surface.data_model` from its `data_file` argument;
da-nx maps that wire field to the normalized artifact's `dataModel` for both history and streamed
events. Component-record references such as `/components/<id>/text` are not
valid substitutes: Coworker's validator resolves bindings against the data
model, not the component list. Duplicate/missing component IDs, mismatched source
buttons, other events, cross-site paths, path traversal, and non-HTML proposals
are rejected, as are missing/non-string model values and inherited properties.
This is a bounded data-model reference contract, not an A2UI
expression interpreter. Button labels never trigger commands.

The resulting `canvasBus.comparisonRequest` has host-owned current context and
`details: { candidate: "proposal", baseline: "source", proposedPath }`. This
internal mode is **not** accepted by the plugin iframe protocol; its
document/preview allowlist is unchanged. Original-source and staged-source failures
appear in the comparison surface; invalid chat actions report an error toast.
Only the canvas host opts in; browse and legacy chat retain their behavior.

The importable Coworker skill and complete composed artifact example are in
[`skills/page-proposals/SKILL.md`](../skills/page-proposals/SKILL.md). Deploy the
supporting da-nx renderer and da-live host together (development branches:
`a2uibtn` and `a2uidiff`, respectively). Skill installation/backend artifact
generation must be verified separately; client registration does not expose
schemas to the model.

## Display and lifecycle

- **Side by side** separates the baseline and candidate into two columns (Live for document/preview comparisons, Current content for proposals). Turning it off shows removals and additions together in one unified diff. Red indicates removed baseline content; green indicates added candidate content.
- Close restores the editor's previous inert state and returns focus when focus was in the comparison.
- Close, page changes and replacement comparisons invalidate outstanding work. After awaiting save, the comparison re-checks its generation and current page context before serializing or loading content.
- Document changes mark a document comparison stale. Refresh rebuilds it.
- Preview and live are read when comparison opens or refreshes. Comparisons do not lock either revision.
- Proposal refresh rereads both original and staged source. Closing, navigation, or a replacement comparison invalidates pending reads without touching the editor.
- Only the explicit `saveDocument` action is acknowledged over the same MessagePort using the caller's request ID. Consumers that preview source content must await a successful save result before starting preview; comparison-open's internal save attempt does not refresh preview.
