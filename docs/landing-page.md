# Landing page MVP

Track demo fixes and production improvements in the
[landing-page backlog](landing-page-roadmap.md).

The existing Browse page opts into the landing page with `?landing=true`.
Without that parameter, Home, Browse and Canvas are unchanged.
Links out of the preview carry `landing=home`: this keeps Browse and editors
open normally while remembering that the logo and sidebar Home should return
to `landing=true`. The shell's optional `homeHref` configuration is shared by
both controls and is evaluated against the current workspace. Without a
landing opt-in, it leaves each consumer's original Home destination unchanged.
The light-theme preview override is carried through internal file/editor links
so returning Home stays light even when the saved preference is dark.

After publishing the `lp` branch, open:

```text
https://lp--da-live--adobe.aem.live/?landing=true&theme=light&nx=lp&quick-edit=devlive&rum=on#/aemsites/devlive
```

The latest card implementation requires the paired Nexter `lp` branch.
It has not been transferred to Martin's `devlive` branches.

Add `&theme=light` for a light-mode preview without changing the saved theme.
The override applies only while this landing page is present.

Landing retains its S/M hooks, shared button classes and explicitly sized
segmented controls. The standalone picker uses matching S/M component tokens.
The `lp` shell does not include the live sizing runtime.
Do not substitute `nx=ui-size-scale`: that branch does not yet contain the new
shared card. Sizing integration remains separate; neither adobe/da-nx#816 nor
adobe/da-live#1416 is modified or merged by this work.

## Component ownership

- Nexter owns the presentation-only `nx-card`, based on Browse's card layout.
  Landing uses one compact thumbnail size. Ordinary Browse keeps its existing
  renderer until the shared component is available on its supported shell branches.
- Nexter owns the standalone `nx-siteselector` presentation in fragment-driven
  site navigation, separately from centered Browse search. da-live's
  `blocks/shared/site-picker.js` adapter owns browser history, routing, access
  checks and the shared permission-aware Add/Create dialog. Landing does not
  mount a picker or own its lifecycle; its empty-state Add button requests the
  same adapter-owned dialog. Site option formatting lives in `site-picker-utils.js`.
  No account-wide discovery or invented display metadata is added.
- Files table markup lives in the detached da-live `file-table.js` render helper,
  not a new general table framework.
- `da-landing-tile` owns quick-action presentation in da-live. Landing supplies
  the navigation, page creation and documentation destinations.
- `da-file-actions` supplies the card menu and list information/favorite controls.
  It reuses Browse's source/version and preview/publish status helpers.
  The card popover opens beside its trigger, flips near viewport edges and
  follows scrolling. Its normal details/favorite state is 240px by 193px.
  Closing a keyboard-focused menu returns focus to its trigger without stealing
  focus from an outside click.

## Figma fidelity

The 1920px Ready frame (`1852:83848`) has a 1068px Files panel starting at y=395.
Ten compact cards are 142px tall with 4px frame padding, 80px thumbnails,
12px title/metadata insets and a 12px radius; the panel is 406px tall.
The quiet view switcher has two 32px buttons. Quick actions follow after 40px.
These are the default-size design dimensions, not a claim of live S/M integration.

The standalone selector uses the shared Nexter picker defaults, leading selected
checkmarks, two-line entries and matching S/M typography without app-level menu styling.
Its secondary line is the real org/site identifier, not a fabricated domain.
List image files reuse lazy previews in 28px thumbnail slots; information and
favorite controls use 20px icons in separate 48px visual slots.
Sheet items use the plain folded-corner `S2_Icon_File_20_N`, not FileText.
The latest card metadata uses the design's bullet separator.
Filled favorite controls use the linked design's #808080 in light mode,
matching the card badge rather than inheriting the darker button text color.
There is no exact equivalent in the current generated S2 gray palette; dark
mode uses the existing gray-700 token.

Friendly site names/domains, approved Spectrum VF fonts, published-page
screenshots and live task data remain data/asset dependencies. Existing source
previews, permission rules, Subtle composer states and live/sample notices are
intentional differences rather than substitutes for those missing inputs.

## Scope

- Opt-in NX2 pages (`landing=true` or `landing=home`) default to
  `/nx/fragments/nav-new-landing` before shell loading, unless an explicit
  `nav-path` is authored. The fragment mounts the standalone selector and lists
  browser-local recent sites and the site in the hash under **Your recent sites**.
  A divider separates the **Add site** action, replacing the old Browse sites
  detour. Add site lazily opens the shared dialog, also available from the
  no-site state. Anyone can enter an existing AEM/Helix preview or live URL.
  It reuses Browse's URL parser and eight-site browser-local list, checks source
  read access and the organization's paginated site listing, then remembers the
  site and opens its landing page. Adding a site does not create content, grant
  permission or synchronize an account-level site list. Cancelled checks cannot
  add a site later. Invalid URLs, denied access and failed saves remain in the
  dialog with an explicit error.
  Known sites are checked for access without deleting remembered choices.
  Routed sites are remembered before access checks, including denied sites;
  network errors remain distinct from confirmed denials.
  This checks known sites, not a new global site-discovery service.
  In a selected organization, verified admins also see **Create new site** in
  the same dialog. This opens the existing `/start` template setup with the org
  prefilled, without auto-submitting. The dialog and LP-origin setup require an
  explicit write grant on the organization's CONFIG response (`x-da-actions`).
  The backend treats CONFIG writes separately from content writes
  ([authorization contract](https://github.com/adobe/da-admin/blob/main/src/utils/auth.js)).
  Content-write permissions, synthetic API fallbacks and IMS membership do not
  establish administration. Missing or failed permission checks cannot expose
  creation. Setup rechecks the org grant before writing; the backend remains
  responsible for authorization. Without a selected org, Add existing remains
  available but no admin org is guessed. Successful setup preserves the LP
  branch/theme flags and returns to that site's landing page. Successfully
  opened sites are remembered in the same browser-local list, including a
  return from setup. Ordinary `/start` visits retain their existing flow.
  The selector remains when Landing or Browse disconnects; its adapter cleans up
  listeners, pending checks and dialogs when the selector itself disconnects.
  The shared picker's field variant provides the full clickable pill, 32px
  height, tokenized S/M text and right-aligned chevron. Its border and
  background are on the actual trigger, not the noninteractive host.
  Navigation, What’s New, Feedback and the profile retain their existing
  fragment-driven appearance. On `lp`, da-live's shell configuration supplies
  `brand: { title, logoHref, logoSize }` to the shared `nx-nav`. It renders the
  24px Experience Cloud mark from `/img/experience-cloud.svg` in a 32px container,
  followed by
  "Adobe Experience Manager" at 14px, weight 700 and 18px line height
  (`2301:183989`, `1852:85587`). It reuses the shared Adobe Clean font; exact
  Spectrum VF font parity still needs the approved font asset. The label is
  hidden below 600px while the accessible Home link and logo remain.
  The brand link preserves the selected workspace and preview parameters.
  Internal sidebar and page links also retain the Nexter branch, theme and
  landing-return marker through `decorateArea`, including loaded navigation
  fragments. External links, local section anchors, downloads and asset links
  are not changed. This prevents Apps and Marketplace from falling back to the
  default Nexter branch and losing the configured branding and Home destination.
  Legacy inner apps such as Localization and Scheduler use the same configured
  brand and Home destination through NX1's navigation components. They keep
  their existing shell version. The app adapts `decorateArea` to NX1's positional
  callback as well as NX2's object argument so fragment links keep preview flags.
  Branding is identical on Landing, Browse, Canvas, Sheet, Media and other
  pages using this shell configuration, including direct visits without
  `landing=true`. Removing the landing component does not remove the brand.
  `devlive` still uses its original logo and Author lockup; this branding change
  stays on `lp` until approved. There is no replacement header or notification
  trigger.
  The outer application-frame border is removed only while the landing page
  is present, matching the borderless Figma canvas.
  Site labels retain real identifiers; no Nike name or custom domain is fabricated.
- Files are the selected site's **root directory**, not a recursive site index.
  All root-listing pages are loaded before sorting by modification date.
- The mock's Recent tab shows recently modified files, not personal
  recently opened history. The root scope is not added as a visible subtitle.
- **Favorite** uses the existing browser-local `da-favorites` entries for that root.
  Saved entries are not capped, but this widget displays at most ten, without
  Show more. Show All Files opens Browse. Existing modification-date ordering is
  retained; favorite-added timestamps are not tracked. Favorites in nested folders
  remain outside this first version.
  Cards have an always-visible more button beside the truncated title. Its popover
  shows file details and Mark as Favorite / Remove as Favorite. Selected cards have
  a persistent star at the thumbnail's top-right. Actions do not depend on hover;
  keyboard focus and contextual accessible labels remain.
- List view is a separate semantic table, not a single-column stack of cards.
  It shows Name, Folder, Modified at and visible information/favorite controls
  for non-folder files, with a 40px header and 56px rows. Long folder paths truncate
  and retain the full path in their title. The information popover contains details
  only; the separate star toggles favorite with an outlined/filled state.
  Modified by is omitted from the table and loaded on demand in file details,
  alongside source version and preview/publish dates. Partial failures have an
  explicit retry, absent metadata is unavailable, and closed or stale requests
  cannot update another file's details. No author names or profile photos are invented.
  Folders and links do not request unsupported metadata.
- Images reuse browse-v2's lazy previews. Pages opt into read-only, source-backed
  document thumbnails (heading, representative image and excerpt), not screenshots
  of the published site. Source HTML is never inserted into the live DOM or executed.
  These additions are opt-in and do not change ordinary Browse previews.
  Preview failures are identified rather than presented as successful thumbnails.
  The 80px by 107px paper frame wraps unbroken headings/URLs and clips its content.
- The Figma Ready Recent frame (`1852:83848`) supplies the gradient artwork and
  semantic page, fragment and image assets. Sheets now use the shared generic
  Document icon, as requested in the updated design; their editor routes and file
  formats are unchanged. Panels use its 1068px
  desktop width, 16px radius, translucent fill and three-layer shadow. The composer
  uses its 664px desktop width and 109px idle height. Its neutral translucent
  fill, border and soft shadows follow the Spectrum AI Toolkit's Subtle prompt
  field (`24045:21639` in branch `1ypHt0RiJxnGKoZGlIT6eY`). Hover uses that
  theme's faint colored hue and surface gradients (`24045:21695`), only on fine
  pointers while the assistant is available. Focus and typing return to a neutral
  frame (`24045:21088`, `24045:21059`), without a blue focus outline.
  Only dragging files over the available composer shows the dropzone's 2px
  blue-violet ring and faint pink fill (`24045:21667`). The ring follows the
  inner 24px-radius surface, leaving the outer 6px frosted frame untouched.
  Leaving or dropping clears the highlight; dragging text does not activate it.
  Dropped images, PDFs and Markdown files reuse the Add menu's attachment
  builder and assistant handoff, preserving the draft without auto-sending.
  Unsupported or unreadable files produce an explicit error.
  Shared buttons retain their keyboard focus indicators, and forced-colors
  mode provides a system-color focus outline for the prompt.
  Dimensions, spacing, prompt text and Add actions follow the mock.
  This does not add a generation state to the landing composer.
  The background includes the separate white fade over the coloured artwork:
  transparent at -794px, reaching white at about 604px in the 1024px canvas.
  Labels use explicit component line heights; modified dates use Today/Yesterday.
  Content-fragment icons require an explicit fragment type, not a folder-name guess.
- Adobe Clean regular/medium/bold are sourced from Spectrum’s public site and scoped
  to landing/navigation. The greeting requests the locally available Adobe Clean
  Display Semibold, falling back to Adobe Clean. The Figma Spectrum VF and Display
  font binaries were not supplied; exact font-family parity needs approved assets.
- Folders and link files open in Browse. Pages, sheets and media open in their
  editors, preserving the Nexter/quick-edit preview parameters.
- Send opens the site's existing left assistant panel and submits the prompt
  through its public `setPrompt(text, { autoSend: true })` API. It also opens
  a chat panel previously hidden by Browse. The existing EW/chat flags still apply.
  While the panel opens, repeated sends are blocked. A busy assistant retains the
  central draft with a retry message; a site change cancels a pending handoff.
  The coworker icon, prompt placeholder and AI disclaimer follow the mock.
  The composer uses `--s2-body-size-m` (16px) at both UI sizes and
  `--s2-gray-600` for the placeholder, including dark mode.
  The plus button opens the existing Add menu locally and remains a plus
  while open. Files or images opens the native file picker directly; cancelling
  does not open chat. Selected files use the existing attachment builder and
  shared add-to-chat event, without uploading or auto-sending. Other selected
  actions continue in the existing assistant through `openAddAction(id)`,
  supported by both `nx-chat` and `nx-chat-ao`. Typed drafts are preserved.
- Five quick actions replace Need Attention. Landing does not load the comment
  feed or probe page metadata for that removed table.
  - Browse Content opens the selected site in Browse v2 and closes chat before
    the native link navigates, using Nexter's existing panel-close event.
    Its `chat=closed` entry parameter also skips restoration of a remembered
    panel in the destination, including when opened in a new tab. Browse consumes
    this parameter once; normal Browse navigation and manual chat remain available.
  - Create a page opens the shared New page/name dialog. It requires a selected
    site, explicit source-list write permission and a resolved editor. Creation
    checks for an existing name, saves an empty document at the site root and
    refreshes Content; Create and open continues in the site's editor. Errors
    remain visible in the dialog. Switching sites invalidates pending dialog work.
  - Publishing & Workflow opens the EW publishing documentation.
  - Localization & Multi-site opens the EW Multi-Site Manager documentation.
  - Develop & Extend opens the developer tutorial.
  Governance & Operation is not shown. Customizable actions are out of scope.
  At desktop widths, the final two tiles are centered below the first three;
  narrower layouts retain two columns or one column.
  Hover raises interactive tiles with a stronger shadow; keyboard focus retains
  its visible outline.
  Icon backgrounds use Spectrum's turquoise, green, orange and purple 200 tokens,
  including Spectrum's dark-mode values. Tile surfaces retain white in light mode
  and gray 75 in dark mode through the shared gray tokens. Spacing and the 32px
  icon background use shared spacing tokens. The glyph remains component-owned:
  20px in S and 22px in M.
  Quick-action SVGs use the shared `/img/icons/` location. Report Suite Mapping and
  Data Streams are stored there alongside the other shared icon assets; their
  SVG artwork is unchanged and the tiles continue to use CSS masks.
  The 12px tile radius and the rest/hover shadows are component-local values,
  named `--da-landing-tile-radius`, `--da-landing-tile-shadow` and
  `--da-landing-tile-hover-shadow`; they are not shared Spectrum tokens.
- Each action has a stable `landing-action-*` class and matching
  `data-rum-source` identifier. The existing Optel enhancer's web-component
  plugin follows nested shadow roots and collects native clicks, including
  keyboard activation. No second click collector or eager RUM import is added.
  The source is the fixed action identifier; link targets are their destinations.
  `rum=on` enables full sampling in the testing link and is preserved on
  Browse/editor navigation.
- Notification counts, published-page screenshots and global AI routing are not
  mocked. The routing placeholder does not add a global routing backend.

## Shared demo safety

The `lp` branch keeps preview code isolated. Explicitly integrating it into
`devlive` updates Martin's application code, but does not change site content.
Loading the landing page reads the site's listing and configuration; favorites
and view choices are browser-local. However, `aemsites/devlive` is shared content,
not a sandbox copy. Editing an opened file or sending a prompt in the assistant
can change that shared site. Create a page also writes real content.
Use a separate content site for write testing.

## Manual checks

Sign in with access to the selected site. Check the greeting, site switching,
file navigation, Favorite, card/list switching, Show all files and prompt handoff.
Check card menus, persistent selected stars, list information-only popovers,
favorite toggles, unavailable metadata/retry and the ten-item Favorite cap.
Check the five quick actions, Browse with chat closed, New page cancellation,
duplicate names and save errors, and all three documentation destinations.
With `rum=on`, confirm one distinct click checkpoint per action and keyboard
activation, without sending real page names in telemetry.
Open Add site from the picker and the no-site state. Check a valid existing URL,
an invalid URL, a denied site, an unavailable check and cancelling an in-flight
request. Confirm the added site appears in the current browser's picker and
reopens in LP without changing preview flags. Compare a normal user with an org
admin: only an explicit org CONFIG write grant exposes creation. Check missing
permission headers and failed checks without hiding Add existing. Do not submit
creation against shared demo content when checking the setup entry.
Check dark mode, narrow layouts, keyboard focus and a site without chat.
Verify chat availability after changing sites; the existing assistant handoff is
preserved. The separate chat.io module and sizing-branch integration still need
confirmation before replacing that flow or claiming live S/M support.
The unparameterized Browse and Canvas routes should retain their existing UI.
