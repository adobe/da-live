/**
 * Lorem Ipsum Test
 *
 * This test checks for placeholder "lorem ipsum" text in page content.
 * Lorem ipsum text should not appear in production content.
 */

function runTest(pageSource) {
  try {
    // Parse the page source
    const parser = new DOMParser();
    const doc = parser.parseFromString(pageSource, 'text/html');

    // Define common lorem ipsum words and phrases
    const loremIpsumPatterns = [
      'lorem',
      'ipsum',
      'dolor',
      'sit amet',
      'consectetur',
      'adipiscing',
      'adipisicing',
      'elit',
      'sed do eiusmod',
      'tempor',
      'incididunt',
      'labore',
      'dolore',
      'magna',
      'aliqua',
      'eiusmod',
      'veniam',
      'quis nostrud',
      'exercitation',
      'ullamco',
      'laboris',
      'nisi ut aliquip',
      'commodo',
      'consequat',
      'duis aute',
      'irure',
      'reprehenderit',
      'voluptate',
      'velit esse',
      'cillum',
      'fugiat',
      'nulla pariatur',
      'excepteur',
      'sint occaecat',
      'cupidatat',
      'proident',
      'culpa',
      'officia',
      'deserunt',
      'mollit',
      'anim id est laborum',
    ];

    // Create a regex pattern that matches any lorem ipsum word/phrase
    // Use word boundaries for single words
    const escapedPatterns = loremIpsumPatterns.map((pattern) => {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // For single words, use word boundaries
      if (!/\s/.test(pattern)) {
        return `\\b${escaped}\\b`;
      }
      // For phrases, match as-is
      return escaped;
    });

    const loremPattern = new RegExp(`(${escapedPatterns.join('|')})`, 'gi');

    // Check metadata div in body
    const metadataDiv = doc.querySelector('div.metadata');
    const hasMetadataDiv = !!metadataDiv;

    // Extract metadata content and title separately
    let metadataTitleText = '';
    let metadataTitleMatches = [];
    const metaMatches = [];

    if (metadataDiv) {
      const metadataDivs = metadataDiv.children;
      const metadataItems = [];
      let foundTitle = false;
      let titleValue = '';

      // Process each outer div (each contains a key-value pair)
      for (let i = 0; i < metadataDivs.length; i += 1) {
        const outerDiv = metadataDivs[i];
        const innerDivs = outerDiv.children;

        if (innerDivs.length === 2) {
          const keyDiv = innerDivs[0];
          const valueDiv = innerDivs[1];

          const key = keyDiv.textContent.trim();
          const value = valueDiv.textContent.trim();

          // Check if this is the title row
          if (key.toLowerCase() === 'title') {
            metadataTitleText = value;
            metadataTitleMatches = value.match(loremPattern) || [];
            foundTitle = true;
            titleValue = value;
          } else if (foundTitle && value === titleValue) {
            // Skip duplicate title value
          } else {
            // Check if value contains lorem ipsum
            const valueMatches = value.match(loremPattern);
            if (valueMatches) {
              metadataItems.push({ key, value, matches: valueMatches });
            }
          }
        }
      }

      // Create detailed metadata matches for display
      metadataItems.forEach((item) => {
        item.matches.forEach((match) => {
          const matchIndex = item.value.toLowerCase().indexOf(match.toLowerCase());
          const start = Math.max(0, matchIndex - 25);
          const end = Math.min(item.value.length, matchIndex + match.length + 25);
          let context = item.value.substring(start, end).trim();

          // Extend to word boundaries for better readability
          if (start > 0) {
            const beforeMatch = item.value.substring(0, matchIndex);
            const lastSpaceIndex = beforeMatch.lastIndexOf(' ');
            if (lastSpaceIndex > start - 25) {
              context = item.value.substring(lastSpaceIndex + 1, end).trim();
            }
          }
          if (end < item.value.length) {
            const afterMatch = item.value.substring(matchIndex + match.length);
            const nextSpaceIndex = afterMatch.indexOf(' ');
            if (nextSpaceIndex > 0 && nextSpaceIndex < 25) {
              const endIndex = matchIndex + match.length + nextSpaceIndex;
              context = item.value.substring(start, endIndex).trim();
            }
          }

          // Limit context length for display
          if (context.length > 150) {
            context = context.substring(0, 150).trim();
          }

          metaMatches.push({
            term: match,
            key: item.key,
            context,
          });
        });
      });
    }

    // Check body content (excluding metadata div)
    let bodyText = '';
    const bodyMatches = [];

    if (doc.body) {
      // Clone the body to avoid modifying the original
      const bodyClone = doc.body.cloneNode(true);

      // Remove the metadata div from the clone if it exists
      const metadataDivClone = bodyClone.querySelector('div.metadata');
      if (metadataDivClone) {
        metadataDivClone.remove();
      }

      bodyText = bodyClone.textContent || '';

      // Find all lorem ipsum matches in body content
      const allMatches = bodyText.match(loremPattern) || [];
      const uniqueMatches = [...new Set(allMatches.map((m) => m.toLowerCase()))];

      uniqueMatches.forEach((uniqueMatch) => {
        // Find context for each unique match (case-insensitive search)
        const lowerBodyText = bodyText.toLowerCase();
        const matchIndex = lowerBodyText.indexOf(uniqueMatch);

        if (matchIndex === -1) return;

        const start = Math.max(0, matchIndex - 25);
        const end = Math.min(bodyText.length, matchIndex + uniqueMatch.length + 25);
        let context = bodyText.substring(start, end).trim();

        // Extend to word boundaries for better readability
        if (start > 0) {
          const beforeMatch = bodyText.substring(0, matchIndex);
          const lastSpaceIndex = beforeMatch.lastIndexOf(' ');
          if (lastSpaceIndex > start - 25) {
            context = bodyText.substring(lastSpaceIndex + 1, end).trim();
          }
        }
        if (end < bodyText.length) {
          const afterMatch = bodyText.substring(matchIndex + uniqueMatch.length);
          const nextSpaceIndex = afterMatch.indexOf(' ');
          if (nextSpaceIndex > 0 && nextSpaceIndex < 25) {
            const endIndex = matchIndex + uniqueMatch.length + nextSpaceIndex;
            context = bodyText.substring(start, endIndex).trim();
          }
        }

        // Limit context length for display
        if (context.length > 150) {
          context = context.substring(0, 150).trim();
        }

        // Get the actual matched text from the original (preserves case)
        const actualMatch = bodyText.substring(matchIndex, matchIndex + uniqueMatch.length);

        bodyMatches.push({
          term: actualMatch,
          context,
        });
      });
    }

    // Determine overall status
    const hasLoremIpsum = metadataTitleMatches.length > 0
      || metaMatches.length > 0
      || bodyMatches.length > 0;

    // Build sub-tests array conditionally
    const subTests = [];

    // Body content test - always included
    subTests.push({
      name: 'Body Content',
      status: bodyMatches.length > 0 ? 'fail' : 'pass',
      message: bodyMatches.length > 0
        ? `Found ${bodyMatches.length} lorem ipsum term(s) in body content`
        : 'No lorem ipsum text found in body content',
      location: (() => {
        if (bodyMatches.length === 0) return 'Body content';

        const bodyPart = bodyMatches.map((m) => {
          const context = m.context.trim();
          const termIndex = context.toLowerCase().indexOf(m.term.toLowerCase());

          if (termIndex !== -1) {
            const beforeTerm = context.substring(0, termIndex).trim();
            const afterTerm = context.substring(termIndex + m.term.length).trim();

            let readableContext = '';
            if (beforeTerm) {
              readableContext += `...${beforeTerm} `;
            }
            const strongStyle = 'background-color: #ffeb3b; padding: 2px 4px; border-radius: 3px;';
            readableContext += `<strong style="${strongStyle}">${m.term}</strong>`;
            if (afterTerm) {
              readableContext += ` ${afterTerm}...`;
            }

            return readableContext;
          }
          return context;
        }).join('\n• ');

        return `Body Content:\n• ${bodyPart}`;
      })(),
      remediation: bodyMatches.length > 0
        ? 'Replace placeholder text with actual content in body'
        : 'No action needed',
    });

    // Title test - only if metadata div exists
    if (hasMetadataDiv) {
      subTests.push({
        name: 'Title',
        status: metadataTitleMatches.length > 0 ? 'fail' : 'pass',
        message: metadataTitleMatches.length > 0
          ? `Found ${metadataTitleMatches.length} lorem ipsum term(s) in title`
          : 'No lorem ipsum text found in title',
        location: (() => {
          if (metadataTitleMatches.length === 0) return 'Page title';

          const titlePart = `Title: "${metadataTitleText}"\n• Found: ${metadataTitleMatches.map((term) => `<strong style="background-color: #ffeb3b; padding: 2px 4px; border-radius: 3px;">${term}</strong>`).join(', ')}`;
          return titlePart;
        })(),
        remediation: metadataTitleMatches.length > 0
          ? 'Replace placeholder text with actual content in title'
          : 'No action needed',
      });
    }

    // Metadata test - only if metadata div exists AND lorem ipsum found in metadata
    if (hasMetadataDiv && metaMatches.length > 0) {
      subTests.push({
        name: 'Metadata',
        status: 'fail',
        message: `Found ${metaMatches.length} lorem ipsum term(s) in metadata`,
        location: (() => {
          const metaPart = metaMatches.map((m) => {
            const context = m.context.length > 80
              ? `${m.context.substring(0, 80)}...`
              : m.context;
            const termIndex = context.toLowerCase().indexOf(m.term.toLowerCase());

            if (termIndex !== -1) {
              const beforeTerm = context.substring(0, termIndex).trim();
              const afterTerm = context.substring(termIndex + m.term.length).trim();

              let readableContext = '';
              if (beforeTerm) {
                readableContext += `...${beforeTerm} `;
              }
              const strongStyle = 'background-color: #ffeb3b; padding: 2px 4px; border-radius: 3px;';
              readableContext += `<strong style="${strongStyle}">${m.term}</strong>`;
              if (afterTerm) {
                readableContext += ` ${afterTerm}...`;
              }

              return `${m.key}: "${readableContext}"`;
            }
            return `${m.key}: "${context}"`;
          }).join('\n• ');

          return `Metadata:\n• ${metaPart}`;
        })(),
        remediation: 'Replace placeholder text with actual content in metadata',
      });
    }

    const overallStatus = hasLoremIpsum ? 'fail' : 'pass';

    return {
      status: overallStatus,
      message: (() => {
        if (hasLoremIpsum) {
          const totalMatches = metadataTitleMatches.length
            + metaMatches.length
            + bodyMatches.length;
          return `Found ${totalMatches} lorem ipsum placeholder term(s) in content`;
        }
        return 'No lorem ipsum placeholder text detected';
      })(),
      location: 'Body content, title, and metadata',
      remediation: (() => {
        if (hasLoremIpsum) {
          return 'Replace all lorem ipsum placeholder text with actual content';
        }
        return 'No action needed';
      })(),
      subTests,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `Lorem ipsum test execution failed: ${error.message}`,
      location: `Error in test execution: ${error.name}`,
      remediation: 'Check console for detailed error information and fix the test implementation',
      subTests: [
        {
          name: 'Execution Error',
          status: 'fail',
          message: `Error: ${error.message}`,
          location: 'Test function execution',
          remediation: 'Review test code and page source for compatibility issues',
        },
      ],
    };
  }
}

export default async function loremIpsumTest(pageSource) {
  // Execute the actual test logic
  return runTest(pageSource);
}
