# Shared site selector

Nexter's `nx-siteselector` owns the UI, recent history, access checks, selection
and the lazy Add dialog. DA owns only its creation destination and page reactions.
No DA adapter is needed for the common selector workflow.

The Nx2 bootstrap listens for `site-selector-ready` and lazily loads
`blocks/shared/site-selector.js` to configure the `/start` creation destination.
The listener is installed before navigation loads. Pages without a selector do
not load that host policy or change their navigation.

Hosts can add `siteselector` to an authored navigation fragment's site-nav list,
or load the component independently. The selector emits `site-selector-ready`
with `{ selector, signal }` on each connection. Removal aborts the signal and
releases Nexter's listeners, requests and dialog.

Nexter supplies `sites` as `{ value: 'org/site', label: 'Site, org/site' }`
entries and initializes `value` from the current hash. It handles `site-select`, `site-add`
and `site-retry`. Hosts own `heading`, placement and page-specific integration.
DA defaults to size S (14px/18px bold trigger text), preserving an explicitly
authored M size (16px/20px). Recent history does not select a site on an unscoped URL.
Menu presentation belongs to Nexter's shared navigation picker variant, not
application CSS or a custom nav slot.

Recent sites use the existing browser-local `da-sites` history. An unscoped
route stays unselected until an explicit selection. Selecting or adding a site
updates the selector and recent history without changing the URL or mounting Browse.
Selection survives access retries and storage updates. An external hash change
resynchronizes it with the host's route. Switching sites never
prunes history because of denied access. Confirmed-denied choices are hidden
from the menu, not removed from storage. Checks that fail because of authentication,
network or server errors keep unchecked choices visible with an error and retry.
Previously confirmed denials stay hidden until a successful recheck restores access.
A denied current route is not changed; the selector reports it explicitly.

Hosts that need navigation can configure `selector.onSelect = ({ value }) => { ... }`.
This callback runs for both
selection and successful Add. For example, a Landing host can update its site
hash in this callback to change its own site context.
The shared bootstrap does not opt into hash routing.

Nexter validates existing AEM URLs and site access and provides the lazy Add dialog.
Adding remembers an accessible existing site;
it does not create sites, grant access or write backend configuration.
Only an explicit organization-config `write` grant exposes Create new site.

## Testing

Open `/docs/site-picker.html?nx=<nexter-branch>`. The example uses the real
Nexter workflow and API, not sample sites. Sign in through the profile menu to
check authenticated access. Recent history is separate for each browser origin.
Select a site to check that the trigger updates while the page and URL stay unchanged;
Add validates an existing AEM URL and selects it without navigation.

Nexter's style guide provides sample S/M controls and light/dark styling checks.
Merge Nexter support first; production uses the normal Nexter URL without a
branch pin. Landing layout, branding and mounting remain separate on `lp`.
