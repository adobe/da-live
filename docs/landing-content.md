# Landing Content

The opt-in Content page uses Browse's `da-list` and `da-file-item` in both views. Open
`/?landing=true&nx=main&nxver=2`. Without `landing=true`, Browse keeps its existing renderer
and navigation. A site or folder hash always opens Browse, even with `landing=true`.
The Content opt-in uses v2 Browse for those hashes so both views share one set of
custom-element definitions. Explicit `browse=1` retains legacy Browse and its Home
view instead of Content.

This feature contains only the Content section. It does not introduce a
greeting, chat/composer, branding, page artwork or editor changes.
Content contains no site picker. Site selection belongs in navigation through the
shared picker (adobe/da-nx#947).
On mount, Content reads the existing selector's public `value` from navigation,
so a selection made before Content loads is not lost. It listens for the existing
bubbling `site-select` event for subsequent changes, without
changing the root URL. It does not load or mount the selector, duplicate its
validation, or modify LP.

With no selected site, Content shows "Choose a site to get started" and
"Select a site from \"Your recent sites\" or add a site.", with a shared
accent button labeled Add site. The button emits the existing bubbling/composed
`site-add` command for the mounted navigation selector, even when that selector is
hidden because its site history is empty. Navigation owns loading and managing
the shared Add site dialog, including repeat-click protection and focus handling.
The dialog opens an added site in Browse; Content does not implement an in-place
add flow or listen for a synthetic `site-added` event.
Content does not read or validate saved-site history, infer a selection from it,
or add a replacement picker.

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
with the shared `nx-loading-spinner`, a blue leading arc and gray track.
The component loads `${getNx2()}/styles/spinner.css` before its feature stylesheet;
the shared sheet owns sizing and animation, with only the active color and
flex-shrink overridden locally. The indicator is hidden from assistive technology;
its text status and the panel's busy state remain exposed.
It disappears on completion or error.

Favorite uses browser-local `da-favorites` entries across the selected site's folders.
It preserves Browse's folder-keyed storage: starring or unstarring a file updates
the saved state through the shared `toggleFavorite` helper. New favorites are stored
in the file's actual containing folder, not the site root. Unstarring removes every
occurrence of that exact path, including legacy entries saved under ancestor folders.
It displays at most six files in either view without deleting saved entries.
The list keeps Name, Folder, Modified and information/favorite controls.
Changing the filter resets expansion to six. Changing the site also resets
filters and cancels the previous load. Local star/unstar actions update immediately.
Favorite changes made elsewhere appear on the next load or cached Back/Forward restore;
focus and cross-tab storage events do not trigger synchronization. Unstarring removes a file from
Favorite, not Recent, and never changes the favorite state of a different file
with the same name.
Favorite identity is the full file path, including its extension, not its modification date.

## Data, previews and destinations

Recent shows the files the user opened, newest first. Opening a file in Edit,
Sheet or Canvas stores its path in browser-local `da-recent-files`, up to eighteen
per site (`blocks/shared/recent-files.js`). Content resolves saved file
paths directly through the shared `source.getMetadata` HEAD API, at most four at a
time. It derives names and extensions from each path and reads modification times
from the `Last-Modified` header. It never lists or pages parent folders.
Missing files (404) are omitted without removing their saved paths.
Folder favorites are bookmarks built from saved folder paths.
They do not need file metadata or a modification date, and do not
make HEAD requests. Folder availability is checked when opened in Browse.
Recent is per browser and starts empty until a file is opened.
Content loads on mount, site changes and Retry. A `pageshow` event with
`persisted: true` reloads the current site when restored from the browser's
back/forward cache, preserving the selected filter, view and visible-item limit.
Ordinary `pageshow`, focus and storage events do not reload Content.
Favorite is sorted by modification date. Folder labels show the site-relative containing
folder, such as `/de` for `/org/site/de/coffee.html` and `/` for root items.
The folder link's tooltip shows its full path including org and site.
Site changes and disconnects cancel queued metadata lookups and discard late results.
The shared metadata API does not accept an abort signal, so in-flight HEAD requests
may finish. Permission/network failures have a retry state, not an empty or partially
successful result.
Both views reuse Browse's file-item menus, details and favorites. Content uses
the standard type icons, including the image icon, in both cards and list rows,
without fetching thumbnails. Browse's default lazy card previews are unchanged.
There are no HTML document thumbnails or screenshot services. Details load only on demand.
Content owns filtering, visible-item limits, destinations and favorite persistence; its
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
