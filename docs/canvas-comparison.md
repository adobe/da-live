# Native canvas comparison

The canvas comparison is a read-only, non-modal surface over the editor mount. The current editor stays mounted (temporarily inert), and the right rail remains visible and interactive. It reuses the version-history comparison renderer and HTML diff builder; the existing version-history modal is unchanged unless `embedded` is explicitly set.

## Inputs and ownership

- `document` versus `live`: serialize the matching loaded editor, read live Markdown through the shared NX API, normalize both into document HTML, then compare.
- `preview` versus `live`: read both delivered Markdown resources through the shared NX API. No preview mutation or document save is triggered by comparison.
- Live 404 is the never-published empty baseline; other failures remain visible errors.
- Executable markup, non-content/custom elements and unsafe URL schemes are removed before rendering. Relative URLs are resolved against the page's delivery origin. Content links open separately rather than navigating the EW host.

The component owns no workflow state or publish-request concepts. `canvasBus.comparisonRequest` connects the in-process host to the existing plugin iframe protocol. The host advertises SDK capabilities `comparison: 1` and `saveDocument: 1`. Comparison candidates are limited to `document` and `preview`, with `live` as baseline. The host supplies the page context; caller-supplied paths, URLs and HTML are not used.

`saveDocument` is separate: it confirms the matching writable editor's collab flush before a consumer previews source content. It never previews or publishes itself. During navigation, a route/editor identity mismatch rejects reads and flushes. The known page-context refresh PR (`ewpage`, da-live #1367) remains separate; an old iframe context is rejected rather than silently applied to a new page.

## Lifecycle

- Close restores the editor's previous inert state and returns focus when focus was in the comparison.
- Page changes close the surface and invalidate outstanding loads.
- Document changes mark a document comparison stale. Refresh rebuilds it.
- Preview/live are read at comparison load time, not locked revisions. The UI explicitly offers refresh and does not claim a reviewed-revision publication guarantee.
- An open/close/save result is acknowledged over the same MessagePort using the caller's request ID. Older SDKs/hosts remain supported by capability detection in consumers.

## Local showcase

Run from this checkout, supplying the separate NX SDK checkout:

```sh
node tools/serve-comparison.mjs --nx=/absolute/path/to/da-nx
```

Open `http://localhost:3010/test/fixtures/comparison.html` for the independent SDK test plugin, or add `?view=approver` for the preview/live default. Edit content, type in the **Context to retain** field in the right-hand **Comparison test plugin** panel, open comparison, continue typing in that field, simulate a collaborator edit, refresh, close, and switch pages.

For the separate publish-request consumer fixture, pass `--plugin=/absolute/path/to/aem-apps` and open `?plugin=publish&view=author` or `?plugin=publish&view=approver`. The consumer fixture belongs to aem-apps, not this EW implementation.

In the author fixture, type in **Note to reviewers (optional)** in the right-hand **Publish request** panel, then click **Review changes** above that field. The note is optional; typing one checks that it survives opening and closing the comparison. In the approver fixture, the author note is read-only; there is no **Note to reviewers** input.

**Side by side** changes only the comparison layout: on separates Live and the candidate into two columns; off shows removals and additions together in one unified diff. Red indicates removed live content and green indicates added candidate content in both layouts.

All fixture content and workflow responses are simulated. The actual ProseMirror editor, comparison renderer, tool panel, SDK and cross-origin iframe protocol are used. No Admin API, workflow worker, email, preview or publish operation is performed. This does not establish authenticated-backend compatibility; that requires separate authorized validation on a configured site.
