# Landing Content

The opt-in Content page uses the existing Browse `da-file-item` cards. Open
`/?landing=true&nx=main&nxver=2#/org/site` with access to that site.
Without `landing=true`, Browse keeps its existing renderer and navigation.

This feature contains only the Content section. It does not introduce a
greeting, chat/composer, branding, site picker, page artwork or editor changes.
The no-site state links to existing Browse site selection rather than requiring
the LP-only Add site dialog.

## Presentation and state

Cards use Browse's fixed 151x200 small preset, independently of page text scale.
The centered panel hugs whole columns, up to six, with 16px side padding.
Card-mode panel width stays the same while loading, empty or showing an error.
Recent starts with six cards. Show more expands directly to eighteen, or all
available files if fewer exist, then disappears. Two portrait-card rows make
the initial section taller, so six keeps the default desktop view compact.

Favorite uses browser-local `da-favorites` entries for the selected site root.
It displays at most six cards or ten list rows without deleting saved entries.
The list keeps Name, Folder, Modified at and information/favorite controls,
with independent ten-row pagination. Changing the site resets filters and
pagination and aborts the previous listing. Favorite changes in another tab
are reflected while the component is connected.

## Data, previews and destinations

All root-listing pages are loaded, deduplicated and sorted by modification
date. Permission/network failures have a retry state, not an empty success.
Cards keep Browse's type icons, lazy image thumbnails, menus and favorites.
List image thumbnails are lazy and release object URLs on file/site changes
or removal. There are no HTML document thumbnails or screenshot services.
List details reuse main's file-item status helpers and load only on demand.

HTML uses Canvas when EW is enabled and the classic editor otherwise. Sheets
and media use the existing shared routing helper. Folders and `.link` files
open Browse; links open their parent directory rather than requesting an editor.
Same-origin destinations preserve the active preview parameters. External
editor URLs do not receive them. `landing=home` exits the Content opt-in; this
feature does not change the shell's Home destination.

Existing Spectrum spacing, radius, typography and color tokens are reused.
Fixed card geometry, component icon metrics and the custom translucent panel
surface/shadow are preserved rather than wrapped in a new theming API.

Deployed Nexter main currently has no UI-size controller. Browser fixtures
exercise S/M role values to check that card geometry stays fixed; they do not
prove a production M toggle. The optional existing controller is used only
when the configured Nexter version exposes it.

## Review order

adobe/da-live#1616 supplies the optional shared destination override. Its small
diff is included in adobe/da-live#1531 for a working combined preview. Merge
the shared change first, then update the integration with main.
