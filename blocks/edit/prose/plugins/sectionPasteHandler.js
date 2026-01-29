import { Fragment, Plugin, PluginKey, Slice } from 'da-y-wrapper';

const sectionPasteKey = new PluginKey('sectionPaste');

// Non-global regex for detection only
const NONSTANDARD_SPACE_DETECT = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/;
// Global regex for replacement
const NONSTANDARD_SPACES_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

function normalizeSpaceChars(str) {
  return str.replace(NONSTANDARD_SPACES_RE, ' ');
}

function normalizeSpacesInJSON(obj) {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(normalizeSpacesInJSON);
  if (typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = (key === 'text' && typeof obj[key] === 'string')
        ? normalizeSpaceChars(obj[key])
        : normalizeSpacesInJSON(obj[key]);
    }
    return result;
  }
  return obj;
}

function showSpaceNormalizationDialog(view, slice, schema) {
  import('../../../shared/da-dialog/da-dialog.js').then(() => {
    const dialog = document.createElement('da-dialog');
    dialog.title = 'Hidden characters detected';
    dialog.size = 'small';

    const content = document.createElement('p');
    content.textContent = 'The pasted content contains hidden characters (such as non-breaking spaces). Would you like to convert them to regular spaces?';
    dialog.appendChild(content);

    dialog.action = {
      label: 'Normalize spaces',
      style: 'accent',
      click: () => {
        const rawJson = slice.toJSON();
        const normalized = normalizeSpacesInJSON(rawJson);
        const normalizedSlice = Slice.fromJSON(schema, normalized);
        view.dispatch(view.state.tr.replaceSelection(normalizedSlice));
        dialog.close();
      },
    };

    const pasteAsIsBtn = document.createElement('sl-button');
    pasteAsIsBtn.className = 'primary outline';
    pasteAsIsBtn.textContent = 'Paste as-is';
    pasteAsIsBtn.slot = 'footer-left';
    pasteAsIsBtn.addEventListener('click', () => {
      view.dispatch(view.state.tr.replaceSelection(slice));
      dialog.close();
    });
    dialog.appendChild(pasteAsIsBtn);

    dialog.addEventListener('close', () => {
      dialog.remove();
    });

    document.body.appendChild(dialog);
  });
}

function closeParagraph(paraContent, newContent) {
  if (paraContent.length > 0) {
    const newPara = {
      type: 'paragraph',
      content: [...paraContent],
    };
    newContent.push(newPara);
    paraContent.length = 0;
  }
}

/**
 * Find section breaks in HTML pasted from desktop Word and add a horizontal rule
 * after each one.
 * In Desktop Word each section is represented as a top-level div element, right
 * under the body element.
 */
function handleDesktopWordSectionBreaks(doc) {
  if (doc.querySelector('meta[name="ProgId"]')?.content !== 'Word.Document') {
    // This is not a word document
    return false;
  }

  let modified = false;
  // Add a hr element after all top-level div elements
  const sections = doc.querySelectorAll('body > div');
  sections.forEach((section) => {
    if (section.nextElementSibling) {
      // only add the hr if there is something after the section
      section.after(doc.createElement('hr'));
      modified = true;
    }
  });

  return modified;
}

/**
 * Find section breaks in HTML pasted from Word online and add a horizontal rule
 * after each one.
 * In Word online section breaks are quite hard to identify, but it turns out that
 * they seem to be indicated by a span element with a data-ccp-props attribute, of
 * which one of the values is 'single'. This is quite brittle but right now seems
 * to be the only way to find them. In the future Word online might provide a
 * better way to identify section breaks.
 */
function handleWordOnlineSectionBreaks(doc) {
  let modified = false;
  // The span[data-ccp-props] are the magic indicator if one of the JSON values in there is the
  // word 'single' then we need to add a section break.
  const sections = doc.querySelectorAll('div > p > span[data-ccp-props]');
  sections.forEach((section) => {
    const props = JSON.parse(section.getAttribute('data-ccp-props'));
    for (const key of Object.keys(props)) {
      if (props[key] === 'single') {
        const hr = doc.createElement('hr');
        section.parentNode.after(hr);
        modified = true;
        break;
      }
    }
  });

  return modified;
}

function isBlankLineDiv(div) {
  return [...div.childNodes].every(
    (node) => (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '')
      || node.nodeName === 'BR',
  );
}

/**
 * Excel Web App represent lines as sibling
 * <div> elements, with blank lines containing only a <br>.
 */
function handleDivLineBreaks(doc) {
  const divs = doc.querySelectorAll('body > div');
  if (divs.length === 0) return false;

  const hasBlankLine = [...divs].some(isBlankLineDiv);
  if (!hasBlankLine) return false;

  divs.forEach((div) => {
    const p = doc.createElement('p');
    if (!isBlankLineDiv(div)) {
      while (div.firstChild) {
        p.appendChild(div.firstChild);
      }
    }
    div.replaceWith(p);
  });

  return true;
}

/* When text is pasted, handle section breaks. */
export default function sectionPasteHandler(schema) {
  return new Plugin({
    key: sectionPasteKey,
    props: {
      handlePaste: (view, event, slice) => {
        const text = event.clipboardData?.getData('text/plain') || '';
        const html = event.clipboardData?.getData('text/html') || '';
        if (NONSTANDARD_SPACE_DETECT.test(text) || NONSTANDARD_SPACE_DETECT.test(html)) {
          showSpaceNormalizationDialog(view, slice, schema);
          return true;
        }
        return false;
      },

      clipboardTextParser: (text) => {
        const lines = text.split(/\r\n?|\n/);
        const nodes = lines.map((line) => {
          if (line.length === 0) return schema.nodes.paragraph.create();
          return schema.nodes.paragraph.create(null, [schema.text(line)]);
        });
        return new Slice(Fragment.from(nodes), 1, 1);
      },

      /* A section break entered in Word is not kept in the text of the document, but
       * buried in the HTML that is pasted. This function uses highly specific ways to find
       * these section breaks and adds a <hr/> element for them.
       */
      transformPastedHTML: (pastedHtml) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(pastedHtml, 'text/html');

          let modified = handleDesktopWordSectionBreaks(doc);
          if (!modified) {
            modified = handleWordOnlineSectionBreaks(doc);
          }
          if (!modified) {
            modified = handleDivLineBreaks(doc);
          }

          if (!modified) {
            return pastedHtml;
          }

          const serializer = new XMLSerializer();
          return serializer.serializeToString(doc);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Error handling Word section breaks:', error);
          return pastedHtml;
        }
      },

      /* Convert 3 dashes on a line by itself (top level only) to a horizontal rule,
       * which is then interpreted as a section break.
       */
      transformPasted: (slice) => {
        const jslice = slice.toJSON();
        if (!jslice) return slice;
        const { content } = jslice;
        if (!content) return slice;

        const newContent = [];

        for (const el of content) {
          if (el.type !== 'paragraph') {
            newContent.push(el);
          } else {
            const newParaCont = [];

            if (!el.content) {
              newContent.push({ type: 'paragraph', content: [] });
            } else {
              for (const pc of el.content) {
                if (pc.type !== 'text') {
                  newParaCont.push(pc);
                } else if (pc.text.trim() === '---') {
                  closeParagraph(newParaCont, newContent);

                  newContent.push({ type: 'horizontal_rule' });
                } else {
                  newParaCont.push(pc);
                }
              }

              closeParagraph(newParaCont, newContent);
            }
          }
        }

        const newSlice = {
          content: newContent,
          openStart: slice.openStart,
          openEnd: slice.openEnd,
        };

        return Slice.fromJSON(schema, newSlice);
      },
    },
  });
}
