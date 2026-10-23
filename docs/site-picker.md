# Shared site picker

`blocks/shared/site-picker.js` provides the application-owned site picker for
Browse v2 and Landing. It composes Nexter's existing `nx-picker`, including its
popover, keyboard navigation and selection handling. Site menu styling lives in
`blocks/shared/site-picker.css`, not in a Nexter site-specific variant.

```js
const picker = createSitePicker({
  onSelect: (value) => openSite(value),
  onAdd: () => openAddSite(),
});
updateSitePicker({ picker, sites, value: 'adobe/example' });
```

`sites` contains `{ value: 'org/site', label: 'site (org)' }` entries.
`getSiteOptions({ recentSites, current })` builds validated, deduplicated options
from browser-local recent sites and the current site. The current site remains
available even when it is outside recent history. Identifiers are real repository
identifiers, not invented friendly names or public domains.

The menu shows site names with `org/site` below them and marks the current site.
The trigger includes the organization to distinguish identically named sites.
Add site emits an action without changing the selection.

Hosts own mounting, navigation, site loading/access checks and Add site behavior.
Browse mounts the picker beside its existing nav search, switches to a selected
site's root, and opens the existing sites screen for Add site. It preserves the
current URL's query parameters. Landing retains its access-aware Add site dialog.
The picker does not create sites, change permissions, or discover account sites.
Browse removes both controls and its storage listener when disconnected.

The production dependency is generic Nexter picker support for `description`,
`leadingIcon` and menu CSS parts. Release that support before merging the
application integration. Production code does not pin Nexter to a preview branch.
Landing integration remains on its review branch until the landing page is merged.
