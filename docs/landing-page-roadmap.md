# Landing page: demo and production backlog

Started 2026-10-20. This is a prioritized backlog, not a commitment to complete
production features before this week's demo. Implementation details and preview
links are in [Landing page MVP](landing-page.md).

## Current baseline

Files and document previews use real source content. Recent currently means
recently modified root files, not personal recently opened history. Stars are
browser-local and origin-specific, not account-synced. Both `lp` and `devlive`
have five labelled sample task rows, not a connected task feed. `lp` uses the
smaller logo and Adobe Experience Manager title consistently across the shell.
`devlive` retains the original logo and Author lockup pending approval.

## P0: this week's demo

- [x] Fix Adobe-logo/Home navigation back to the landing preview. Preserve the
  selected workspace and applicable preview parameters without changing normal
  Home navigation for other consumers. The shell's generic `homeHref` setting
  is shared by the logo and sidebar Home. Browse/editor links use `landing=home`
  to retain the opt-in destination without replacing those views with landing.
  Internal page links and sidebar fragments preserve the preview flags too, so
  Apps and Marketplace do not silently switch back to the default shell.
- [x] Match the smaller Figma logo: a 24px mark in a 32px branding container
  (`2301:183989`), with "Adobe Experience Manager" at 14px/700/18px
  (`1852:85587`). Preserve an accessible click target and the existing header
  arrangement; do not restore the rejected replacement header. The `lp` shell
  owns this branding across pages rather than mounting it from the landing
  component. Do not transfer it to `devlive` before review and approval.
- [ ] Tighten the existing site-switcher styling against Figma `1852:84079`:
  compact 32px control, 14px bold label, pill border and 10px chevron. Review its
  open, selected and keyboard-focus states against the approved picker design.
  Keep real site identifiers where friendly names/domains are not available.
- [ ] Use different greetings for chat-enabled and chat-disabled sites. Reuse
  the existing EW/chat flags rather than adding a new availability service.
  Confirm the no-chat wording with design; do not promise assistant help when
  chat is disabled. Distinguish loading and failed flag checks from disabled chat.
- [ ] Audit page, content-fragment, table/spreadsheet and image icons in both
  grid and list views. The four Figma assets and basic mappings already exist;
  fix remaining visual or known-type mapping discrepancies, not a new icon set.
  Do not infer content fragments solely from folder names or `.json`.
- [ ] Agree on the demo branch, content site and signed-in account. Verify access
  and assistant flags. Do not write to shared demo content during rehearsal.
- [x] Bring the sample task rows to `devlive`. Keep the sample
  label and disabled column controls; do not imply a real task integration.
- [ ] Rehearse with real authenticated services: workspace selection, files,
  grid/list, stars, thumbnails, and assistant draft/attachment handoff. Confirm
  that opening chat never sends a prompt automatically.
- [ ] Check the presentation viewport, light mode, an empty site and unavailable
  previews. Fix demo blockers; defer new infrastructure and large redesigns.

### UI-team call notes: 2026-10-19

The logo, site-switcher appearance, chat/no-chat greeting and file-type icon
audit above are bounded demo polish. Recommended order: Home navigation, logo
size, greeting states, picker polish, then icon verification. Review each batch
on `lp` before proposing a transfer to `devlive`.

The current site switcher is already functional. Its Figma trigger uses a
friendly site name and domain, but that display data must come from actual
configuration. A full site-discovery/search service is not required just to
polish the demo control. The opened-picker design and exact no-chat copy still
need confirmation before treating their details as approved requirements.

### Icon and branding notes: 2026-10-20

- [ ] Review the intended navigation destination for
  [Building Blocks (`1852:85477`)](https://www.figma.com/design/aliOqnaMYpvWLbnjrg5DFK/Experience-Workspace?node-id=1852-85477).
  This is `S2_Icon_BuildingBlocks_20_N`, a blocks/library navigation glyph.
  Do not substitute it for the content-fragment file-type icon or add a
  nonfunctional navigation item just to display it.
- [ ] Check the
  [Image glyph (`1852:85507`)](https://www.figma.com/design/aliOqnaMYpvWLbnjrg5DFK/Experience-Workspace?node-id=1852-85507)
  when reviewing image/asset navigation. It is `S2_Icon_Image_20_N`.
  Landing image files already use the local Figma `image.svg` in grid and list
  views, and shared Browse mappings use `s2-icon-image-20-n.svg`. Keep these
  existing mappings until a specific visual or destination mismatch is confirmed.
- [ ] Confirm page, fragment, table and image semantics with authoritative
  source metadata, especially content fragments versus generic JSON.
- [ ] Before production, source the Experience Cloud logo from the approved
  A4U app-icon package referenced by Figma and obtain the approved Adobe Clean
  Spectrum VF font. The `lp` logo is the downloaded Figma SVG; the title uses
  the existing shared Adobe Clean fallback with the specified size and weight.

The demo table now starts with Frescopa Homepage translation. Other rows cover
product copy, taste-profile review, product details and campaign publication,
with fictional requester names. These are still labelled sample tasks.

## P1: product correctness after the demo

- [ ] **Define and implement Recent.** Agree whether this means personal recent
  activity or recently modified content. If personal, persist actual open events
  with timestamps under the signed-in account. Support nested content, dedupe
  entries and recheck permissions instead of treating a root listing as history.
- [ ] **Account-synced favorites.** Identify an existing supported user-preference
  API before building storage. Scope favorites to account and workspace, persist
  across devices and application origins, and handle removed or inaccessible
  files. Define how existing local stars are migrated without crossing accounts.
- [ ] **Real Need Attention integration.** Agree on the task source, ownership and
  data contract with the team. Load authorized tasks, descriptions, statuses and
  requesters; connect task navigation and supported actions. Implement meaningful
  column menus, sorting/filtering and empty/error states. Remove sample rows from
  the production experience. Do not equate background jobs with user tasks.
- [ ] **Complete workspace and file scope.** Discover sites the user can access,
  not just browser-local recent sites. Define root versus nested/cross-site
  coverage. Keep switching, deep links and back/forward navigation consistent,
  and prevent responses from a previous workspace appearing in the new one.
  Resolve friendly site names and domains from supported configuration; add
  richer picker search/grouping only if the approved design requires it.
- [ ] **Reliable semantic file types.** Confirm how source APIs identify pages,
  content fragments, tables and images. Reuse or preserve authoritative type
  metadata through normalization. Handle ambiguous JSON and unknown types
  explicitly so the correct icon does not depend on a filename guess.
- [ ] **Match assistant promises to capabilities.** Define what landing-page
  routing should actually do. Either connect the supported app/tool routing or
  adjust the copy. Preserve draft, attachment and no-auto-send behavior, with
  explicit disabled, unavailable and failure states.

## P2: professional-quality release gate

- [ ] **Reliable thumbnails.** Agree whether the product needs source-derived
  mini-previews or rendered-page screenshots. Cover private/unpublished content,
  inaccessible or relative image URLs, stale previews and supported file types.
  Keep clear fallbacks and never execute source HTML inside the landing page.
- [ ] **Design sign-off.** Close remaining gaps against the approved Figma states
  using shared components, tokens, icons and approved font assets. Review real
  content lengths and loading, empty, error, hover, focus and disabled states in
  both grid and list views, light/dark modes and S/M sizing.
- [ ] **Accessibility and responsive behavior.** Target WCAG 2.2 AA. Verify
  keyboard navigation, menu focus/escape behavior, screen-reader labels and table
  semantics, contrast, zoom and touch targets. Do not communicate status by color
  alone. Keep workspace selection usable at narrow widths.
- [ ] **Scale and performance.** Measure representative large sites and agree on
  budgets before optimizing. Avoid loading every file or full document merely
  to show a small landing page. Retain lazy previews and request reuse; use
  supported paginated/query APIs and caching where needed.
- [ ] **Production confidence.** Add real-backend integration coverage alongside
  unit and browser-fixture tests, plus targeted visual regressions. Cover expired
  sessions, permission changes, failed requests and workspace changes. Make
  failures diagnosable without logging sensitive content. Agree on rollout and
  rollback behavior while preserving existing Home/Browse consumers.

## Working agreement

Use `lp` for review first. Changes reach Martin's `devlive` branches only with
explicit approval. Before implementing a backlog item, confirm its owner,
acceptance criteria and existing API/component support. Update this list as
design and engineering decisions are made.
