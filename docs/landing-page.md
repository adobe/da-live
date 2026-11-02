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

Add `&theme=light` for a light-mode preview without changing the saved theme.
The override applies only while this landing page is present.

Landing retains its S/M hooks and shared button classes.
The standalone picker uses matching S/M component tokens.
The `lp` shell does not include the live sizing runtime.
Sizing integration remains separate; neither adobe/da-nx#816 nor
adobe/da-live#1416 is modified or merged by this work.

The Content section is reviewed separately in adobe/da-live#1531. Its surface,
heading, controls, card/list presentation, file actions and UI tests are not
part of this landing shell.

## Component ownership

- Nexter owns the standalone `nx-siteselector` presentation in fragment-driven
  site navigation, separately from centered Browse search. da-live's
  `blocks/shared/site-picker.js` adapter owns browser history, routing, access
  checks and the shared permission-aware Add/Create dialog. Landing does not
  mount a picker or own its lifecycle. Site option formatting lives in `site-picker-utils.js`.
  No account-wide discovery or invented display metadata is added.

## Figma fidelity

The standalone selector uses the shared Nexter picker defaults, leading selected
checkmarks, two-line entries and matching S/M typography without app-level menu styling.
Its secondary line is the real org/site identifier, not a fabricated domain.

Friendly site names/domains, approved Spectrum VF fonts, published-page
screenshots and live task data remain data/asset dependencies. Existing
permission rules, Subtle composer states and live/sample notices are
intentional differences rather than substitutes for those missing inputs.

## Scope

- Opt-in NX2 pages (`landing=true` or `landing=home`) default to
  `/nx/fragments/nav-new-landing` before shell loading, unless an explicit
  `nav-path` is authored. The fragment mounts the standalone selector and lists
  browser-local recent sites and the site in the hash under **Your recent sites**.
  A divider separates the **Add site** action, replacing the old Browse sites
  detour. Add site lazily opens the shared dialog.
  Anyone can enter an existing AEM/Helix preview or live URL.
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
- The Figma Ready Recent frame (`1852:83848`) supplies the gradient artwork.
  The composer uses its 664px desktop width and 109px idle height. Its neutral translucent
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
  Labels use explicit component line heights.
- Adobe Clean regular/medium/bold are sourced from Spectrum’s public site and scoped
  to landing/navigation. The greeting requests the locally available Adobe Clean
  Display Semibold, falling back to Adobe Clean. The Figma Spectrum VF and Display
  font binaries were not supplied; exact font-family parity needs approved assets.
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
- Quick-action tiles are not included on `lp`; they are reviewed separately.
  Need Attention remains removed. Landing does not load the comment feed or
  probe page metadata for that removed table.
- Notification counts, published-page screenshots and global AI routing are not
  mocked. The routing placeholder does not add a global routing backend.

## Shared demo safety

The `lp` branch keeps preview code isolated. Explicitly integrating it into
`devlive` updates Martin's application code, but does not change site content.
Loading the landing page reads the site's listing and configuration.
However, `aemsites/devlive` is shared content,
not a sandbox copy. Editing an opened file or sending a prompt in the assistant
can change that shared site.
Use a separate content site for write testing.

## Manual checks

Sign in with access to the selected site. Check the greeting, site switching
and prompt handoff.
Open Add site from the picker. Check a valid existing URL,
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
