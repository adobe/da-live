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

For the chat integration preview, use `lpchat` for both repositories:

```text
https://lpchat--da-live--adobe.aem.live/?landing=true&theme=light&nx=lpchat&quick-edit=devlive#/exp-workspace/frescopaco
```

The `theme=light` preview override does not change the saved theme.
The override applies only while this landing page is present.

Landing retains its S/M hooks, shared button classes and explicitly sized
segmented controls. The standalone picker uses matching S/M component tokens.
The `lp` shell does not include the live sizing runtime.
Do not substitute `nx=ui-size-scale`: that branch does not yet contain the new
shared card. Sizing integration remains separate; neither adobe/da-nx#816 nor
adobe/da-live#1416 is modified or merged by this work.

For a temporary M-size preview of only the quick-action tiles, run this in the
DevTools console with the context set to **top**, after the tiles have loaded:

```js
document.querySelector('da-landing').shadowRoot
  .querySelectorAll('da-landing-tile')
  .forEach((tile) => { tile.size = 'm'; });
```

This does not enable whole-shell sizing. Reloading or a parent render restores
the shell-selected size.

## Component ownership

- AO sites reuse Nexter's extracted `nx-ao-input` in both the landing page and
  conversation. The input owns draft, attachments, menus, voice and working/Stop
  presentation. Nexter's shared composer skin owns the gradient frame. Landing
  owns page layout, site availability and handoff
  to the existing conversation; it does not create another controller. The
  configured `loadChatInput()` loader leaves legacy sites on their existing form.
  Standalone context events stay isolated from the panel's add-to-chat event.
  Async handoff must be accepted before the central draft and pills clear.
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

The sidebar coworker action uses colored SVG artwork without an outer shadow
while chat is closed. Once the chat panel is shown it uses the
selected circular action style with an 18px light coworker glyph. Closing chat
or changing sites restores the blob; opening another panel does not change it.
Coworker marks in both text boxes use `--s2-gray-800` in either theme.

Chat-family defaults come from Nexter's `nx2/blocks/shared/chat/input.css`:
working fill/border/text, spinner/logo dimensions and input inset/height limits.
The centered composer adopts Nexter's `nx2/blocks/shared/chat/composer.css`.
Its `--nx-chat-composer-*` properties name the 24px inner radius, 6px frame
and derived 30px outer radius, plus gradient artwork, blur/opacity and
state-specific shadows. Landing retains the page's 664px width and positioning.
Idle, ready, focus-frame, working and drop shadows stay separate; working
defaults to the current ready shadow. Existing S2 spacing is reused directly.
The legacy center working label uses the shared working-text color. Disclaimer
spacing and S/M line heights use the existing S2 spacing and typography tokens.
The legacy text line remains 20px and the expanded AO row 21px; tokenization
does not resize either chat or flatten the center/sidebar variants.
The legacy S line uses the existing S2 component line-height token; AO keeps
the Figma-specific `--nx-chat-input-expanded-line-height`. In M both middle
inputs use 18px text and body line height 1.5 (27px). Shared button classes
advance sidebar actions 24→32px and middle actions 32→40px; Stop is no longer
sized separately. Landing passes the same size to the existing conversation
and its standalone AO input. Spinner/logo sizes advance 16→18px and 20→22px.
These component variants do not install the global profile sizing runtime.

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
  Browse uses the shared `da-file-item` list/card renderer; Landing keeps its
  compact card layout. Both use shared item navigation that preserves the
  Landing Home destination and preview flags for same-origin editor links.
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
  fill, border and soft shadows follow the Balanced prompt field in the chat
  design (`3231:201921`, `3231:206692`). The idle field has a faint colored hue;
  fine-pointer hover strengthens its surface gradients. Focus and typing return
  to a neutral frame, without a blue focus outline.
  Only dragging files over the available composer shows the dropzone's 2px
  blue-violet ring and faint pink fill (`24045:21667`). The ring follows the
  inner 24px-radius surface, leaving the outer 6px frosted frame untouched.
  Leaving or dropping clears the highlight; dragging text does not activate it.
  Legacy dropped images, PDFs and Markdown files reuse the Add menu's attachment
  builder and assistant handoff, preserving the draft without auto-sending.
  AO inputs use the shared input's AO file allowlist and 100 MB per-file limit;
  selected or dropped attachments remain local until explicit Send.
  Unsupported or unreadable files produce an explicit error.
  Shared buttons retain their keyboard focus indicators, and forced-colors
  mode provides a system-color focus outline for the prompt.
  Dimensions, spacing, prompt text, actions and assistant handoff are unchanged.
  Processing shows a spinner and "Working on your question, please wait..."
  in both composers. Inputs and Add are disabled until processing finishes.
  Stop and approval controls remain available in the left chat.
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
- The prompt's Send button opens the site's existing assistant and submits
  immediately, adding any retained attachments before sending through the public
  `setPrompt(..., { autoSend: true })` API. The existing EW/chat flags still apply.
  Enter sends; Shift+Enter inserts a newline, and IME composition
  does not submit. The same chat instance/session is reused after closing and
  reopening its panel. A different unsent draft in the left composer is never
  overwritten: the landing draft and attachments remain available for retry.
  Only accepted submission clears the central input. During processing,
  even a hidden left panel keeps the central textarea and Add menu disabled.
  The working state follows Figma `3231:202678`: the center retains a faint
  16% pastel tint and 12% diffused hue, while the left input stays neutral.
  Neither has a colored inner ring. Both show an enabled Stop button.
  The central Stop calls the same mounted chat's public `stop()` method;
  either Stop cancels that response, and the next input-state update restores
  both composers without clearing retained drafts or sending another message.
  There is no queue.
  Landing consumes the public `inputState`/`INPUT_STATE_CHANGE` contract and
  opts the left chat into `showInputStatus`; it does not inspect a controller.
  Panel opening and file reading have separate, announced loading states,
  with their text beside the spinner in the composer's input row.
  The Figma AI icon (`3231:201857`) appears above the existing left-menu links.
  It opens the same chat without sending or clearing the central draft, remains
  available during processing, and is disabled on sites without chat.
  Site changes cancel pending panel loads, remove the old chat and its listener,
  and clear the old draft/attachments before rechecking the site's chat flags.
  Failed loads retain the draft and readable attachments for retry.
  The panel's initial width is 320px; existing user-resized widths remain respected.
  This integration requires Nexter's shared chat changes for the public
  input-state, safe draft acceptance and panel-cancellation contracts.
  The coworker icon, prompt placeholder and AI disclaimer follow the mock.
  Both middle inputs use 16px text in S and 18px in M.
  Both use `--s2-gray-600` for the placeholder in each theme.
  The plus button opens the existing Add menu locally. The AO input retains its
  shared prompt/menu behavior. Files or images opens the native picker; cancelling
  does not open chat. Selected files use the existing attachment builder and
  shared add-to-chat event on handoff, without uploading or auto-sending merely
  by selecting files. AO prompts and commands stay in the shared central input;
  parent-owned actions continue in the existing assistant through `openAddAction(id)`,
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
Verify chat availability after changing sites. On a writable test site, send a
prompt with Enter or Send: the left conversation starts without another Send.
Check that Opening chat appears beside its spinner, not below it. Click the AI
menu icon to reopen the same conversation without submitting another message.
Shift+Enter stays multiline. Attach a Markdown file or image and
confirm one pill per file. Leave another draft in the left input and confirm
that a central handoff preserves both drafts rather than replacing it.
Send only on a separate writable test site: both inputs should show the working
message, faint center tint and neutral left input, disable Add, and offer Stop. Cancel once from
the middle and once from the left: each should stop the same response, restore
both inputs, and preserve any unsent draft without sending another message. Closing the
panel must not unlock the central input during processing. Open/close without
changing sites preserves the conversation. Switching sites during loading or
file reading must not open the old chat or copy the old draft into the new site.
With a failed chat-module request, the central draft and readable attachments
remain available to retry. Check these flows in light/dark mode and a narrow
window. Live S/M integration remains separate from the `lp` shell.
The unparameterized Browse and Canvas routes should retain their existing UI.
