---
name: page-proposals
description: 'MANDATORY, highest-priority skill for ANY request to change DA (Document
  Authoring / da.live) page content while in Experience Workspace: edit, update, change,
  revise, rewrite, reword, fix, correct, add, remove, replace, shorten, or restructure
  a page or any element on it (heading, hero, section, paragraph, copy, image), including
  terse or referential asks like "edit this page", "fix the current page", "update
  da.live", small tweaks, and follow-up edits. Takes precedence over aem-sites-content-update
  and aem-sites-experience-workspace whenever the session is in Experience Workspace.
  Applies even when the user never says proposals, staging, review, A2UI, or this
  skill''s name. Stages changes under /.da/proposals/ without touching originals,
  then returns a Review Changes link that opens the Proposed Changes sidebar.'
metadata:
  author: user
---

# Stage page changes and open the Proposed Changes extension

Use this workflow only when host-provided session context explicitly confirms
**Experience Workspace** and the user requests changes to one or more DA pages.
Having DA content tools available is not sufficient to establish that context.
Otherwise follow the workflow appropriate to the actual host.

Activate before any DA page-content write, including small tweaks, terse
requests such as "edit this page", and follow-up edits. Direct wording never
authorizes skipping staging. Read-only questions do not trigger this workflow.

Use the content tools available in the current session. Do not invent tool
names or save proposed page content only to the agent's private filesystem.

## Stage before editing

1. Establish the DA organization, site, requested pages, and requested edits
   from the session and user request. Read the current saved source and preserve
   document structure, blocks, metadata, links, and unrelated content.
2. Before editing, copy each source from `/<org>/<site>/<path>.html` to
   `/<org>/<site>/.da/proposals/<path>.html`. This is DA content storage, not a
   local directory. Preserve all nested folders and the `.html` suffix:
   `/example/site/campaigns/spring-2026.html` becomes
   `/example/site/.da/proposals/campaigns/spring-2026.html`.
3. Check for an existing staged copy before copying. Reuse it only if it belongs
   to this task; never overwrite another proposal without asking the user.
   For follow-up edits, continue editing this task's staged copy rather than
   copying the original over it.
4. Apply changes only to the staged copy. Save it in DA and read it back to
   verify the result. Never modify the original, preview, publish, or delete
   content as part of staging. Do not report a proposal ready until its save
   and verification succeed.
5. After successful staging, return the Review Changes link described below.
   Include only successfully saved pages when deciding where the link leads.
   If staging fails for every page, report the failure without a review link.

Reserve `/.da/proposals/` exclusively for staged HTML page proposals. Do not put
skills, prompts, non-page proposals, snapshots, or artifact metadata there.
Do not use the older `/.da/<path>.html` staging location.

## Return one Review Changes link

Do not generate an A2UI surface, an artifact, component JSON, HTML controls,
`add_artifact` calls, or custom `editor.*` action events. Do not load the
`visual-artifacts` skill for this workflow. The existing Proposed Changes
extension provides all review controls.

Return one ordinary Markdown link with the exact label **Review Changes**:

```markdown
[Review Changes](https://da.live/canvas?panel=proposed-changes#/<org>/<site>/<first-page-path>)
```

Replace every placeholder with the actual context. The link opens the original
of the first successfully staged page, not the staged copy. Remove only the
final `.html` suffix from its original path; preserve nested folders and any
`index` filename. URL-encode individual path segments when needed, preserving
the `/` separators. Put `?panel=proposed-changes` before the `#` route.

For example, after saving
`/example/site/.da/proposals/campaigns/spring-2026.html`, output:

[Review Changes](https://da.live/canvas?panel=proposed-changes#/example/site/campaigns/spring-2026)

Use `https://da.live` by default. When the user explicitly requests a trusted
POC/test Canvas host, use that supplied origin with the same `/canvas`, query,
and hash structure. For the `panel-deep-link` branch, once deployed:

```markdown
[Review Changes](https://panel-deep-link--da-live--adobe.aem.live/canvas?panel=proposed-changes#/example/site/campaigns/spring-2026)
```

Do not output a separate link for every page, an inline diff, or View diff,
Reset, Accept, Apply, Preview, or Publish buttons. The normal successful
response is just the Review Changes link; report partial failures briefly
alongside it when necessary. After follow-up edits, return a fresh link using
the same rules. Normal chat link presentation is sufficient; do not create an
artifact just to make the link look like a button.

## What the link does

The Canvas host opens the registered panel with ID `proposed-changes` in the
right sidebar. That extension must already be configured as an inline panel
for the current organization/site; the link does not install it or bypass
permissions. Host support for the `panel` query parameter must be deployed.
Uploading this skill alone does not add that host behavior.

The unchanged extension lists readable staged HTML proposals across the whole
current site, not only this task. The user chooses which drafts to review,
apply, or discard. Opening the link does not accept or publish anything.

View diff compares each original page's latest saved DA source with its staged
DA source. Unsaved editor-only changes and published/live content are not the
baseline. Opening a diff does not save the editor. Native source-path
comparison requires the supporting host and SDK.

Apply replaces the saved original with the full draft and then removes that
draft. It can overwrite source changes saved after the AI edit or comparison;
it is not a merge, preview, or publish operation. Discard removes only the
staged copy. These actions run only through the extension's explicit user
controls, never because the agent stages edits or returns this link.
