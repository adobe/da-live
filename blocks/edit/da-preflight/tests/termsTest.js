function runTest(pageSource) {
  try {
    // Parse the page source
    const parser = new DOMParser();
    const doc = parser.parseFromString(pageSource, 'text/html');

    // Define absolute terms to look for
    const absoluteTerms = [
      'all', 'every', '100%', 'never', 'always', 'none', 'nothing',
      'everything', 'everyone', 'everybody', 'everywhere', 'everytime',
      'completely', 'totally', 'absolutely', 'definitely', 'certainly',
      'guaranteed', 'impossible', 'perfect', 'worst', 'best', 'forever',
      'permanent', 'eternal', 'infinite', 'unlimited', 'boundless',
      'unconditional', 'unquestionable', 'indisputable', 'irrefutable',
    ];

    // Define biased language terms to look for
    const biasedTerms = [
      'mankind', 'manpower', 'manmade', 'man-made', 'manhole', 'manning',
      'blacklist', 'whitelist', 'blackhat', 'white hat', 'black hat',
      'master', 'slave', 'grandfathered', 'guys', 'chairman', 'chairwoman',
      'policeman', 'fireman', 'postman', 'workman', 'businessman',
      'salesmen', 'salesman', 'spokesman', 'congressmen', 'congressman',
      'crazy', 'insane', 'nuts', 'lame', 'dumb', 'blind to', 'tone deaf',
    ];

    // Create regex pattern for absolute terms with proper word boundaries
    // Handle special characters like % by escaping them and using lookahead/lookbehind
    const escapedAbsoluteTerms = absoluteTerms.map((term) => {
    // Escape special regex characters
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // For terms that start/end with word characters, use word boundaries
      if (/^\w/.test(term) && /\w$/.test(term)) {
        return `\\b${escaped}\\b`;
      }
      // For terms with special characters, use space/punctuation boundaries
      return `(?<!\\w)${escaped}(?!\\w)`;
    });

    const absolutePattern = new RegExp(`(${escapedAbsoluteTerms.join('|')})`, 'gi');

    // Create regex pattern for biased terms - simplified approach
    const escapedBiasedTerms = biasedTerms.map((term) => {
    // Escape special regex characters
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Just match the term with basic boundaries (not at the start of another word)
      return `(?<!\\w)${escaped}`;
    });

    const biasedPattern = new RegExp(`(${escapedBiasedTerms.join('|')})`, 'gi');

    // Check metadata div in body for absolute terms
    const metadataDiv = doc.querySelector('div.metadata');

    // Extract metadata content and title separately
    let metadataTitleText = '';
    let metadataTitleMatches = [];
    let metadataTitleBiasedMatches = [];
    const metaMatches = [];
    const metaBiasedMatches = [];

    if (metadataDiv) {
    // Parse the actual HTML structure: <div><div><p>key</p></div><div><p>value</p></div></div>
    // We need the OUTER divs that contain the key-value pairs, not the inner divs with <p> elements
      const metadataDivs = metadataDiv.children; // Get direct children (the outer divs)

      const metadataItems = [];
      let foundTitle = false;
      let titleValue = '';

      // Process each outer div (each contains a key-value pair)
      for (let i = 0; i < metadataDivs.length; i += 1) {
        const outerDiv = metadataDivs[i];

        // Each outer div should contain exactly 2 inner divs (key and value)
        const innerDivs = outerDiv.children;
        if (innerDivs.length === 2) {
          const keyDiv = innerDivs[0];
          const valueDiv = innerDivs[1];

          const key = keyDiv.textContent.trim();
          const value = valueDiv.textContent.trim();

          // Skip if this is the title row
          if (key.toLowerCase() === 'title') {
            metadataTitleText = value;
            metadataTitleMatches = value.match(absolutePattern) || [];
            metadataTitleBiasedMatches = value.match(biasedPattern) || [];
            foundTitle = true;
            titleValue = value;
          } else if (foundTitle && value === titleValue) {
          // Double-check: if we already found title, make sure this isn't the title value
          } else {
          // Check if value contains absolute or biased terms
            const valueHasAbsolutes = value.match(absolutePattern);
            const valueHasBiased = value.match(biasedPattern);
            if (valueHasAbsolutes) {
              metadataItems.push({ key, value, type: 'absolute' });
            }
            if (valueHasBiased) {
              metadataItems.push({ key, value, type: 'biased' });
            }
          }
        }
      }

      // Build metadata text from non-title items only (for potential future use)
      // metadataText = metadataItems.map((item) => item.value).join(' ');

      // Create detailed metadata matches for display
      metadataItems.forEach((item) => {
        if (item.type === 'absolute') {
          const matches = item.value.match(absolutePattern) || [];
          matches.forEach((match) => {
            const matchIndex = item.value.indexOf(match);
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
        } else if (item.type === 'biased') {
          const matches = item.value.match(biasedPattern) || [];
          matches.forEach((match) => {
            const matchIndex = item.value.indexOf(match);
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

            metaBiasedMatches.push({
              term: match,
              key: item.key,
              context,
            });
          });
        }
      });
    }

    // Check body content (excluding metadata div) for absolute and biased terms
    let bodyText = '';
    const bodyMatches = [];
    const bodyBiasedMatches = [];

    if (doc.body) {
    // Clone the body to avoid modifying the original
      const bodyClone = doc.body.cloneNode(true);

      // Remove the metadata div from the clone if it exists
      const metadataDivClone = bodyClone.querySelector('div.metadata');
      if (metadataDivClone) {
        metadataDivClone.remove();
      }

      bodyText = bodyClone.textContent || '';

      // Find all absolute term matches in body content
      const allAbsoluteMatches = bodyText.match(absolutePattern) || [];
      const uniqueAbsoluteMatches = [...new Set(allAbsoluteMatches)];

      uniqueAbsoluteMatches.forEach((uniqueMatch) => {
      // Find context for each unique match
        const matchIndex = bodyText.indexOf(uniqueMatch);
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

        bodyMatches.push({
          term: uniqueMatch,
          context,
        });
      });

      // Find all biased term matches in body content
      const allBiasedMatches = bodyText.match(biasedPattern) || [];
      const uniqueBiasedMatches = [...new Set(allBiasedMatches)];

      uniqueBiasedMatches.forEach((uniqueMatch) => {
      // Find context for each unique match
        const matchIndex = bodyText.indexOf(uniqueMatch);
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

        bodyBiasedMatches.push({
          term: uniqueMatch,
          context,
        });
      });
    }

    // Determine overall status FIRST (moved up before sub-test creation)
    const hasAbsolutes = metadataTitleMatches.length > 0
    || metaMatches.length > 0
    || bodyMatches.length > 0;

    const hasBiased = metadataTitleBiasedMatches.length > 0
    || metaBiasedMatches.length > 0
    || bodyBiasedMatches.length > 0;

    // Create consolidated sub-test
    const absolutesSubTestStatus = hasAbsolutes ? 'fail' : 'pass';

    const absolutesSubTestMessage = (() => {
      const totalMatches = metadataTitleMatches.length + metaMatches.length + bodyMatches.length;
      if (totalMatches > 0) {
        const parts = [];
        if (metadataTitleMatches.length > 0) parts.push(`title (${metadataTitleMatches.length})`);
        if (metaMatches.length > 0) parts.push(`metadata (${metaMatches.length})`);
        if (bodyMatches.length > 0) parts.push(`body (${bodyMatches.length})`);
        return `Found ${totalMatches} absolute terms in ${parts.join(', ')}`;
      }
      return 'No absolute terms found in content areas';
    })();

    const absolutesSubTestLocation = (() => {
      const locationParts = [];

      // Title matches
      if (metadataTitleMatches.length > 0) {
        const titlePart = `Title: "${metadataTitleText}"\n• Found: ${metadataTitleMatches.map((term) => `<strong style="background-color: #ffeb3b; padding: 2px 4px; border-radius: 3px;">${term}</strong>`).join(', ')}`;
        locationParts.push(titlePart);
      }

      // Metadata matches
      if (metaMatches.length > 0) {
        const metaPart = metaMatches.map((m) => {
          const context = m.context.length > 80
            ? `${m.context.substring(0, 80)}...`
            : m.context;
          const termIndex = context.indexOf(m.term);
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
        locationParts.push(`Metadata:\n• ${metaPart}`);
      }

      // Body matches
      if (bodyMatches.length > 0) {
        const bodyPart = bodyMatches.map((m) => {
          const context = m.context.trim();
          const termIndex = context.indexOf(m.term);

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
        locationParts.push(`Body Content:\n• ${bodyPart}`);
      }

      return locationParts.length > 0 ? locationParts.join('\n\n') : 'Body content, title, and metadata';
    })();

    const absolutesSubTestRemediation = (() => {
      if (hasAbsolutes) {
        const areas = [];
        if (metadataTitleMatches.length > 0) areas.push('title');
        if (metaMatches.length > 0) areas.push('metadata');
        if (bodyMatches.length > 0) areas.push('body content');
        return `Review and qualify absolute statements in ${areas.join(', ')}`;
      }
      return 'No action needed';
    })();

    // Create biased language sub-test
    const biasedSubTestStatus = hasBiased ? 'fail' : 'pass';

    const biasedSubTestMessage = (() => {
      const totalMatches = metadataTitleBiasedMatches.length + metaBiasedMatches.length
        + bodyBiasedMatches.length;
      if (totalMatches > 0) {
        const parts = [];
        if (metadataTitleBiasedMatches.length > 0) parts.push(`title (${metadataTitleBiasedMatches.length})`);
        if (metaBiasedMatches.length > 0) parts.push(`metadata (${metaBiasedMatches.length})`);
        if (bodyBiasedMatches.length > 0) parts.push(`body (${bodyBiasedMatches.length})`);
        return `Found ${totalMatches} biased terms in ${parts.join(', ')}`;
      }
      return 'No biased language found in content areas';
    })();

    const biasedSubTestLocation = (() => {
      const locationParts = [];

      // Title matches
      if (metadataTitleBiasedMatches.length > 0) {
        const titlePart = `Title: "${metadataTitleText}"\n• Found: ${metadataTitleBiasedMatches.map((term) => `<strong style="background-color: #ffeb3b; padding: 2px 4px; border-radius: 3px;">${term}</strong>`).join(', ')}`;
        locationParts.push(titlePart);
      }

      // Metadata matches
      if (metaBiasedMatches.length > 0) {
        const metaPart = metaBiasedMatches.map((m) => {
          const context = m.context.length > 80
            ? `${m.context.substring(0, 80)}...`
            : m.context;
          const termIndex = context.indexOf(m.term);
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
        locationParts.push(`Metadata:\n• ${metaPart}`);
      }

      // Body matches
      if (bodyBiasedMatches.length > 0) {
        const bodyPart = bodyBiasedMatches.map((m) => {
          const context = m.context.trim();
          const termIndex = context.indexOf(m.term);

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
        locationParts.push(`Body Content:\n• ${bodyPart}`);
      }

      return locationParts.length > 0 ? locationParts.join('\n\n') : 'Body content, title, and metadata';
    })();

    const biasedSubTestRemediation = (() => {
      if (hasBiased) {
        const areas = [];
        if (metadataTitleBiasedMatches.length > 0) areas.push('title');
        if (metaBiasedMatches.length > 0) areas.push('metadata');
        if (bodyBiasedMatches.length > 0) areas.push('body content');
        return `Replace biased language with inclusive alternatives in ${areas.join(', ')}`;
      }
      return 'No action needed';
    })();

    const subTests = [
      {
        name: 'Absolutes',
        status: absolutesSubTestStatus,
        message: absolutesSubTestMessage,
        location: absolutesSubTestLocation,
        remediation: absolutesSubTestRemediation,
      },
      {
        name: 'Biased Language',
        status: biasedSubTestStatus,
        message: biasedSubTestMessage,
        location: biasedSubTestLocation,
        remediation: biasedSubTestRemediation,
      },
    ];

    const overallStatus = (hasAbsolutes || hasBiased) ? 'fail' : 'pass';

    return {
      status: overallStatus,
      message: (() => {
        const issues = [];
        if (hasAbsolutes) {
          const totalAbsolutes = metadataTitleMatches.length + metaMatches.length
             + bodyMatches.length;
          issues.push(`${totalAbsolutes} absolute terms`);
        }
        if (hasBiased) {
          const totalBiased = metadataTitleBiasedMatches.length + metaBiasedMatches.length
             + bodyBiasedMatches.length;
          issues.push(`${totalBiased} biased language terms`);
        }

        if (issues.length > 0) {
          return `Found ${issues.join(' and ')} in content`;
        }
        return 'No problematic language detected in content areas';
      })(),
      location: 'Body content, title, and metadata',
      remediation: (() => {
        const actions = [];
        if (hasAbsolutes) {
          actions.push('qualify absolute statements');
        }
        if (hasBiased) {
          actions.push('replace biased language with inclusive alternatives');
        }

        if (actions.length > 0) {
          return `Review content and ${actions.join(' and ')}`;
        }
        return 'No action needed';
      })(),
      subTests,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `Terms test execution failed: ${error.message}`,
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

export default async function termsTest(pageSource) {
  // Execute the actual test logic
  return runTest(pageSource);
}
