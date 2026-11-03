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
Both views use the same panel width, including loading, empty and error states.
Recent starts with six files in either view. Show more expands directly to eighteen, or all
available files if fewer exist, then disappears. Two portrait-card rows make
the initial section taller, so six keeps the default desktop view compact.

Favorite uses browser-local `da-favorites` entries for the selected site root.
It displays at most six cards or list rows without deleting saved entries.
The list reuses `da-file-item` rows with Name, Folder, Modified at, Modified by
and information/favorite controls. Modifier names include the standard user icon.
Each view retains its own six-to-eighteen expansion.
Folder links preserve Browse navigation and site-relative folder context.
Changing between cards and rows keeps the selected filter and both view limits.
Changing the site resets filters and
pagination and aborts the previous listing. Favorite changes in another tab
are reflected while the component is connected.

## Data, previews and destinations

All root-listing pages are loaded, deduplicated and sorted by modification
date. Permission/network failures have a retry state, not an empty success.
Cards keep Browse's type icons, lazy image thumbnails, menus and favorites.
Rows keep shared file-type icons instead of a separate landing thumbnail
implementation. There are no HTML document thumbnails or screenshot services.
Visible rows lazily load modifier metadata through the existing DA status helper;
the information control reuses that request. Failed or missing modifier data is
shown as a dash, not an invented author. Pending metadata is invalidated on
file/site changes or removal. Preview/publish details load only on demand.

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

The list integration also depends on the opt-in shared row columns documented
in `docs/da-file-item-rows.md`. Default Browse columns and controllers are not
replaced. The landing list owns matching accessible headers and horizontal
scrolling at narrow widths; all four data columns stay available.

Design: https://www.figma.com/design/aliOqnaMYpvWLbnjrg5DFK/Experience-Workspace?node-id=1852-84464
