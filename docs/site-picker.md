# Shared site selector

Nexter's `nx-siteselector` owns the UI. DA's `blocks/shared/site-picker.js`
owns recent history, access checks, Add and hash routing.

The Nx2 bootstrap listens for `site-selector-ready` and lazily loads the adapter.
The listener is installed before navigation loads. Pages without a selector do
not load the adapter or change their navigation.

Hosts can add `siteselector` to an authored navigation fragment's site-nav list,
or load the component independently. The selector emits `site-selector-ready`
with `{ selector, signal }` on each connection. Removal aborts the signal and
releases the adapter's listeners, requests and dialog.

The adapter supplies `sites` as `{ value: 'org/site', label: 'Site, org/site' }`
entries and `value` from the current hash. It handles `site-select`, `site-add`
and `site-retry`. Hosts own `heading`, placement and page-specific integration.
DA defaults to size S (14px/18px bold trigger text), preserving an explicitly
authored M size (16px/20px). Recent history does not select a site on an unscoped URL.
Menu presentation belongs to Nexter's shared navigation picker variant, not
application CSS or a custom nav slot.

Recent sites use the existing browser-local `da-sites` history. An unscoped
route stays unselected. Switching sites preserves query parameters and never
prunes history because of denied access. Failed storage or uncertain access
checks produce an explicit error and retry.

`site-access.js` validates existing AEM URLs and site access. `add-site.js`
provides the lazy Add dialog. Adding remembers an accessible existing site;
it does not create sites, grant access or write backend configuration.
Only an explicit organization-config `write` grant exposes Create new site.

## Testing

Open `/docs/site-picker.html?nx=<nexter-branch>`. The example uses the real
DA adapter and API, not sample sites. Sign in through the profile menu to
check authenticated access. Recent history is separate for each browser origin.
Select a site to test routing; Add validates an existing AEM URL.

Nexter's style guide provides sample S/M controls and light/dark styling checks.
Merge Nexter support first; production uses the normal Nexter URL without a
branch pin. Landing layout, branding and mounting remain separate on `lp`.
