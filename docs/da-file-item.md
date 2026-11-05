# File item destinations

`da-file-item` keeps the standard Browse card and row presentation.

An optional `href` overrides the title and preview destinations. Without it,
folders, documents, sheets, media and `.link` files retain their existing
navigation behavior. The owner preserves routing and preview parameters when
supplying a destination.

Documents use the standard file-type icons. Image previews keep their existing
lazy loading and error fallback. The destination override does not change card
dimensions, media, metadata, menus or favorite behavior.

## External lists

`da-list` accepts caller-owned `listItems` without a `fullpath`. It preserves
their order and favorite flags without fetching a directory. With no `select`,
it offers no selection controls or bulk actions. Favorite requests bubble as
`favoritechange` with `detail.item`; the caller persists the change and supplies
updated items. Directory-backed lists keep their existing favorite behavior.
An explicit `sort = false` renders plain headings instead of sorting controls,
so a paginated owner can keep its own ordering.

The optional `showFolder` property replaces the Type column with Folder.
Each item may supply `folderHref`; otherwise the folder links to its Browse
hash. `da-list` forwards an item's optional `href` to the shared file item.
The `header`, `items` and `grid` CSS parts let an embedded list fit its owner's
layout without replacing its cards or rows.

An item's optional `imagePreview: false` uses the image type icon instead of
fetching a card thumbnail. Omitting it preserves Browse's existing lazy card
previews, fallback and object-URL cleanup. List rows always use type icons.
`da-list` supplies the file item's optional
`folder` metadata (`path`, `label`, `href`) when `showFolder` is enabled.
