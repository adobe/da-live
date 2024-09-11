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

    // /* */
    // const lastpara = doc.querySelector('body > p:last-child');
    // const newdiv = doc.createElement('div');
    // lastpara.before(newdiv);
    // newdiv.append(lastpara);
    // /* */

    // Add a hr element after all top-level div elements
    const sections = doc.querySelectorAll('body > div');
    sections.forEach((section) => {
      if (section.nextElementSibling) {
        // only add the hr if there is something after the section
        section.after(doc.createElement('hr'));
      }
    });

    // Check the last hr element. Don't add one at the end of the doc

    const serializer = new XMLSerializer();
    const newHTML = serializer.serializeToString(doc);

    return newHTML;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error handling desktop Word section breaks:', error);
    return html;
  }
}

export default function textTransform(schema) {
  return new Plugin({
    props: {
      transformPastedHTML: (html, _view) => {
        // navigator.clipboard.read().then((items) => {
        //   for (const item of items) {
        //     for (const type of item.types) {
        //       item.getType(type).then((blob) => {
        //         blob.text().then((txt) => {
        //           console.log('Clipboard item', txt, blob);
        //         });
        //       });
        //     }
        //   }
        // });

        // console.log('*** HTML Pasted:', html);
        // const newHTML = html.replaceAll('Hello', '<hr/>');
        const newHTML = handleDesktopWordSectionBreaks(html);
        return newHTML;
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
