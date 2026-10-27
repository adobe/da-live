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
from browser-local recent sites and the current site. Its pure implementation
is in `site-picker-utils.js`, so data helpers need not import picker UI.
The current site remains
available even when it is outside recent history. Identifiers are real repository
identifiers, not invented friendly names or public domains.

The menu shows site names with `org/site` below them and marks the current site.
The trigger includes the organization to distinguish identically named sites.
Add site aligns with the menu's left padding, without reserving a checkmark column,
and emits an action without changing the selection.

Hosts own mounting and navigation. `blocks/shared/site-access.js` owns site access
checks, supported URL parsing, browser-local additions and the explicit
organization-config write-grant check. `blocks/shared/add-site.js` provides the
lazy-loaded Add dialog for both hosts.
Browse mounts the picker in the nav's left `context` slot, independently of its
centered `search` slot. It switches to a selected
site's root, and opens the shared Add dialog without leaving Browse. It preserves
the current URL's query parameters. Landing uses the same dialog and supplies its
own creation URL to preserve its Home navigation.
The picker does not create sites, change permissions, or discover account sites.
Browse removes both controls and its storage listener when disconnected.
Both hosts keep the current site and remembered recent sites as navigation
history, including when their content is inaccessible. Switching sites never
prunes remembered entries based on permission checks. Landing remembers the
current route before loading its files, matching Browse's history behavior.
Keeping an entry does not grant content access or bypass Add site validation.
Uncertain failures
remain visible with an explicit error; they are not treated as permission denials.
In-flight checks and additions are cancelled when their host/dialog is removed.
Invalid or unavailable recent-site storage produces an explicit alert while
keeping the current site, Add site and search available.

Anyone with access to an existing site can add it to this browser's recent list.
The dialog verifies both access and existence, including paginated organization
listings. Adding never creates a site, grants access or writes to the backend.
Only an explicit `write` action on the selected organization's configuration
response exposes Create new site. Content-write, child and inferred/fallback
permissions do not qualify. If admin lookup fails, creation stays hidden with
an error and retry; adding an existing accessible site stays available.

The production dependency is generic Nexter picker support for `description`,
menu CSS parts (including `action`) and the nav's independent `context` slot.
Release that support before merging the
application integration. Production code does not pin Nexter to a preview branch.
Landing integration remains on its review branch until the landing page is merged.
