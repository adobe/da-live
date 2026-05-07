import { Fragment, Plugin, Slice } from 'da-y-wrapper';

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

function handleDesktopWordSectionBreaks(doc) {
  if (doc.querySelector('meta[name="ProgId"]')?.content !== 'Word.Document') {
    return false;
  }

  let modified = false;
  const sections = doc.querySelectorAll('body > div');
  sections.forEach((section) => {
    if (section.nextElementSibling) {
      section.after(doc.createElement('hr'));
      modified = true;
    }
  });

  return modified;
}

function handleWordOnlineSectionBreaks(doc) {
  let modified = false;
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

export default function sectionPasteHandler(schema) {
  return new Plugin({
    props: {
      clipboardTextParser: (text) => {
        const lines = text.split(/\r\n?|\n/);
        const nodes = lines.map((line) => {
          if (line.length === 0) return schema.nodes.paragraph.create();
          return schema.nodes.paragraph.create(null, [schema.text(line)]);
        });
        return new Slice(Fragment.from(nodes), 1, 1);
      },

      transformPastedHTML: (html) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          let modified = handleDesktopWordSectionBreaks(doc);
          if (!modified) {
            modified = handleWordOnlineSectionBreaks(doc);
          }
          if (!modified) {
            modified = handleDivLineBreaks(doc);
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
