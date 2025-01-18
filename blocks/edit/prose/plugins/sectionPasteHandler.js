import { Plugin, Slice } from 'da-y-wrapper';

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

/* When text is pasted, handle section breaks. */
export default function sectionPasteHandler(schema) {
  return new Plugin({
    props: {
      /* A section break entered in Word is not kept in the text of the document, but
       * buried in the HTML that is pasted. This function uses highly specific ways to find
       * these section breaks and adds a <hr/> element for them.
       */
      transformPastedHTML: (html) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          let modified = handleDesktopWordSectionBreaks(doc);
          if (!modified) {
            modified = handleWordOnlineSectionBreaks(doc);
          }

          if (!modified) {
            return html;
          }

          const serializer = new XMLSerializer();
          return serializer.serializeToString(doc);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Error handling Word section breaks:', error);
          return html;
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
