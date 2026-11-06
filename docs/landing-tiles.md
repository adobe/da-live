# Landing quick-action tile

Import `blocks/landing/tile.js` and supply `heading`, `description` and `iconHref`.
`tone` is `green`, `orange`, `purple`, or turquoise by default.
`size="m"` enlarges text and icons; the default is S.

`href` renders a link. `action` without `href` renders a button, optionally
`disabled`. Otherwise the tile is non-interactive. The owner handles clicks,
routes and site permissions.

Enabled tiles gain a stronger S2-colored shadow on hover without moving or
changing their background.

`actionId` adds a `landing-action-{actionId}` class for the existing RUM collector.

Load `blocks/landing/tile-layout.css` and place tiles in `.landing-tiles` inside an
inline-size container. The group matches Content's width and centers incomplete
rows: five tiles use 3+2 from 600px and one column below.

The landing replaces Home (no scoped hash) when the page has an authored `Landing`
table or `?landing=true` is set. It lazily loads `tile-group.js` inside the existing
gradient surface. `tile-group.css` styles the owner; `tile-layout.css` styles the
group; `tile.css` styles each tile.

A page with a `Browse` block and a `Landing` table renders the table's rows as tiles
in place; the table itself stays hidden. With only `?landing=true`, the owner fetches
`/drafts/mhaack/landing-copy` as published HTML, like What's New, and parses only its
`Landing` table; that page's Browse block and scripts are not mounted or executed.
Successful content requests are shared and cached. Failed or empty content shows an
error, without hardcoded tile copy.

Each row contains an icon marker, an H3 title link with description, and optional
`tone: name` metadata. Tones use the existing S2 palette classes. Optional `id: name`
metadata keeps telemetry identities stable when titles change; otherwise the
source heading ID is used.

HTTP(S) destinations remain links. `{org}` and `{site}` use the selected site;
`/{action:create-page}` opens the existing permission-checked page dialog.
Unknown actions and unresolved placeholders are disabled. The landing owner
handles permissions and page creation; the reusable tile remains presentation-only.
