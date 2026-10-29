# File item

Import `blocks/shared/da-file-item/da-file-item.js` for shared file cards and rows.
The owner supplies file identity, editor, selection and favorite state and handles
`favoritechange`, `checked`, `renamecompleted` and `onstatus`.

`view="card"` retains the portrait presentation by default. Opt into
`layout="compact"` for an icon beside the filename, the shared More/details menu,
and one modified-date line. The named `metadata` slot can supply a localized date
label. Compact cards fill their container and use an 80px preview. `size` (`s` or
`m`) controls typography and controls independently from `dimensions` (`s`, `m`,
`l`) and the `--da-card-width` / `--da-card-height` footprint overrides. Compact
height follows content rather than a portrait height preset.

An optional `href` overrides the destination for both preview and title links.
Without it, folders, documents, sheets, media and `.link` files retain the shared
navigation behavior. The owner is responsible for preserving its routing and
preview parameters when supplying a destination.

Image previews load once when visible. `documentPreview` opts HTML files into a
source-backed paper preview: extracted text is rendered as text, not inserted
HTML. `iconHref` can supply a semantic fallback icon. Preview errors are reported
without retrying on unrelated updates; changing paths or disconnecting discards
stale results and releases object URLs. `view="preview"` reuses just the lazy
thumbnail in an existing list layout, without adding metadata or controls.

More and favorite controls share the same details and persistence events in both
card layouts. Consumers must update `isFavorited` after persisting a change.
