import { MenuItem, TextSelection } from 'da-y-wrapper';
import openPrompt from '../../../da-palette/da-palette.js';
import { markActive } from './menuUtils.js';

function defaultLinkFields() {
  return {
    href: {
      placeholder: 'https://...',
      label: 'URL',
    },
    text: {
      placeholder: 'Enter display text',
      label: 'Display text',
    },
    title: {
      placeholder: 'title',
      label: 'Title',
    },
  };
}

function findExistingLink(state, linkMarkType) {
  const { $from, $to, empty } = state.selection;
  if (empty) {
    const { node, offset } = $from.parent.childAfter($from.parentOffset);
    return {
      link: node,
      offset,
    };
  }
  let result;
  $from.parent.nodesBetween($from.parentOffset, $to.parentOffset, (node, pos) => {
    if (linkMarkType.isInSet(node.marks)) {
      result = {
        link: node,
        offset: pos,
      };
    }
  });
  return result;
}

function calculateLinkPosition(state, link, offset) {
  const { $from } = state.selection;
  const start = $from.pos - ($from.parentOffset - offset);
  return {
    start,
    end: start + link.nodeSize,
  };
}

function hasImageNode(contentArr) {
  if (!contentArr) return false;
  return contentArr.some((node) => node.type.name === 'image');
}

const linkPromptState = { lastPrompt: { isOpen: () => false } };

export function linkItem(linkMarkType) {
  const label = 'Edit link';

  return new MenuItem({
    title: 'Add or Edit link',
    label,
    class: 'edit-link',
    active(state) {
      return markActive(state, linkMarkType);
    },
    enable(state) {
      // Check if an image node is selected
      if (state.selection.node && state.selection.node.type.name === 'image') {
        return true;
      }

      const selContent = state.selection.content();
      const childCountOK = selContent.content.childCount <= 1;
      const imageNotInSelection = !hasImageNode(selContent.content?.content[0]?.content?.content);
      const linkActiveOrNotEmpty = !state.selection.empty || this.active(state);

      return childCountOK && linkActiveOrNotEmpty && imageNotInSelection;
    },

    run(initialState, dispatch, view) {
      if (linkPromptState.lastPrompt.isOpen()) {
        linkPromptState.lastPrompt.close();
        return;
      }

      const fields = defaultLinkFields();
      const { $from, $to, empty } = view.state.selection;

      const { node: selectionNode } = view.state.selection;
      const isImage = !!(selectionNode && selectionNode.type === view.state.schema.nodes.image);
      const imageNodePos = isImage ? view.state.selection.$from.pos : -1;

      let currentRangeStart = $from.pos;
      let currentRangeEnd = $to.pos;

      const contextHighlightingMarkType = view.state.schema.marks.contextHighlightingMark;

      if (!isImage) {
        if (this.active(view.state)) {
          const found = findExistingLink(view.state, linkMarkType);
          if (found?.link) {
            const linkPos = calculateLinkPosition(view.state, found.link, found.offset);
            currentRangeStart = linkPos.start;
            currentRangeEnd = linkPos.end;
            const linkMark = found.link.marks.find((m) => m.type === linkMarkType);
            fields.href.value = linkMark?.attrs.href || '';
            fields.title.value = linkMark?.attrs.title || '';
            fields.text.value = found.link.textContent || '';
          }
        } else if (!empty) {
          fields.text.value = view.state.doc.textBetween(currentRangeStart, currentRangeEnd);
          if (fields.text.value && /^(https|http|mailto):/.test(fields.text.value.trim())) {
            fields.href.value = fields.text.value.trim();
          }
        }
        if (fields.href.value && !fields.text.value) {
          fields.text.value = fields.href.value;
        }
      } else {
        fields.href.value = selectionNode.attrs.href || '';
        fields.title.value = selectionNode.attrs.title || '';
        delete fields.text;
      }

      const markToApply = contextHighlightingMarkType.create({});
      dispatch(view.state.tr
        .addMark(currentRangeStart, currentRangeEnd, markToApply)
        .setMeta('addToHistory', false));

      const promptFieldsConfiguration = { ...fields };
      if (isImage) {
        // Ensure 'text' field is not passed to prompt for images
        delete promptFieldsConfiguration.text;
      }

      const callback = (promptAttrs) => {
        let { tr } = view.state;
        if (isImage && imageNodePos !== -1) {
          const newImageHref = promptAttrs.href ? promptAttrs.href.trim() : null;
          const newImageTitle = promptAttrs.title ? promptAttrs.title.trim() : null;
          // Only update if href actually changed, and remove if it's cleared
          if (newImageHref !== view.state.doc.nodeAt(imageNodePos).attrs.href) {
            tr = tr.setNodeAttribute(imageNodePos, 'href', newImageHref);
          }
          // Update title attribute
          if (newImageTitle !== view.state.doc.nodeAt(imageNodePos).attrs.title) {
            tr = tr.setNodeAttribute(imageNodePos, 'title', newImageTitle);
          }
        } else {
          // Text link logic
          const newHref = promptAttrs.href ? promptAttrs.href.trim() : null;
          const newTitle = promptAttrs.title ? promptAttrs.title.trim() : null;
          const submittedText = promptAttrs.text !== undefined ? promptAttrs.text : '';

          if (!newHref && this.active(view.state)) {
            // If href is cleared and it was an active link, remove the mark
            tr = tr.removeMark(currentRangeStart, currentRangeEnd, linkMarkType);
          } else if (newHref) {
            let displayText = submittedText;
            if ((!displayText || !displayText.trim()) && newHref) {
              displayText = newHref;
            }

            const originalTextContent = view.state.doc.textBetween(
              currentRangeStart,
              currentRangeEnd,
            );
            const textChanged = displayText !== originalTextContent
              || (currentRangeStart === currentRangeEnd && displayText);

            if (textChanged) {
              const existingMarks = [];

              // Collect marks from the first character in the range
              if (currentRangeStart < view.state.doc.content.size) {
                const nodeAfter = view.state.doc.resolve(currentRangeStart);
                if (nodeAfter.parent.content.content.length > 0) {
                  const firstNode = nodeAfter.parent.content.content[0];
                  if (firstNode?.marks) {
                    firstNode.marks.forEach((mark) => {
                      if (mark.type !== linkMarkType) {
                        existingMarks.push(mark);
                      }
                    });
                  }
                }
              }

              // If no marks found from the first approach, try getting marks from the range
              if (existingMarks.length === 0) {
                view.state.doc.nodesBetween(currentRangeStart, currentRangeEnd, (node) => {
                  if (node.marks) {
                    node.marks.forEach((mark) => {
                      const markExists = existingMarks.find((m) => m.type === mark.type);
                      if (mark.type !== linkMarkType && !markExists) {
                        existingMarks.push(mark);
                      }
                    });
                  }
                });
              }

              // Create new text node with preserved marks
              const newTextNode = view.state.schema.text(displayText, existingMarks);
              tr = tr.replaceWith(
                currentRangeStart,
                currentRangeEnd,
                newTextNode,
              );
              // Update currentRangeEnd to reflect the new text length
              currentRangeEnd = currentRangeStart + displayText.length;
            }

            // Apply the link mark (remove old one first to handle attribute/range changes)
            tr = tr.removeMark(currentRangeStart, currentRangeEnd, linkMarkType);
            // Create link mark with both href and title attributes
            const linkAttrs = { href: newHref };
            if (newTitle) {
              linkAttrs.title = newTitle;
            }
            tr = tr.addMark(
              currentRangeStart,
              currentRangeEnd,
              linkMarkType.create(linkAttrs),
            );
          }
          // Ensure selection is set to the end of the new display text WITHIN this transaction.
          tr = tr.setSelection(TextSelection.create(tr.doc, currentRangeEnd));
        }

        // Remove context highlighting from the final range of the link
        tr = tr.removeMark(currentRangeStart, currentRangeEnd, contextHighlightingMarkType);

        const hasChanges = tr.docChanged || tr.storedMarksSet || (isImage && tr.steps.length > 0);
        if (hasChanges) {
          dispatch(tr);
        }
        if (!view.hasFocus()) {
          view.focus();
        }
      };

      const promptOptions = {
        title: label,
        fields: promptFieldsConfiguration,
        callback,
        saveOnClose: true,
        useLabelsAbove: true,
      };
      linkPromptState.lastPrompt = openPrompt(promptOptions);
    },
  });
}

export function removeLinkItem(linkMarkType) {
  return new MenuItem({
    title: 'Remove link',
    label: 'Remove',
    class: 'edit-unlink',
    isImage: false,
    active(state) {
      this.isImage = false;
      const { $from, $to } = state.selection;
      let imgHasAttrs = false;
      state.doc.nodesBetween($from.pos, $to.pos, (node) => {
        if (node.type === state.schema.nodes.image) {
          this.isImage = true;
          if (node.attrs.href || node.attrs.title) {
            imgHasAttrs = true;
          } else {
            imgHasAttrs = false;
          }
        }
      });
      if (this.isImage) {
        if ($to.pos - $from.pos <= 1) {
          return imgHasAttrs;
        }
        // selection is more than just an image
        return false;
      }

      return markActive(state, linkMarkType);
    },
    enable(state) {
      return this.active(state);
    },
    run(state, dispatch) {
      if (linkPromptState.lastPrompt.isOpen()) {
        linkPromptState.lastPrompt.internalClose();
      }

      const contextHighlightingMarkType = state.schema.marks.contextHighlightingMark;

      if (this.isImage) {
        const { $from, $to } = state.selection;
        let tr = state.tr.setNodeAttribute($from.pos, 'href', null).setNodeAttribute($from.pos, 'title', null);

        // Remove context highlighting from image selection
        if (contextHighlightingMarkType) {
          tr = tr.removeMark($from.pos, $to.pos, contextHighlightingMarkType);
        }

        dispatch(tr);
      } else {
        const { link, offset } = findExistingLink(state, linkMarkType);
        const { start, end } = calculateLinkPosition(state, link, offset);
        let tr = state.tr.setSelection(
          TextSelection.create(state.doc, start, end),
        ).removeMark(start, end, linkMarkType);

        // Remove context highlighting from link range
        if (contextHighlightingMarkType) {
          tr = tr.removeMark(start, end, contextHighlightingMarkType);
        }

        dispatch(tr);
      }
    },
  });
}
