---
name: page-proposals
description: Only in the Experience Workspace context, stage proposed DA page edits without changing originals, then render a composed A2UI review list with native canvas View diff actions.
---

# Propose page changes in Coworker

Use this flow only when the current session is explicitly in the
**Experience Workspace** context and a user requests changes to one or more DA
pages for review. Confirm that context from the host-provided session context
before copying or modifying files or emitting the review UI. Having DA content
tools available does not by itself establish the Experience Workspace context.
If the context is different or cannot be confirmed, do not apply this staging
or A2UI flow; follow the workflow appropriate to that context instead.

Use the content tools available in the current Coworker session; do not invent
tool names or write only to the agent's private filesystem.

## Stage before editing

1. Establish the current DA organization, site, requested pages, and requested edits.
   Read the original source and preserve its document structure, blocks, metadata,
   links, and unrelated content.
2. Copy each source file from `/<org>/<site>/<path>.html` to
   `/<org>/<site>/.da/<path>.html`. Here `/.da/<path>` is site-relative **DA content
   storage**, not a local filesystem directory. Preserve the path below the site,
   including folders and the `.html` suffix. For example:
   `/example/site/campaigns/spring-2026.html` becomes
   `/example/site/.da/campaigns/spring-2026.html`.
3. Check for an existing staged copy before copying. Do not overwrite another
   proposal. Reuse an existing copy only when it belongs to this task; otherwise
   ask the user how to handle the conflict.
4. Apply the requested modifications **only to the staged copy** using the
   available DA content tools. Save it there and read it back to verify the result.
   Do not modify the original, preview, publish, or delete content as part of this
   staging flow. Do not present a proposed file as ready until its save succeeds.
5. Emit the review UI as a native A2UI artifact, not a JSON code fence. Include
   only successfully staged pages. If the artifact tool is unavailable, provide
   a text summary and staged paths; do not claim interactive controls exist.

The copy starts with the current source, which can include unpublished edits.
The comparison baseline is the original page's **currently published live**
version, not a snapshot of the source before editing. Explain this distinction
when it matters. An unpublished page has an empty live baseline.

## Compose the review UI

Use flat component records with unique IDs and a `root` Column. Compose a heading
Row, count Badge, Divider, one Column per page (title, original path, actions),
and a footer. The supported primitives are Column, Row, Text, Badge,
ActionButton, Link, Button, and Divider. Repeat the entry pattern for all pages
and update the count. Use literal text and supported layout fields.

View diff needs this explicit action; its label is not a command:

```json
{
  "id": "page1-diff",
  "component": "ActionButton",
  "label": "View diff",
  "icon": "Layers",
  "action": {
    "event": {
      "name": "editor.viewDiff",
      "context": {
        "proposedPath": { "path": "/components/page1-proposal/text" }
      }
    }
  }
}
```

The `proposedPath` parameter refers to a literal Text record in the **same
artifact**. Store the full staged DA path there, with `.html`:

```json
{
  "id": "page1-proposal",
  "component": "Text",
  "text": "/example/site/.da/campaigns/spring-2026.html",
  "visible": false
}
```

These are host-defined component-ID references, not array indexes or a general
A2UI data model. Reference IDs must use letters, digits, hyphens, or underscores.
Do not pass a URL, raw HTML, a local filename, a literal string in event context,
or an invented `dataModel` field. Keep the hidden Text record in the components
array; it does not need to be a child of root.

Canvas checks the event name, artifact/component identity, reference, and path.
Only staged HTML pages in the current org/site are allowed. It strips `/.da/`
to derive the original page, reads that page's live delivery and the staged DA
source, sanitizes them, and displays a read-only comparison. It does not navigate
to, save, accept, preview, or publish either page. Clicking View diff is handled
by the browser host, not another Coworker turn. Refresh rereads both resources,
so this is not a revision-pinned comparison.

Only View diff is implemented. Omit Collapse. If including Reset page or Accept
changes for the mock's layout, mark them `isDisabled: true` and give them no
action. Do not invent reset/accept handlers. Include a Preview link only if a real,
verified preview URL exists; do not create or imply a preview during staging.

## Example artifact components

Pass these records to the artifact tool's components field (the wire surface is
`a2ui_surface.components`), replacing example content with the actual staged
pages. Supply a text fallback listing the original and staged paths.

```json
[
  { "id": "root", "component": "Column", "width": "full", "padding": 16, "gap": 8, "children": ["header", "divider", "page1", "footer-divider", "footer", "accept"] },
  { "id": "header", "component": "Row", "gap": 8, "align": "center", "children": ["heading", "count"] },
  { "id": "heading", "component": "Text", "text": "Proposed changes", "style": "heading", "size": "sm" },
  { "id": "count", "component": "Badge", "label": "1 page staged", "variant": "informative", "fillStyle": "subtle", "size": "S" },
  { "id": "divider", "component": "Divider" },
  { "id": "page1", "component": "Column", "width": "full", "gap": 4, "children": ["page1-title", "page1-path", "page1-actions"] },
  { "id": "page1-title", "component": "Text", "text": "Spring Campaign Landing", "style": "ui", "size": "sm" },
  { "id": "page1-path", "component": "Text", "text": "/campaigns/spring-2026", "style": "detail", "size": "xs", "wrap": "truncate" },
  { "id": "page1-actions", "component": "Row", "gap": 8, "children": ["page1-diff", "page1-reset"] },
  { "id": "page1-diff", "component": "ActionButton", "label": "View diff", "icon": "Layers", "action": { "event": { "name": "editor.viewDiff", "context": { "proposedPath": { "path": "/components/page1-proposal/text" } } } } },
  { "id": "page1-proposal", "component": "Text", "text": "/example/site/.da/campaigns/spring-2026.html", "visible": false },
  { "id": "page1-reset", "component": "ActionButton", "label": "Reset page", "icon": "Delete", "isDisabled": true },
  { "id": "footer-divider", "component": "Divider" },
  { "id": "footer", "component": "Text", "text": "Original pages unchanged. Proposals are staged under /.da/. Accept and reset are not available yet.", "style": "detail", "size": "xs" },
  { "id": "accept", "component": "Button", "label": "Accept changes", "variant": "accent", "isDisabled": true }
]
```

Interactive review requires the supporting da-live canvas host and da-nx chat
renderer. It is not enabled by uploading this skill alone. Existing artifacts
without action definitions remain disabled. Other chat hosts can render this
artifact but cannot execute View diff without a host handler.
