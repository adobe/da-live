# Landing Content

The opt-in Content page uses Browse's `da-list` and `da-file-item` in both views. Open
`/?landing=true&nx=main&nxver=2#/org/site` with access to that site.
Without `landing=true`, Browse keeps its existing renderer and navigation.

This feature contains only the Content section. It does not introduce a
greeting, chat/composer, branding, site picker, page artwork or editor changes.
The no-site state links to existing Browse site selection rather than requiring
the LP-only Add site dialog.

Content mounts inside the gradient landing surface already provided by main.
`landing.css` retains that page background and its light/dark theme preview.
`content.css` contains only the Content component's shadow styles.
The panel uses an opaque `--s2-gray-25` surface: white in light mode and dark
in dark mode, with the gradient visible only outside the panel.

## Presentation and state

Cards use Browse's fixed 151x200 small preset, independently of page text scale.
The centered panel hugs whole columns, up to six, with 16px side padding.
Both views use the same panel width while loaded, loading, empty or showing
an error. Recent starts with six files. Show more expands directly to eighteen,
or all available files if fewer exist, then disappears. Switching cards/list
preserves the visible files and expansion count. The shared list scrolls
horizontally only when its readable columns cannot fit inside the panel.

Favorite uses browser-local `da-favorites` entries for the selected site root.
It displays at most six files in either view without deleting saved entries.
The list keeps Name, Folder, Modified and information/favorite controls.
Changing the filter resets expansion to six. Changing the site also resets
filters and aborts the previous listing. Favorite changes in another tab
are reflected while the component is connected.

## Data, previews and destinations

All root-listing pages are loaded, deduplicated and sorted by modification
date. Permission/network failures have a retry state, not an empty success.
Both views reuse Browse's file-item menus, details and favorites. Image thumbnails
are lazy and release object URLs on file/site changes or removal. There are no
HTML document thumbnails or screenshot services. Details load only on demand.
Content owns filtering, pagination, destinations and favorite persistence; its
external list does not fetch another directory or expose bulk actions. The
opt-in Folder column leaves Browse's default Type column unchanged.

HTML respects the same per-file `editor.path` settings as Browse. The most
specific matching path wins; site settings win ties with org settings. Unconfigured
HTML uses Canvas when EW is enabled and the classic editor otherwise. Sheets
and media use the existing shared routing helper. Folders and `.link` files
open Browse; links open their parent directory rather than requesting an editor.
Same-origin destinations preserve the active preview parameters. External
editor URLs do not receive them. `landing=home` exits the Content opt-in; this
feature does not change the shell's Home destination.

Existing Spectrum spacing, radius, typography and color tokens are reused.
Fixed card geometry, component icon metrics and the existing panel shadow
are preserved rather than wrapped in a new theming API.

Deployed Nexter main currently has no UI-size controller. Browser fixtures
exercise S/M role values to check that card geometry stays fixed; they do not
prove a production M toggle. The optional existing controller is used only
when the configured Nexter version exposes it.

## Review order

adobe/da-live#1616 supplies the optional shared destination override. Its small
diff is included in adobe/da-live#1531 for a working combined preview. Merge
the shared change first, then update the integration with main.
