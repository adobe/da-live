# File item destinations

`da-file-item` keeps the standard Browse card and row presentation.

An optional `href` overrides the title and preview destinations. Without it,
folders, documents, sheets, media and `.link` files retain their existing
navigation behavior. The owner preserves routing and preview parameters when
supplying a destination.

Documents use the standard file-type icons. Image previews keep their existing
lazy loading and error fallback. The destination override does not change card
dimensions, media, metadata, menus or favorite behavior.
