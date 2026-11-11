# Landing quick-action tile

Import `blocks/landing/tile.js` and supply `heading`, `description` and `iconHref`.
`tone` is `green`, `orange`, `purple`, or turquoise by default.
`size="m"` enlarges text and icons; the default is S.

An HTTP(S) or relative `href` renders a link. `action` without `href` renders a button, optionally
`disabled`. Otherwise the tile is non-interactive. The owner resolves
destinations.

Enabled tiles gain a stronger S2-colored shadow on hover without moving or
changing their background.

The owner reports each enabled tile click with
`sampleRUM('click', { source: 'landing-action-{id}', target })`, where `target` is the
destination or the action name.

The group owns its layout in `tile-group.css`: three equal-width tiles per row
from 600px and one column below, with incomplete rows centered. Five tiles use
3+2 without depending on Browse's file-grid sizing.

The landing replaces Home (no scoped hash) when the page has authored Landing
blocks or `?landing=true` is set. `?landing=false` keeps the existing Home. Browse
selects the route; `da-landing` hosts `greeting`, `recent-files` and `landing`
blocks in their authored order. The `landing` block loads `tile-group.js` in place.
`tile-group.css` styles the owner and layout;
`tile.css` styles each tile.

Landing inherits the application's color scheme and shared Spectrum tokens,
including its gradient. It does not choose a theme or support a `?theme=` override.

Users without recent sites are redirected to `/start`. Returning users sign in
before Landing decorates its authored blocks.
Tiles use the same preselected site as Content and update when the site selector
changes, without requiring a scoped URL hash. Scoped hashes still route to Browse.

A page's `Browse` block owns routing. Copies of its authored `Greeting`, `Recent Files`
and `Landing` blocks render inside the no-hash host; the outer source blocks stay
hidden so scoped Browse routes do not show Landing content. The `Landing` block
replaces its table rows with tiles at that exact position.
With only `?landing=true`, the owner fetches
`/drafts/mhaack/landing-copy.plain.html` and reads the same ordered blocks;
that page's Browse block and scripts are not mounted or executed.
Successful content requests are shared and cached. Failed or empty content shows an
error, without hardcoded tile copy.

Each row contains an icon marker (`:s2-icon-name:` text or a published
`span.icon.icon-s2-icon-name`), an H3 title link with description, and optional
`tone: name` metadata. Tones use the existing S2 palette classes. Optional `id: name`
metadata keeps telemetry identities stable when titles change; otherwise the
source heading ID is used. Rows without an icon or an H3 title link are skipped with
a console warning.

HTTP(S) destinations remain links. Same-origin links keep the current `nx`, `nxver`,
`quick-edit`, `ew`, `nx-chat-ao` and `rum` parameters. `{org}` and `{site}`
use the selected site; without one, or in a link to another origin, those tiles
are disabled. `/{action:create-page}` needs a selected site and opens the shared
`da-name-dialog`. It refuses existing names,
saves an empty page and opens it in the site's editor, like Browse's New → Document.
Both flows use `createPage` from `blocks/shared/da-file-item/item.js` for the
empty-page save and editor URL. Browse supplies its current editor; Landing lets
the shared operation resolve it. Landing retains its dialog and duplicate-name
validation.
Editor configuration uses the same org/site precedence and path matching as Browse,
with EW selecting the default only when no override applies. Closing the dialog,
changing sites or disconnecting invalidates that create operation's pending work.
Other actions and unresolved placeholders render as disabled tiles.
