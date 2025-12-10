function runTest(pageSource) {
  // Parse the page source
  const parser = new DOMParser();
  const doc = parser.parseFromString(pageSource, 'text/html');

  // Helper function to escape HTML entities
  const escapeHtml = (text) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const subTests = [];

  // Test 1: Check for images without alt text
  const images = doc.querySelectorAll('img');
  const imagesWithoutAlt = [];
  images.forEach((img, index) => {
    const alt = img.getAttribute('alt');
    if (alt === null || alt === undefined) {
      const src = img.getAttribute('src') || 'unknown source';
      imagesWithoutAlt.push(`Image ${index + 1}: ${src}`);
    }
  });

  subTests.push({
    name: 'Images Have Alt Text',
    status: imagesWithoutAlt.length === 0 ? 'pass' : 'fail',
    message: imagesWithoutAlt.length === 0
      ? `All ${images.length} images have alt attributes`
      : `${imagesWithoutAlt.length} of ${images.length} images missing alt text`,
    location: imagesWithoutAlt.length === 0
      ? 'All images'
      : imagesWithoutAlt.join('\n• '),
    remediation: imagesWithoutAlt.length === 0
      ? 'No action needed'
      : 'Add alt attributes to all images. Use empty alt="" for decorative images.',
  });

  // Test 2: Check for links without descriptive text
  const links = doc.querySelectorAll('a');
  const linksWithoutText = [];
  const linksWithGenericText = ['click here', 'read more', 'here', 'link', 'more'];

  links.forEach((link, index) => {
    const text = link.textContent.trim().toLowerCase();
    const ariaLabel = link.getAttribute('aria-label');
    const title = link.getAttribute('title');
    const href = link.getAttribute('href') || '#';

    if (!text && !ariaLabel && !title) {
      linksWithoutText.push(`Link ${index + 1}: ${href}`);
    } else if (text && linksWithGenericText.includes(text) && !ariaLabel) {
      linksWithoutText.push(`Link ${index + 1} has generic text "${text}": ${href}`);
    }
  });

  subTests.push({
    name: 'Links Have Descriptive Text',
    status: linksWithoutText.length === 0 ? 'pass' : 'fail',
    message: linksWithoutText.length === 0
      ? `All ${links.length} links have descriptive text`
      : `${linksWithoutText.length} of ${links.length} links lack descriptive text`,
    location: linksWithoutText.length === 0
      ? 'All links'
      : linksWithoutText.join('\n• '),
    remediation: linksWithoutText.length === 0
      ? 'No action needed'
      : 'Add descriptive link text or aria-label. Avoid generic phrases like "click here".',
  });

  // Test 3: Check heading hierarchy
  const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const headingLevels = [];
  const headingIssues = [];
  let previousLevel = 0;

  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName.substring(1), 10);
    headingLevels.push(level);

    // Check for skipped levels
    if (previousLevel > 0 && level > previousLevel + 1) {
      headingIssues.push(
        `Heading ${index + 1}: Skipped from &lt;h${previousLevel}&gt; to &lt;h${level}&gt; - "${heading.textContent.trim().substring(0, 50)}"`,
      );
    }

    // Check for multiple h1s
    if (level === 1 && previousLevel === 1) {
      headingIssues.push(
        `Heading ${index + 1}: Multiple &lt;h1&gt; elements found - "${heading.textContent.trim().substring(0, 50)}"`,
      );
    }

    previousLevel = level;
  });

  // Check if h1 exists
  const hasH1 = headingLevels.includes(1);
  if (!hasH1) {
    headingIssues.push('No &lt;h1&gt; element found on page');
  }

  subTests.push({
    name: 'Heading Hierarchy',
    status: headingIssues.length === 0 && hasH1 ? 'pass' : 'fail',
    message: headingIssues.length === 0 && hasH1
      ? `Heading hierarchy is correct (${headings.length} headings)`
      : `${headingIssues.length} heading hierarchy issues found`,
    location: headingIssues.length === 0
      ? 'Page headings'
      : headingIssues.join('\n• '),
    remediation: headingIssues.length === 0
      ? 'No action needed'
      : 'Ensure page has one &lt;h1&gt;, and headings follow sequential order without skipping levels.',
  });

  // Test 4: Check form inputs for labels
  const inputs = doc.querySelectorAll('input, select, textarea');
  const inputsWithoutLabels = [];

  inputs.forEach((input, index) => {
    const id = input.getAttribute('id');
    const ariaLabel = input.getAttribute('aria-label');
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    const title = input.getAttribute('title');
    const type = input.getAttribute('type') || 'text';

    // Skip hidden and submit/button inputs
    if (type === 'hidden' || type === 'submit' || type === 'button') {
      return;
    }

    // Check if input has a label
    let hasLabel = false;
    if (id) {
      const label = doc.querySelector(`label[for="${id}"]`);
      hasLabel = !!label;
    }

    if (!hasLabel && !ariaLabel && !ariaLabelledBy && !title) {
      const name = input.getAttribute('name') || `unnamed ${type}`;
      inputsWithoutLabels.push(`Input ${index + 1} (${type}): ${name}`);
    }
  });

  subTests.push({
    name: 'Form Inputs Have Labels',
    status: inputsWithoutLabels.length === 0 ? 'pass' : 'fail',
    message: inputsWithoutLabels.length === 0
      ? 'All form inputs have associated labels'
      : `${inputsWithoutLabels.length} form inputs missing labels`,
    location: inputsWithoutLabels.length === 0
      ? 'All form inputs'
      : inputsWithoutLabels.join('\n• '),
    remediation: inputsWithoutLabels.length === 0
      ? 'No action needed'
      : 'Associate labels with inputs using for/id attributes or aria-label.',
  });

  // Test 5: Check for lang attribute on html element
  const htmlElement = doc.querySelector('html');
  const hasLang = htmlElement && htmlElement.hasAttribute('lang');
  const langValue = htmlElement ? htmlElement.getAttribute('lang') : '';

  subTests.push({
    name: 'Language Attribute',
    status: hasLang && langValue ? 'pass' : 'fail',
    message: hasLang && langValue
      ? `Language set to "${langValue}"`
      : 'HTML element missing lang attribute',
    location: '&lt;html&gt; element',
    remediation: hasLang && langValue
      ? 'No action needed'
      : 'Add lang attribute to &lt;html&gt; element (e.g., lang="en" for English).',
  });

  // Test 6: Check for empty buttons
  const buttons = doc.querySelectorAll('button');
  const emptyButtons = [];

  buttons.forEach((button, index) => {
    const text = button.textContent.trim();
    const ariaLabel = button.getAttribute('aria-label');
    const ariaLabelledBy = button.getAttribute('aria-labelledby');

    if (!text && !ariaLabel && !ariaLabelledBy) {
      emptyButtons.push(`Button ${index + 1}: ${escapeHtml(button.outerHTML.substring(0, 100))}`);
    }
  });

  subTests.push({
    name: 'Buttons Have Accessible Names',
    status: emptyButtons.length === 0 ? 'pass' : 'fail',
    message: emptyButtons.length === 0
      ? `All ${buttons.length} buttons have accessible names`
      : `${emptyButtons.length} of ${buttons.length} buttons lack accessible names`,
    location: emptyButtons.length === 0
      ? 'All buttons'
      : emptyButtons.join('\n• '),
    remediation: emptyButtons.length === 0
      ? 'No action needed'
      : 'Add text content or aria-label to all buttons.',
  });

  // Test 7: Check for redundant title attributes
  const elementsWithTitle = doc.querySelectorAll('[title]');
  const redundantTitles = [];

  elementsWithTitle.forEach((element) => {
    const title = element.getAttribute('title');
    const text = element.textContent.trim();
    const ariaLabel = element.getAttribute('aria-label');

    // Check if title is redundant (same as visible text or aria-label)
    if (title === text || title === ariaLabel) {
      const tag = element.tagName.toLowerCase();
      const preview = `&lt;${tag}&gt;${text.substring(0, 50)}${text.length > 50 ? '...' : ''}&lt;/${tag}&gt;`;
      redundantTitles.push(preview);
    }
  });

  subTests.push({
    name: 'No Redundant Title Attributes',
    status: redundantTitles.length === 0 ? 'pass' : 'fail',
    message: redundantTitles.length === 0
      ? 'No redundant title attributes found'
      : `${redundantTitles.length} elements have redundant title attributes`,
    location: redundantTitles.length === 0
      ? 'N/A'
      : redundantTitles.join('\n• '),
    remediation: redundantTitles.length === 0
      ? 'No action needed'
      : 'Remove title attributes that duplicate visible text or aria-label.',
  });

  // Test 8: Check for ARIA misuse
  const ariaIssues = [];
  const elementsWithAria = doc.querySelectorAll('[role], [aria-label], [aria-labelledby], [aria-describedby]');

  elementsWithAria.forEach((element) => {
    const role = element.getAttribute('role');

    // Check for button role on links
    if (role === 'button' && element.tagName.toLowerCase() === 'a') {
      const href = element.getAttribute('href') || '#';
      ariaIssues.push(`Link with role="button": ${href} - Consider using &lt;button&gt; instead`);
    }

    // Check for aria-label on div/span without role
    const ariaLabel = element.getAttribute('aria-label');
    const tagName = element.tagName.toLowerCase();
    if (ariaLabel && !role && (tagName === 'div' || tagName === 'span')) {
      ariaIssues.push(
        `${tagName} with aria-label but no role: "${ariaLabel.substring(0, 50)}" - May not be announced by screen readers`,
      );
    }
  });

  subTests.push({
    name: 'Proper ARIA Usage',
    status: ariaIssues.length === 0 ? 'pass' : 'fail',
    message: ariaIssues.length === 0
      ? 'ARIA attributes are used correctly'
      : `${ariaIssues.length} potential ARIA misuse issues found`,
    location: ariaIssues.length === 0
      ? 'N/A'
      : ariaIssues.join('\n• '),
    remediation: ariaIssues.length === 0
      ? 'No action needed'
      : 'Review ARIA usage. Use semantic HTML elements when possible.',
  });

  // Determine overall status
  const failedTests = subTests.filter((test) => test.status === 'fail');
  const overallStatus = failedTests.length === 0 ? 'pass' : 'fail';

  return {
    status: overallStatus,
    message: failedTests.length === 0
      ? `All ${subTests.length} accessibility checks passed`
      : `${failedTests.length} of ${subTests.length} accessibility checks failed`,
    location: failedTests.length === 0
      ? 'Entire page'
      : `Failed: ${failedTests.map((t) => t.name).join(', ')}`,
    remediation: failedTests.length === 0
      ? 'No action needed - page follows accessibility best practices'
      : 'Review and fix the failed accessibility checks. See WCAG 2.1 guidelines for details.',
    subTests,
  };
}

export default async function testAccessibility(pageSource) {
  // Execute the actual test logic
  return runTest(pageSource);
}
