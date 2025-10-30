// eslint-disable-next-line import/no-unresolved
import { Plugin, Slice, Fragment } from 'da-y-wrapper';

// URL regex pattern that matches common URL formats
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/g;

function isURL(text) {
  try {
    const url = new URL(text);
    // Only consider https as valid URLs for auto-linking
    return url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * Extracts URLs from text and returns array of {url, start, end} objects
 */
function extractURLs(text) {
  const urls = [];
  URL_REGEX.lastIndex = 0; // Reset regex state
  let match;

  // eslint-disable-next-line no-cond-assign
  while ((match = URL_REGEX.exec(text)) !== null) {
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
  const newNodes = [];
  let modified = false;

  content.forEach((node) => {
    if (node.isText) {
      const urls = extractURLs(node.text);
      if (urls.length === 0) {
        newNodes.push(node);
        return;
      }

      modified = true;
      let lastEnd = 0;
      const linkMark = schema.marks.link;

      urls.forEach(({ url, start, end }) => {
        if (start > lastEnd) {
          newNodes.push(schema.text(node.text.slice(lastEnd, start), node.marks));
        }
        newNodes.push(schema.text(url, node.marks.concat(linkMark.create({ href: url }))));
        lastEnd = end;
      });

      if (lastEnd < node.text.length) {
        newNodes.push(schema.text(node.text.slice(lastEnd), node.marks));
      }
    } else if (node.content?.size > 0) {
      const result = processNodeContent(node.content, schema);
      newNodes.push(result.modified
        ? node.type.create(node.attrs, result.content, node.marks)
        : node);
      if (result.modified) modified = true;
    } else {
      newNodes.push(node);
    }
  });

  return { content: Fragment.from(newNodes), modified };
}

export default function linkConverter(schema) {
  return new Plugin({
    props: {
      handlePaste: (view, event, slice) => {
        // Fast path: simple URL paste
        const { content } = slice.content;
        if (content.length === 1 && content[0].content.content.length === 1) {
          const node = content[0].content.content[0];
          if (node.type.name === 'text') {
            const text = node.text.trim();
            if (isURL(text)) {
              const linkMark = schema.marks.link.create({ href: text });
              view.dispatch(
                view.state.tr
                  .replaceSelectionWith(schema.text(text, [linkMark]), false)
                  .scrollIntoView(),
              );
              return true;
            }
          }
        }

        // Complex case: extract URLs from pasted content
        const result = processNodeContent(slice.content, schema);
        if (!result.modified) return false;

        view.dispatch(
          view.state.tr
            .replaceSelection(new Slice(result.content, slice.openStart, slice.openEnd))
            .scrollIntoView(),
        );
        return true;
      },
    },
  });
}
