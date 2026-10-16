# Landing page MVP

The existing Browse page opts into the landing page with `?landing=true`.
Without that parameter, Home, Browse and Canvas are unchanged.

After publishing the `lp` branch, open:

```text
https://lp--da-live--adobe.aem.live/?landing=true&nx=devlive#/aemsites/devlive
```

Use `nx=ui-size-scale` to exercise the live S/M sizing from adobe/da-nx#816.
The landing page uses its `UISizeController`, text tokens, shared button classes
and explicitly sized picker/segmented controls, following adobe/da-live#1416.
It also runs on the current shell at the default size, without importing a
missing sizing module. Neither sizing PR is modified or merged by this work.

## Scope

- The site picker lists browser-local recent sites and the site in the hash.
- Files are the selected site's **root directory**, not a recursive site index.
  All root-listing pages are loaded before sorting by modification date.
- Recently modified is not personal recently opened history.
- Starred uses the existing browser-local `da-favorites` entries for that root.
  Favorites in nested folders are outside this first version.
- Images reuse browse-v2's lazy previews; other files use their existing icons.
- Folders and link files open in Browse. Pages, sheets and media open in their
  editors, preserving the Nexter/quick-edit preview parameters.
- The prompt opens the site's existing assistant and fills its composer.
  It does **not** auto-send. The existing EW/chat flags still apply.
- Tasks, notification counts, rendered page thumbnails and global AI routing
  are intentionally not mocked.

## Manual checks

Sign in with access to the selected site. Check the greeting, site switching,
file navigation, Starred, card/list switching, Show all files and prompt handoff.
Switch S/M in the profile popover without losing the typed prompt or active
filter. Check dark mode, narrow layouts, keyboard focus and a site without chat.
The unparameterized Browse and Canvas routes should retain their existing UI.
