# Native canvas comparison

The canvas comparison is a read-only, non-modal surface over the editor mount. The current editor stays mounted (temporarily inert), and the right-hand panel remains visible and interactive. It reuses the version-history comparison renderer and HTML diff builder; the existing version-history modal is unchanged unless `embedded` is explicitly set.

## Inputs

- `document` versus `live`: serialize the matching loaded editor, read live Markdown through the shared NX API, normalize both into document HTML, then compare.
- `preview` versus `live`: read both delivered Markdown resources through the shared NX API. Opening a comparison does not save the document or update preview.
- Live 404 is the never-published empty baseline; other failures remain visible errors.
- Executable markup, non-content/custom elements and unsafe URL schemes are removed before rendering. Relative URLs are resolved against the page's delivery origin. Content links open separately rather than navigating the EW host.

## Host actions

`canvasBus.comparisonRequest` connects the in-process host to the existing plugin iframe protocol. The host advertises SDK capabilities `comparison: 1` and `saveDocument: 1`. Comparison candidates are limited to `document` and `preview`, with `live` as baseline. The host supplies the page context; caller-supplied paths, URLs and HTML are not used.

`saveDocument` is a separate action that confirms the matching writable editor's collaboration flush. During navigation, a route/editor identity mismatch rejects reads and flushes. Requests from an old iframe context are rejected rather than applied to a new page.

## Display and lifecycle

- **Side by side** separates Live and the candidate into two columns. Turning it off shows removals and additions together in one unified diff. Red indicates removed live content; green indicates added candidate content.
- Close restores the editor's previous inert state and returns focus when focus was in the comparison.
- Page changes close the surface and invalidate outstanding loads.
- Document changes mark a document comparison stale. Refresh rebuilds it.
- Preview and live are read when comparison opens or refreshes. Comparisons do not lock either revision.
- An open/close/save result is acknowledged over the same MessagePort using the caller's request ID. Clients must check the advertised capabilities before invoking these actions.
