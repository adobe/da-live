# Native canvas comparison

The canvas comparison is a read-only, non-modal surface over the editor mount. The current editor stays mounted (temporarily inert), and the right-hand panel remains visible and interactive. `ew-comparison` owns the comparison renderer; version history imports it. Both use the shared HTML diff builder. The existing version-history modal is unchanged unless `embedded` is explicitly set.

## Inputs

- Opening either comparison first awaits the host's save of the matching loaded editor. If it reports `not-writable`, comparison opens without saving so read-only reviewers can compare. Other returned or rejected save failures remain visible errors and prevent document serialization and delivery reads.
- `document` versus `live`: after the save attempt, serialize the matching loaded editor (including edits received while saving), read live Markdown through the shared NX API, normalize both into document HTML, then compare.
- `preview` versus `live`: after the save attempt, read both existing delivered Markdown resources through the shared NX API. Opening a comparison does not refresh preview or publish; unsaved-to-preview source edits are not included in the staged comparison.
- Live 404 is the never-published empty baseline; other failures remain visible errors.
- Executable markup, non-content/custom elements and unsafe URL schemes are removed before rendering. Relative URLs are resolved against the page's delivery origin. Content links open separately rather than navigating the EW host.

## Host actions

`canvasBus.comparisonRequest` connects the in-process host to the existing plugin iframe protocol. `openComparison` and `closeComparison` are fire-and-forget commands; save, loading and delivery errors appear in the host comparison surface. Comparison candidates are limited to `document` and `preview`, with `live` as baseline. The host supplies the page context; caller-supplied paths, URLs and HTML are not used. There is no capability negotiation; deploy the supporting host before its SDK and consumers.

`saveDocument` remains a separate, acknowledged action that confirms the matching writable editor's collaboration flush, including for submission flows that do not open comparison. Comparison-open uses the same host save callback internally. During navigation, a route/editor identity mismatch rejects reads and flushes. Requests from an old iframe context are rejected rather than applied to a new page.

## Display and lifecycle

- **Side by side** separates Live and the candidate into two columns. Turning it off shows removals and additions together in one unified diff. Red indicates removed live content; green indicates added candidate content.
- Close restores the editor's previous inert state and returns focus when focus was in the comparison.
- Close, page changes and replacement comparisons invalidate outstanding work. After awaiting save, the comparison re-checks its generation and current page context before serializing or loading content.
- Document changes mark a document comparison stale. Refresh rebuilds it.
- Preview and live are read when comparison opens or refreshes. Comparisons do not lock either revision.
- Only the explicit `saveDocument` action is acknowledged over the same MessagePort using the caller's request ID. Consumers that preview source content must await a successful save result before starting preview; comparison-open's internal save attempt does not refresh preview.
