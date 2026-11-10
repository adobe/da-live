# Landing-only navigation branding plan

Status: proposed. This draft contains the implementation plan only. It does not
change application behavior.

## Scope

Show the Adobe logo and "Adobe Experience Manager" on the landing surface.
Show the logo only on every other EW surface, including Browse, Canvas, Editor,
Apps and Marketplace. Do not replace the label with "Author" or "AEM".

Keep the existing artwork, 24px logo, 32px wrapper, landing typography and
light/dark support. Keep the top-bar dimensions unchanged for both UI sizes.
Do not redesign breadcrumbs, search, the sidenav or the app framework.
Preserve legacy NX1 branding.

## Existing behavior

The original branding changes are merged in
[adobe/da-nx#965](https://github.com/adobe/da-nx/pull/965) and
[adobe/da-live#1664](https://github.com/adobe/da-live/pull/1664).

`scripts/scripts.js` supplies the logo and product label for every NX2 page.
Nexter uses that label for both visible text and the home link's accessible name.
Removing the configured label would restore the authored lockup, not produce
the requested logo-only presentation.

`blocks/browse/utils.js` already selects the landing surface through
`getBrowseComponent()`. Route details take precedence over `landing=true`.
`blocks/browse/browse.js` uses the existing hash subscription to switch views.
Use that selected view as the source of truth, not a second URL predicate.
Only `da-landing` gets the full label; the existing `da-sites` Home view and
all other views get the logo only.

## File-level implementation plan

1. **Nexter presentation:** Add a narrowly scoped CSS visibility hook for
   `.brand-label` in `adobe/da-nx/nx2/blocks/nav/nav.css`, visible by default.
   Preserve the existing `aria-label` and `/` destination in both presentations.
   Extend `nx2/test/unit/nx/blocks/nav/nav.test.js` and document the hook in
   `docs/nav-component.md`. Do not add product routes to Nexter or change its
   existing branding configuration requirements.
2. **Consumer default:** In `adobe/da-live/styles/styles.css`, use that hook to
   hide the visible label by default and show it only for the active landing
   view. Keep the existing logo and accessible label in `scripts/scripts.js`.
   Do not change assets or nav fragments.
3. **Consumer view lifecycle:** In `adobe/da-live/blocks/browse/browse.js`,
   reflect the selected landing view with a page-level class. Update it through
   the existing hash subscription on initial selection and every view switch.
   Reuse `getBrowseComponent()` from `blocks/browse/utils.js`. Avoid reaching
   into the nav's shadow root or reloading its fragment to toggle the label.
4. **Consumer coverage:** Retain the route-precedence cases in
   `test/unit/blocks/browse/utils.test.js` and startup configuration coverage in
   `test/unit/scripts/scripts.test.js`. Add focused integration coverage beside
   the browse tests for initial view selection and landing-to-Browse-to-landing
   navigation without reloading. Check that landing query parameters do not
   enable the label on unrelated pages.
5. **Deployment and UI verification:** Implement and deploy the Nexter hook
   first, then enable the consumer styles and view state in da-live. Use linked
   implementation PRs. Verify landing, existing Home, Browse, Canvas, Editor,
   Apps and Marketplace in light/dark and S/M. Check the home link's accessible
   name, keyboard focus, unchanged logo geometry and reclaimed breadcrumb/search
   space, including back/forward navigation and delayed nav hydration.

## Validation

No runtime tests are required for this plan-only change. The implementation
must run the targeted Nexter nav tests, the relevant da-live browse/startup
tests and each repository's existing JavaScript/CSS linters. Authenticated
preview checks remain required before marking the implementation ready.
