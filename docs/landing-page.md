# Landing page MVP

The existing Browse page opts into the landing page with `?landing=true`.
Without that parameter, Home, Browse and Canvas are unchanged.

After publishing the `lp` branch, open:

```text
https://lp--da-live--adobe.aem.live/?landing=true&theme=light&nx=lp&quick-edit=devlive#/aemsites/devlive
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
  The `lp` Nexter branch supplies optional brand/actions slots with unchanged
  fragment fallbacks. Landing-owned branding and actions are removed on disconnect.
  What’s New and Feedback reuse the existing Nexter components and real fragments.
  Notifications open an explicit unconnected-data notice without an invented count.
  Site labels retain real identifiers; no Nike name or custom domain is fabricated.
- Files are the selected site's **root directory**, not a recursive site index.
  All root-listing pages are loaded before sorting by modification date.
- The mock's Recent tab shows recently modified files, not personal
  recently opened history. The root scope is not added as a visible subtitle.
- Starred uses the existing browser-local `da-favorites` entries for that root.
  Favorites in nested folders are outside this first version.
- Images reuse browse-v2's lazy previews. Pages opt into read-only, source-backed
  document thumbnails (heading, representative image and excerpt), not screenshots
  of the published site. Source HTML is never inserted into the live DOM or executed.
  These additions are opt-in and do not change ordinary Browse previews.
  Preview failures are identified rather than presented as successful thumbnails.
- The Figma Ready Recent frame (`1852:83848`) supplies the gradient artwork and
  semantic page, fragment, image and spreadsheet assets. Panels use its 1068px
  desktop width, 16px radius, translucent fill and three-layer shadow. The composer
  uses its 664px desktop width, 109px idle height and layered gradient treatment.
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
  The plus button continues in chat, where attachments are already supported.
- The Need Attention table uses the Process Description heading and a 32px
  header, but explicitly states that task data is not
  connected. This is not an assertion that the selected site has no tasks.
  Existing scheduler, translation and background-job APIs are not a source
  for the mock's general task list (description, status, requester).
  Table styling follows the [Spectrum table guidance](https://spectrum.adobe.com/web/rsp/components/table):
  start-aligned text, a compact neutral header, column dividers and horizontal
  scrolling on narrow screens. No nonfunctional sort or column-menu controls
  are added while task data is unavailable.
- Notification counts, published-page screenshots and global AI routing are not
  mocked. The routing placeholder does not add a global routing backend.

## Shared demo safety

The `lp` branch changes only the application code, not `devlive` code or content.
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
