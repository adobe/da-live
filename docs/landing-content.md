# Landing Content

The opt-in Content page uses Browse's `da-list` and `da-file-item` in both views. Open
`/?landing=true&nx=main&nxver=2` and select a site in the shared site picker.
The picker requires adobe/da-nx#947. Until it is released, preview with
`nx=siteselector-main`. Without `landing=true`, Browse keeps its existing renderer
and navigation. A site or folder hash always opens Browse, even with `landing=true`.

This feature contains only the Content section. It does not introduce a
greeting, chat/composer, branding, page artwork or editor changes.
The page reuses Nexter's `nx-siteselector`, including its recent history, access
checks and Add dialog. It lazily loads the selector after first render and passes
its selected site to Content through `onSelect`. Selection and Add leave the
root URL unchanged. It does not duplicate the selector controller or modify LP.
An unavailable selector is reported with a link to existing Browse site selection.

Content mounts inside the gradient landing surface already provided by main.
`landing.css` retains that page background and its light/dark theme preview.
`content.css` contains only the Content component's shadow styles.
The panel uses an opaque `--s2-gray-25` surface: white in light mode and dark
in dark mode, with the gradient visible only outside the panel.
Its `--s2-drop-shadow-emphasized` shadow uses Spectrum's light/dark values.
The same values are a fallback for Nexter versions without the shared token.

## Presentation and state

Cards use Browse's fixed 151x200 small preset, independently of page text scale.
The centered panel hugs whole columns, up to six, with 16px side padding.
Both views use the same panel width while loaded, loading, empty or showing
an error. Recent starts with six files. Show more expands directly to eighteen,
or all available files if fewer exist, then disappears. Switching cards/list
preserves the visible files and expansion count. The shared list scrolls
horizontally only when its readable columns cannot fit inside the panel.

Favorite uses browser-local `da-favorites` entries across the selected site's folders.
It preserves Browse's folder-keyed storage: starring or unstarring a file updates
the entry for that file's actual containing folder, not the site root.
It displays at most six files in either view without deleting saved entries.
The list keeps Name, Folder, Modified and information/favorite controls.
Changing the filter resets expansion to six. Changing the site also resets
filters and aborts the previous listing. Favorite changes in another tab
are reflected while the component is connected.

## Data, previews and destinations

All listing pages across the selected site's folders are loaded, deduplicated
and sorted by modification date. Folder labels show the site-relative containing
folder, such as `/de` for `/org/site/de/coffee.html` and `/` for root items.
Hidden folders are not traversed. At most four folder listings run concurrently.
Site changes and disconnects abort the walk. Permission/network failures in any
folder have a retry state, not an empty or partially successful result.
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
feature does not change the shell's Home destination. The root opt-in is handled
by the existing Browse router rather than overriding site and folder routes.

Existing Spectrum spacing, radius, typography and color tokens are reused.
Fixed card geometry, component icon metrics and the existing panel shadow
are preserved rather than wrapped in a new theming API.

Deployed Nexter main currently has no UI-size controller. Browser fixtures
exercise S/M role values to check that card geometry stays fixed; they do not
prove a production M toggle. The optional existing controller is used only
when the configured Nexter version exposes it.

## Delivery

adobe/da-live#1531 contains the complete Content integration, including the
optional shared destination override.
