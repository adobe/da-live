# Landing Content

The authored `recent-files` block mounts `da-recent-files`, reusing Browse's `da-list`
and `da-file-item` in both views. On pages declaring Landing content, the no-hash
Browse route mounts `da-landing`; a site or folder hash always opens Browse.
`?landing=true` also enables Landing with content fetched from
`/drafts/mhaack/landing-copy.plain.html`. `?landing=false` retains the existing Home.
The host decorates authored `greeting`, `recent-files` and `landing` blocks in their
document order through NX's block loader. Moving those blocks changes their order;
the host does not prepend tiles or add an implicit Content panel.
Landing owns the entry gate: without a valid recent site it redirects to `/start`
using history replacement, preserving environment parameters through da-nx's shared
URL helper. Start owns onboarding. With recent sites, Landing waits for IMS and
uses the same missing-token sign-in handler as Browse before loading any files.
The `greeting` block substitutes `[firstname]` in authored text using the authenticated
profile. Greeting copy is not hardcoded or connected to chat availability.
Content contains no site picker. Site selection belongs in navigation through the
shared picker (adobe/da-nx#947).
On entry, Landing reads `da-sites` and uses the first valid option
from da-nx's shared `getSiteOptions`, matching the navigation selector's default.
The gradient remains visible while authentication settles, without flashing
onboarding or Content. An authentication initialization failure offers a page reload
to reset the shared cached IMS promise rather than retrying it in place.
Unreadable history redirects to Start.
Landing listens for the existing bubbling `site-select` event and supplies the same
selection to Recent Files and tiles, without changing the root URL. The blocks
do not inspect navigation's shadow DOM or mount another selector.

Content does not add a replacement picker or duplicate shared site-option validation.
The no-recent-files and no-favorites states remain available for a selected site.

## Authored greeting

Use full-width rows for the default greeting and two-cell rows for an optional
`chat` override: variant name first, greeting second. Merge the header across both
columns. `[firstname]` uses the signed-in user's first name.
Selecting `chat` replaces the default; a missing override falls back to default.
Landing currently uses the default.

## Content surface

Content mounts inside the gradient landing surface already provided by main.
`landing.css` retains that page background and inherits the application theme,
without landing-specific theme overrides.
`browse.js` loads `landing.css` before creating the empty `.landing` surface
and mounting the Landing host. It does not hold the section hidden while those styles load.
`blocks/recent-files/recent-files.css` contains only the Content component's shadow styles.
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
Failed file requests, including HTTP and network errors, are skipped for that
load without removing their saved paths or hiding successful items.
Folder favorites are bookmarks built from saved folder paths.
They do not need file metadata or a modification date, and do not
make HEAD requests. Folder availability is checked when opened in Browse.
Recent is per browser and starts empty until a file is opened.
The initial load fetches Recent, not every saved favorite. Opening Favorite loads
only favorite paths missing from the already-loaded Recent items, with a loading
state while those requests finish. Switching back to Recent does not wait for them.
Favorite results are cached until the next site load or refresh.
Content loads on mount, site changes and Retry. A `pageshow` event with
`persisted: true` reloads the current site when restored from the browser's
back/forward cache, preserving the selected filter, view and visible-item limit.
Ordinary `pageshow`, focus and storage events do not reload Content.
Favorite is sorted by modification date. Folder labels show the site-relative containing
folder, such as `/de` for `/org/site/de/coffee.html` and `/` for root items.
The folder link's tooltip shows its full path including org and site.
Site changes and disconnects cancel queued metadata lookups and discard late results.
The shared metadata API does not accept an abort signal, so in-flight HEAD requests
may finish. Cancellation still propagates rather than being treated as an item
failure. Site initialization/configuration failures retain the panel's Retry state.
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
