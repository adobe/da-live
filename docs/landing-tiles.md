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

The gated landing (`?landing=true`, without a scoped hash) lazily loads
`tile-group.js` inside the existing gradient surface. `tile-group.css` styles
the owner; `tile-layout.css` styles the group; `tile.css` styles each tile.
Tile copy and documentation destinations currently live in JavaScript, not
an authored DA document. Browse and Create remain disabled without a selected
site. The landing owner handles permissions and page creation; the reusable
tile remains presentation-only.
