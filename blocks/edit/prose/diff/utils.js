import { htmlDiff } from './htmldiff.js';

function fragmentToHTML(fragment) {
  if (!fragment) return '';

  if (typeof fragment === 'string') return fragment;

  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment.cloneNode(true));
  return tempDiv.innerHTML;
}

function trimEmptyParagraphs(html) {
  if (!html || typeof html !== 'string') return html;

  let trimmed = html;

  while (trimmed.startsWith('<p></p>')) {
    trimmed = trimmed.substring(7);
  }

  while (trimmed.endsWith('<p></p>')) {
    trimmed = trimmed.substring(0, trimmed.length - 7);
  }

  return trimmed;
}

// eslint-disable-next-line import/prefer-default-export
export function generateDiff(deletedContent, addedContent) {
  try {
    const deletedHTMLString = fragmentToHTML(deletedContent);
    const addedHTMLString = fragmentToHTML(addedContent);

    const tempDelDiv = document.createElement('div');
    tempDelDiv.innerHTML = deletedHTMLString;
    const deletedText = tempDelDiv.textContent || tempDelDiv.innerText || '';

    const tempAddDiv = document.createElement('div');
    tempAddDiv.innerHTML = addedHTMLString;
    const addedText = tempAddDiv.textContent || tempAddDiv.innerText || '';

    if (!deletedText.trim() && !addedText.trim()) {
      return '<p style="text-align: center; color: #666; margin: 20px 0;">No content to compare</p>';
    }

    const rawDiffResult = htmlDiff(deletedHTMLString, addedHTMLString);

    const diffResult = trimEmptyParagraphs(rawDiffResult);

    if (diffResult && diffResult.trim()) {
      return `<div class="html-diff">${diffResult}</div>`;
    }

    return '<p style="text-align: center; color: #666; margin: 20px 0;">No differences found</p>';
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error generating diff:', error);
    return '<p style="text-align: center; color: #d32f2f; margin: 20px 0;">Error generating diff</p>';
  }
}
