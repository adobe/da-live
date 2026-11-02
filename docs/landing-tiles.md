# Landing quick-action tile

`blocks/landing/tile.js` defines the presentation-only `da-landing-tile`.
It is not loaded or mounted by an application page.

Open [the component reference](landing-tiles.html) for live examples of links,
actions, disabled buttons, non-interactive tiles and S/M/light/dark settings.
The existing `nx` query parameter selects the Nexter shell supplying the tokens.
This reference does not create content or mount the landing application.

The owner supplies `heading`, `description`, `iconHref`, and an optional
`tone` (`green`, `orange`, `purple`, or the default turquoise).
Use `size="m"` for the larger text and icon scale; the default is S.
Styles inherit the owner's font, color scheme and Spectrum tokens.
Turquoise and purple 200 tokens must be available in the consuming Nexter
shell before using those tones.

With `href`, the surface is a native anchor. With `action` and no `href`,
it is a native button, disabled by `disabled`. Otherwise it is a
non-interactive tile. The component does not choose routes or perform actions.
The owner handles native clicks, site permissions and any page-creation dialog.

An `actionId` adds `landing-action-{actionId}` to the interactive surface and
matching `data-rum-source` attributes to its contents for the existing click
collector. No separate telemetry collector is installed.

Load `blocks/landing/tiles.css` and put tiles (or list items containing tiles) in
`.landing-tiles` inside an inline-size container. The group matches the loaded
Content panel's whole-card width, capped at six 151px cards with 12px gaps and
16px panel insets (998px). Five tiles use two columns (2+2+1), then one below
600px. The final tile is centered in both layouts.

The component does not provide the application entry point, site-selection state
or documentation destinations.
