// eslint-disable-next-line import/no-unresolved
import { Plugin, Slice, Fragment } from 'da-y-wrapper';

// URL regex pattern that matches common URL formats
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

function isURL(text) {
  try {
    const url = new URL(text);
    // Only consider http and https as valid URLs for auto-linking
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * Extracts URLs from text and returns array of {url, start, end} objects
 */
function extractURLs(text) {
  const urls = [];
  const regex = new RegExp(URL_REGEX);
  let match;

  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(text)) !== null) {
    const url = match[0];
    if (isURL(url)) {
      urls.push({
        url,
        start: match.index,
        end: match.index + url.length,
      });
    }
  }

  return urls;
}

/**
 * Processes node content and converts URLs to links
 */
function processNodeContent(content, schema) {
  let modified = false;
  const newNodes = [];

  content.forEach((node) => {
    if (node.isText) {
      const urls = extractURLs(node.text);
      if (urls.length > 0) {
        modified = true;
        let lastEnd = 0;
        const { marks } = node;

        urls.forEach(({ url, start, end }) => {
          // Add text before URL
          if (start > lastEnd) {
            newNodes.push(schema.text(node.text.slice(lastEnd, start), marks));
          }

          // Add URL as link
          const linkMark = schema.marks.link.create({ href: url });
          newNodes.push(schema.text(url, [...marks, linkMark]));

          lastEnd = end;
        });

        // Add remaining text after last URL
        if (lastEnd < node.text.length) {
          newNodes.push(schema.text(node.text.slice(lastEnd), marks));
        }
      } else {
        newNodes.push(node);
      }
    } else if (node.content && node.content.size > 0) {
      // Recursively process child nodes
      const result = processNodeContent(node.content, schema);

      if (result.modified) {
        modified = true;
        newNodes.push(node.type.create(node.attrs, result.content, node.marks));
      } else {
        newNodes.push(node);
      }
    } else {
      newNodes.push(node);
    }
  });

  return {
    content: Fragment.from(newNodes),
    modified,
  };
}

export default function linkConverter(schema) {
  return new Plugin({
    props: {
      handlePaste: (view, event, slice) => {
        // Handle simple case: pasting just a URL
        if (slice.content.content.length === 1
          && slice.content.content[0].content.content.length === 1
          && slice.content.content[0].content.content[0].type.name === 'text') {
          const text = slice.content.content[0].content.content[0].text.trim();

          if (isURL(text)) {
            const linkMark = schema.marks.link.create({ href: text });
            const textNode = schema.text(text, [linkMark]);

            const tr = view.state.tr
              .replaceSelectionWith(textNode, false)
              .scrollIntoView();
            view.dispatch(tr);

            return true;
          }
        }

        // Handle complex case: pasted content contains URLs mixed with other text
        const result = processNodeContent(slice.content, schema);

        if (result.modified) {
          const newSlice = new Slice(
            result.content,
            slice.openStart,
            slice.openEnd,
          );

          const tr = view.state.tr
            .replaceSelection(newSlice)
            .scrollIntoView();
          view.dispatch(tr);

          return true;
        }

        return false;
      },
    },
  });
}
