/* eslint-disable no-case-declarations */
/**
 * HTML-aware diff functionality that preserves formatting
 * Provides word-level diffing while maintaining HTML structure
 */

/**
 * Parse HTML into an array of tokens (tags and text segments)
 * @param {string} html - HTML string to parse
 * @returns {Array} Array of token objects with type and content
 */
function parseHtmlTokens(html) {
  const tokens = [];
  const tagRegex = /<[^>]*>/g;
  let lastIndex = 0;
  let match;

  // eslint-disable-next-line no-cond-assign
  while ((match = tagRegex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      const textContent = html.substring(lastIndex, match.index);
      if (textContent) {
        // Split text into words and whitespace
        const textTokens = textContent.split(/(\s+)/).filter((token) => token.length > 0);
        tokens.push(...textTokens.map((token) => ({ type: 'text', content: token })));
      }
    }

    tokens.push({ type: 'tag', content: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < html.length) {
    const textContent = html.substring(lastIndex);
    if (textContent) {
      const textTokens = textContent.split(/(\s+)/).filter((token) => token.length > 0);
      tokens.push(...textTokens.map((token) => ({ type: 'text', content: token })));
    }
  }

  return tokens;
}

/**
 * Check if two tokens are equal
 * @param {Object} token1 - First token
 * @param {Object} token2 - Second token
 * @returns {boolean} True if tokens are equal
 */
function tokensEqual(token1, token2) {
  return token1.type === token2.type && token1.content === token2.content;
}

/**
 * Find diff operations using a simplified LCS approach
 * @param {Array} oldTokens - Tokens from original HTML
 * @param {Array} newTokens - Tokens from modified HTML
 * @returns {Array} Array of diff operations
 */
function findDiffOperations(oldTokens, newTokens) {
  const operations = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldTokens.length || newIndex < newTokens.length) {
    if (oldIndex >= oldTokens.length) {
      operations.push({ type: 'insert', oldIndex, newIndex, length: newTokens.length - newIndex });
      break;
    } else if (newIndex >= newTokens.length) {
      operations.push({ type: 'delete', oldIndex, newIndex, length: oldTokens.length - oldIndex });
      break;
    } else if (tokensEqual(oldTokens[oldIndex], newTokens[newIndex])) {
      let matchLength = 0;
      while (
        oldIndex + matchLength < oldTokens.length
        && newIndex + matchLength < newTokens.length
        && tokensEqual(oldTokens[oldIndex + matchLength], newTokens[newIndex + matchLength])
      ) {
        matchLength += 1;
      }
      operations.push({ type: 'equal', oldIndex, newIndex, length: matchLength });
      oldIndex += matchLength;
      newIndex += matchLength;
    } else {
      let foundMatch = false;
      const lookAhead = 10;

      // Look ahead in new tokens for current old token
      for (let i = 1; i <= lookAhead && newIndex + i < newTokens.length; i += 1) {
        if (tokensEqual(oldTokens[oldIndex], newTokens[newIndex + i])) {
          operations.push({ type: 'insert', oldIndex, newIndex, length: i });
          newIndex += i;
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        // Look ahead in old tokens for current new token
        for (let i = 1; i <= lookAhead && oldIndex + i < oldTokens.length; i += 1) {
          if (tokensEqual(oldTokens[oldIndex + i], newTokens[newIndex])) {
            operations.push({ type: 'delete', oldIndex, newIndex, length: i });
            oldIndex += i;
            foundMatch = true;
            break;
          }
        }
      }

      if (!foundMatch) {
        operations.push({ type: 'delete', oldIndex, newIndex, length: 1 });
        operations.push({ type: 'insert', oldIndex: oldIndex + 1, newIndex, length: 1 });
        oldIndex += 1;
        newIndex += 1;
      }
    }
  }

  return operations;
}

/**
 * Build the final diff HTML from operations
 * @param {Array} operations - Array of diff operations
 * @param {Array} oldTokens - Original tokens
 * @param {Array} newTokens - Modified tokens
 * @returns {string} HTML string with diff markup
 */
function buildDiffHtml(operations, oldTokens, newTokens) {
  const result = [];

  for (const op of operations) {
    switch (op.type) {
      case 'equal':
        for (let i = 0; i < op.length; i += 1) {
          result.push(oldTokens[op.oldIndex + i].content);
        }
        break;

      case 'delete':
        // Wrap deleted tokens in <del> tags
        const deletedContent = [];
        for (let i = 0; i < op.length; i += 1) {
          deletedContent.push(oldTokens[op.oldIndex + i].content);
        }
        if (deletedContent.length > 0) {
          result.push(`<del class="diffdel">${deletedContent.join('')}</del>`);
        }
        break;

      case 'insert':
        // Wrap inserted tokens in <ins> tags
        const insertedContent = [];
        for (let i = 0; i < op.length; i += 1) {
          insertedContent.push(newTokens[op.newIndex + i].content);
        }
        if (insertedContent.length > 0) {
          result.push(`<ins class="diffins">${insertedContent.join('')}</ins>`);
        }
        break;
      default:
        break;
    }
  }

  return result.join('');
}

/**
 * Main HTML diff function - compares two HTML strings and returns diff markup
 * @param {string} oldHtml - Original HTML string
 * @param {string} newHtml - Modified HTML string
 * @returns {string} HTML string with diff markup (ins/del tags)
 */
// eslint-disable-next-line import/prefer-default-export
export function htmlDiff(oldHtml, newHtml) {
  const oldTokens = parseHtmlTokens(oldHtml);
  const newTokens = parseHtmlTokens(newHtml);

  const operations = findDiffOperations(oldTokens, newTokens);

  return buildDiffHtml(operations, oldTokens, newTokens);
}
