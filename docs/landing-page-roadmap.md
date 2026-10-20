# Landing page: demo and production backlog

Started 2026-10-20. This is a prioritized backlog, not a commitment to complete
production features before this week's demo. Implementation details and preview
links are in [Landing page MVP](landing-page.md).

## Current baseline

Files and document previews use real source content. Recent currently means
recently modified root files, not personal recently opened history. Stars are
browser-local and origin-specific, not account-synced. Only `lp` has the five
labelled sample task rows; Martin's `devlive` branch has no connected task feed.

## P0: this week's demo

- [ ] Fix Adobe-logo/Home navigation back to the landing preview. Preserve the
  selected workspace and applicable preview parameters without changing normal
  Home navigation for other consumers.
- [ ] Agree on the demo branch, content site and signed-in account. Verify access
  and assistant flags. Do not write to shared demo content during rehearsal.
- [ ] Decide whether to bring the sample task rows to `devlive`. Keep the sample
  label and disabled column controls; do not imply a real task integration.
- [ ] Rehearse with real authenticated services: workspace selection, files,
  grid/list, stars, thumbnails, and assistant draft/attachment handoff. Confirm
  that opening chat never sends a prompt automatically.
- [ ] Check the presentation viewport, light mode, an empty site and unavailable
  previews. Fix demo blockers; defer new infrastructure and large redesigns.

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
