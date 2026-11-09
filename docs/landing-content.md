# Landing Content

The opt-in Content page uses Browse's `da-list` and `da-file-item` in both views. Open
`/?landing=true&nx=main&nxver=2`. Without `landing=true`, Browse keeps its existing renderer
and navigation. A site or folder hash always opens Browse, even with `landing=true`.

This feature contains only the Content section. It does not introduce a
greeting, chat/composer, branding, page artwork or editor changes.
Content contains no site picker. Site selection belongs in navigation through the
shared picker (adobe/da-nx#947).
Content listens for its existing bubbling `site-select` and `site-added` events
to update the selected scope without changing the root URL. It does not load or
mount the selector, duplicate its validation, or modify LP.

With no saved sites in the browser's existing `da-sites` history, Content shows
"Add a site to get started" without a description, with a blue
shared accent button labeled Add site and the shared plus icon. It lazily opens
Nexter's existing `nx-add-site` dialog, without requiring a mounted picker or
leaving landing. The heading-to-button gap is 20px.
Closing restores focus; successful Add selects the site.
Repeated clicks open only one dialog, and disconnects or scope changes remove it.
With saved sites but none selected, it shows "Choose a site to get started" and
"Select a site from \"Your recent sites\" to see its content.", without a button.
Saved history alone never selects a site. Cross-tab history changes refresh the
copy. Saved-site selection still needs nav integration; Content does not add a
replacement picker.

Content mounts inside the gradient landing surface already provided by main.
`landing.css` retains that page background and inherits the application theme,
without landing-specific theme overrides.
`browse.js` loads `landing.css` and adds the empty `.landing` surface before the
section is shown, so slow loads paint the gradient instead of the authored images.
`landing-content.css` contains only the Content component's shadow styles.
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

While the selected site's content is loading, the panel shows "Loading files..."
with chat's `nx-loading-spinner` design, a blue leading arc and gray track.
The indicator is 14px in S and 16px in M, uses the same animation and is hidden
from assistive technology; its text status and the panel's busy state remain exposed.
It disappears on completion or error. Its styles are scoped to this loading state
so it also works with Nexter versions that do not yet export the shared class.

Favorite uses browser-local `da-favorites` entries across the selected site's folders.
It preserves Browse's folder-keyed storage: starring or unstarring a file updates
the entry for that file's actual containing folder, not the site root.
It displays at most six files in either view without deleting saved entries.
The list keeps Name, Folder, Modified and information/favorite controls.
Changing the filter resets expansion to six. Changing the site also resets
filters and aborts the previous listing. Favorite changes in another tab
update stars while the component is connected; files newly starred elsewhere
appear on the next load.
Returning to the tab or restoring the page from browser history rereads favorites,
so missed storage events do not leave stale stars. Unstarring removes a file from
Favorite, not Recent, and never changes the favorite state of a different file
with the same name.
Starring stores the file in its parent folder, the same bucket Browse uses.
Favorite identity is the full file path, including its extension, not its modification date.

## Data, previews and destinations

Recent shows the files the user opened, newest first. Opening a file in Edit,
Sheet or Canvas stores its path in browser-local `da-recent-files`, up to eighteen
per site (`blocks/shared/recent-files.js`). The site is never crawled: Content lists
only the parent folders of the saved Recent and Favorite paths, at most four at a
time, and stops paging a folder once its files are found. Deleted or renamed files
are dropped. Recent is per browser and starts empty until a file is opened.
Returning to the tab or page reloads Content only if the saved Recent list changed.
Favorite is sorted by modification date. Folder labels show the site-relative containing
folder, such as `/de` for `/org/site/de/coffee.html` and `/` for root items.
The folder link's tooltip shows its full path including org and site.
Site changes and disconnects abort the listings. Permission/network failures in any
folder have a retry state, not an empty or partially successful result.
Both views reuse Browse's file-item menus, details and favorites. Content uses
the standard type icons, including the image icon, in both cards and list rows,
without fetching thumbnails. Browse's default lazy card previews are unchanged.
There are no HTML document thumbnails or screenshot services. Details load only on demand.
Content owns filtering, pagination, destinations and favorite persistence; its
external list does not fetch another directory or expose bulk actions. The
opt-in Folder column leaves Browse's default Type column unchanged.

HTML respects the same per-file `editor.path` settings as Browse. The most
specific matching path wins; site settings win ties with org settings. Unconfigured
HTML uses Canvas when EW is enabled and the classic editor otherwise. Sheets
and media use the existing shared routing helper. Folders open Browse.
`.link` shortcuts resolve to their saved URL through the shared navigation helper.
Same-origin editor and Browse destinations preserve the active preview parameters.
External editor URLs do not receive them. `landing=home` exits the Content opt-in; this
feature does not change the shell's Home destination. The root opt-in is handled
by the existing Browse router rather than overriding site and folder routes.

Existing Spectrum spacing, radius, typography and color tokens are reused.
Fixed card geometry, component icon metrics and the existing panel shadow
are preserved rather than wrapped in a new theming API.

Content uses fixed S typography and icon sizes. It does not import a UI-size
controller or depend on the application size scale. Existing shared component
size variants remain unchanged.

## Delivery

adobe/da-live#1531 contains the complete Content integration, including the
optional shared destination override.
