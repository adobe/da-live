# Devlive demo

The `devlive` branches in `adobe/da-live` and `adobe/da-nx` combine the Canvas
extension drag-and-drop flow from `qedrop` and `feat/quick-edit-table-drop` with
the block-configuration sidebar from `blocktab`.

Open either document with both Nexter and the preview's quick-edit plugin pinned
to `devlive`:

- [Draft demo](https://devlive--da-live--adobe.aem.live/canvas?nx=devlive&quick-edit=devlive#/exp-workspace/frescopa/drafts/hhertach/test)
- [Index demo](https://devlive--da-live--adobe.aem.live/canvas?nx=devlive&quick-edit=devlive#/exp-workspace/frescopa/index)

Sign in with access to the site. In Layout or Split view, open an extension in
the tool panel and drag its HTML/block content into the page preview. The
insertion line marks the drop position. Image-file drops can replace preview
images; AEM asset extensions require the site's repository configuration.

Select a block in the preview or document, then use its toolbar's configuration
action to open the **Block** sidebar. Selection alone does not switch the
sidebar. The sidebar supports variants and library-defined fields, including
text, links, images, and repeating items. Field controls require matching block
library metadata; use **Generate fields** and then **Refresh** where offered.

Drops and configuration edits change the document. Use the draft for demos that
should not alter the index page.
