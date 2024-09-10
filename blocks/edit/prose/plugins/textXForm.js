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

export default function textTransform(schema) {
  return new Plugin({
    props: {
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
              } else {
                if (pc.text.trim() === '---') {
                  closeParagraph(newParaCont, newContent);

                  newContent.push({ type: 'paragraph' });
                  newContent.push({ type: 'horizontal_rule' });
                  newContent.push({ type: 'paragraph' });
                } else {
                  newParaCont.push(pc);
                }
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
