# Canvas panel deep links

Open a page and the configured Proposed Changes extension together:

```text
https://da.live/canvas?panel=proposed-changes#/org/site/campaigns/demo
```

The `panel` query parameter selects a registered Canvas tool-panel view ID,
not an extension URL or its display title. The extension must already be
configured for the target organization/site with ID `proposed-changes` and
an inline panel experience. Other registered view IDs, such as `files` and
`outline`, work too.

An explicit non-empty `panel` parameter opens the right sidebar, even if it
was previously closed or another tab was saved. Once the site's asynchronous
view catalog has loaded, a matching ID takes precedence over session storage
and `ew.canvasDefaultPanel`. Unknown IDs use the normal tab-selection fallback;
they never load an arbitrary extension URL. An empty parameter behaves like
no override.

The hash still identifies the original page, without `.html`; do not navigate
to `/.da/proposals/`. Switching tabs, closing the sidebar, and navigating between
pages continue to work normally. The query selects the initial tab when a
site's tool panel is loaded, not on every page change.

## Page-proposal POC

The link-based `skills/page-proposals/SKILL.md` stages content under
`/<org>/<site>/.da/proposals/` and returns one ordinary Markdown link labeled
**Review Changes** to the first successfully staged page. It does not emit
A2UI, artifacts, or chat action events. Link appearance is controlled by the
chat renderer; this flow does not introduce a custom button renderer.

The unchanged extension discovers all readable staged HTML page proposals
for the site. Its own controls handle host diff, apply, and discard. Opening
the link does not accept or publish anything. This branch includes only the
native source-comparison support required by its existing `openComparison`
action, not the A2UI handlers from adobe/da-live#1732.

For testing this branch after it is deployed, replace `https://da.live` with
`https://panel-deep-link--da-live--adobe.aem.live`. Keep the extension's existing
`?nx=a2uidiff` SDK selection until the source-path SDK is deployed. The extension
itself and its bundled Install Skill text are unchanged; install this POC skill
separately instead of using that bundled older text.
