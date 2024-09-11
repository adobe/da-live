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

function handleDesktopWordSectionBreaks(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (doc.querySelector('meta[name="ProgId"]')?.content !== 'Word.Document') {
      // This is not a word document
      return html;
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

    if (!modified) {
      return html;
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error handling desktop Word section breaks:', error);
    return html;
  }
}

function handleWordOnlineSectionBreaks(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let modified = false;
    // The span[data-ccp-props] are the magic indicator if one of the JSON values in there is the
    // word 'single' then we need to add a section break.
    const sections = doc.querySelectorAll('div > p > span[data-ccp-props]');
    sections.forEach((section) => {
      const props = JSON.parse(section.getAttribute('data-ccp-props'));
      Object.keys(props).forEach((key) => {
        if (props[key] === 'single') {
          const hr = doc.createElement('hr');
          section.parentNode.after(hr);
          modified = true;
        }
      });
    });

    if (!modified) {
      return html;
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error handling Word online section breaks:', error);
    return html;
  }
}

export default function textTransform(schema) {
  return new Plugin({
    props: {
      transformPastedHTML: (html) => {
        const newHTML = handleDesktopWordSectionBreaks(html);
        const newHTML2 = handleWordOnlineSectionBreaks(newHTML);
        return newHTML2;
      },
      transformPasted: (slice) => {
        const jslice = slice.toJSON();
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
