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

After publishing the `lp` branch, open:

```text
https://lp--da-live--adobe.aem.live/?landing=true&theme=light&nx=lp&quick-edit=devlive#/aemsites/devlive
```

After integration into Martin's `devlive` branches, use:

```text
https://devlive--da-live--adobe.aem.live/?landing=true&theme=light&nx=devlive&quick-edit=devlive#/aemsites/devlive
```

Add `&theme=light` for a light-mode preview without changing the saved theme.
The override applies only while this landing page is present.

Use `nx=ui-size-scale` to exercise the live S/M sizing from adobe/da-nx#816.
The landing page uses its `UISizeController`, text tokens, shared button classes
and explicitly sized picker/segmented controls, following adobe/da-live#1416.
It also runs on the current shell at the default size, without importing a
missing sizing module. Neither sizing PR is modified or merged by this work.

## Scope

- The workspace dropdown is mounted in the existing navigation slot and lists
  browser-local recent sites, the site in the hash, and a Browse sites action.
  It is removed when the landing page disconnects and retains the topbar size.
  The shared picker's field variant provides the full clickable pill, 32px
  height, fixed 14px topbar text and right-aligned chevron. Its border and
  background are on the actual trigger, not the noninteractive host.
  Navigation, What’s New, Feedback and the profile retain their existing
  fragment-driven appearance. Only the brand uses the shell's optional `brand`
  slot: the 24px Experience Cloud mark in a 32px container, followed by
  "Adobe Experience Manager" at 14px, weight 700 and 18px line height
  (`2301:183989`, `1852:85587`). It reuses the scoped Adobe Clean font; exact
  Spectrum VF font parity still needs the approved font asset. The label is
  hidden below 600px while the accessible Home link and logo remain.
  The brand link preserves the selected workspace and preview parameters.
  Removing the landing page restores the normal fragment brand. There is no
  replacement header or notification trigger.
  The outer application-frame border is removed only while the landing page
  is present, matching the borderless Figma canvas.
  Site labels retain real identifiers; no Nike name or custom domain is fabricated.
- Files are the selected site's **root directory**, not a recursive site index.
  All root-listing pages are loaded before sorting by modification date.
- The mock's Recent tab shows recently modified files, not personal
  recently opened history. The root scope is not added as a visible subtitle.
- Starred uses the existing browser-local `da-favorites` entries for that root.
  Favorites in nested folders are outside this first version.
  Its 24px translucent control uses the Figma grey filled star, placed at the
  lower-left of the card preview. The same control works in list rows.
- List view is a separate semantic table, not a single-column stack of cards.
  It follows `1852:84732`: Name, Folder, Modified at, Modified by and a star action,
  a 40px header and 56px rows. Modifier names come from the source metadata
  `x-last-modified-by` header, loaded only for visible list rows and retained
  until the site listing is refreshed. Missing or unreadable metadata is marked
  unavailable; no author names or profile photos are invented.
- Images reuse browse-v2's lazy previews. Pages opt into read-only, source-backed
  document thumbnails (heading, representative image and excerpt), not screenshots
  of the published site. Source HTML is never inserted into the live DOM or executed.
  These additions are opt-in and do not change ordinary Browse previews.
  Preview failures are identified rather than presented as successful thumbnails.
- The Figma Ready Recent frame (`1852:83848`) supplies the gradient artwork and
  semantic page, fragment, image and spreadsheet assets. Panels use its 1068px
  desktop width, 16px radius, translucent fill and three-layer shadow. The composer
  uses its 664px desktop width, 109px idle height and layered gradient treatment.
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
- The prompt opens the site's existing assistant and fills its composer.
  It does **not** auto-send. The existing EW/chat flags still apply.
  The coworker icon, prompt placeholder and AI disclaimer follow the mock.
  The composer uses `--s2-body-size-m` (16px) at both UI sizes and
  `--s2-gray-600` for the placeholder, including dark mode.
  The plus button opens the existing Add menu locally and remains a plus
  while open. Files or images opens the native file picker directly; cancelling
  does not open chat. Selected files use the existing attachment builder and
  shared add-to-chat event, without uploading or auto-sending. Other selected
  actions continue in the existing assistant through `openAddAction(id)`,
  supported by both `nx-chat` and `nx-chat-ao`. Typed drafts are preserved.
- The Need Attention table uses the Process Description heading and a 32px
  header, a separate 46px heading area and a white 6px-radius table surface,
  following `1852:85554`. The `lp` preview includes five static Frescopa-themed
  sample rows: Frescopa Homepage, Atelier Nova, Taste Profiles, Coffee Machines
  and Atelier Nova Campaign. Homepage translation stays first, followed by
  content review, product updates and campaign publication. Requesters use
  fictional names, not real task assignments. Status dots and the design's
  20px placeholder avatars from `1852:86574` retain the 40px row layout, with
  more width for requesters.
  These illustrative labels are not verified source paths or a site-specific feed.
  The table is explicitly labelled as sample
  data, not live site tasks. Rows do not open or update real content.
  Existing scheduler, translation and background-job APIs are not a source
  for the mock's general task list (description, status, requester).
  Table styling follows the [Spectrum table guidance](https://spectrum.adobe.com/web/rsp/components/table):
  start-aligned text, a compact neutral header, column dividers and horizontal
  scrolling on narrow screens. Each header includes the 18px vertical
  three-dot column-options icon from `1852:86574`. These controls are explicitly
  disabled for the sample rows, rather than offering fake actions.
- Notification counts, published-page screenshots and global AI routing are not
  mocked. The routing placeholder does not add a global routing backend.

## Shared demo safety

The `lp` branch keeps preview code isolated. Explicitly integrating it into
`devlive` updates Martin's application code, but does not change site content.
Loading the landing page reads the site's listing and configuration; favorites
and view choices are browser-local. However, `aemsites/devlive` is shared content,
not a sandbox copy. Editing an opened file or sending a prompt in the assistant
can change that shared site. Use a separate content site for write testing.

## Manual checks

Sign in with access to the selected site. Check the greeting, site switching,
file navigation, Starred, card/list switching, Show all files and prompt handoff.
Switch S/M in the profile popover without losing the typed prompt or active
filter. Check dark mode, narrow layouts, keyboard focus and a site without chat.
The unparameterized Browse and Canvas routes should retain their existing UI.
