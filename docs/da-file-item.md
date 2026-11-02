# File item previews and destinations

`da-file-item` keeps the standard Browse card and row presentation.

An optional `href` overrides the title and preview destinations. Without it,
folders, documents, sheets, media and `.link` files retain their existing
navigation behavior. The owner preserves routing and preview parameters when
supplying a destination.

Set `documentPreview` to load a source-backed HTML document thumbnail when the
card becomes visible. The preview renders extracted text, not executable HTML.
Image previews keep their existing lazy loading.

Preview errors do not retry on unrelated updates. Changing paths or disconnecting
discards stale results and releases object URLs. Neither option changes card
dimensions, metadata, menus or favorite behavior.
