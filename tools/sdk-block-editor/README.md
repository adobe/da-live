# Local block sidebar SDK prototype

da-live and da-nx changes are on their local `main` branches. The migrated sidebar
is in the sibling ew-extensions repository on `blockext`.

From da-live:

```sh
node tools/sdk-block-editor/server.mjs
```

Open <http://localhost:3001/tools/sdk-block-editor/>. The server serves da-live
and the sibling da-nx at port 3001, and ew-extensions at port 3002. The actual
extension runs cross-origin and communicates through the SDK MessageChannel.
No new dependencies or external service are needed for the fixture page.

The default library fixtures cover repeating cards, text, link URLs, lists,
variants, row addition/deletion/reordering, and a non-repeating dropdown block.
Click a source-editor block to select it. Expand an item in the sidebar to edit
its fields. Use "Simulate intervening edit" while a field has a draft to check
stale-revision handling, and the read-only checkbox to check permissions.

The fixture editor has no collaboration connection or remote persistence.
The host's production canvas integration retains the existing collaboration
and persistence pipeline; testing those, authenticated image uploads, AEM Assets,
chat generation, and the host block-replacement modal requires a configured,
authenticated canvas document. The fixture page deliberately cannot upload to
a remote document because it has no source URL.

For a real canvas document, configure a library extension row named "Block editor"
with experience `inline` and path:

```text
http://localhost:3002/tools/block-editor/block-editor.html?nx=http://localhost:3001/nx&live=http://localhost:3001&ref=local
```

Omit `library` to load the document site's library configuration through the SDK.
Use the SDK-enabled local da-live host, not an older deployed host. Existing
out-of-the-box block library and toolbar operations remain in core; the new
sidebar itself is an iframe extension and does not import ProseMirror.

The SDK snapshot retains the existing instrumented AEM preview limitations.
Source-backed plain field descriptions accompany it for field values and
targeting. Existing indexes are reused; there is no new data-target attribute.
