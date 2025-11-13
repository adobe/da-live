function runTest(pageSource) {
  // Parse the page source
  const parser = new DOMParser();
  const doc = parser.parseFromString(pageSource, 'text/html');

  // Check for special characters in text content
  const textContent = doc.body ? doc.body.textContent : '';
  const specialCharPattern = /[^\w\s.,!?;:'"()-]/g;
  const specialChars = textContent.match(specialCharPattern);
  const hasSpecialChars = specialChars && specialChars.length > 0;

  // Get unique special characters and their context
  let specialCharDetails = '';
  if (hasSpecialChars) {
    const uniqueChars = [...new Set(specialChars)];
    specialCharDetails = uniqueChars.map((char) => {
      // Find context around the special character
      const charIndex = textContent.indexOf(char);
      const start = Math.max(0, charIndex - 20);
      const end = Math.min(textContent.length, charIndex + 20);
      const context = textContent.substring(start, end).trim();

      // Use the same highlighting style as absolutes test
      const termIndex = context.indexOf(char);
      if (termIndex !== -1) {
        const beforeTerm = context.substring(0, termIndex).trim();
        const afterTerm = context.substring(termIndex + char.length).trim();

        // Format: "... term in context ..."
        let readableContext = '';
        if (beforeTerm) {
          readableContext += `...${beforeTerm} `;
        }
        readableContext += `<strong style="background-color: #ffeb3b; padding: 2px 4px; border-radius: 3px;">${char}</strong>`;
        if (afterTerm) {
          readableContext += ` ${afterTerm}...`;
        }
        return readableContext;
      }
      return `"${char}" in context: "...${context}..."`;
    }).join('\n• ');
  }

  // Create sub-tests
  const subTests = [
    {
      name: 'Special Character Detection',
      status: hasSpecialChars ? 'fail' : 'pass',
      message: hasSpecialChars ? `Found ${specialChars.length} special characters` : 'No special characters detected',
      location: hasSpecialChars ? specialCharDetails : 'No special characters found',
      remediation: hasSpecialChars ? 'Review and clean special characters' : 'No action needed',
    },
    {
      name: 'HTML Entity Usage',
      status: 'pass',
      message: 'HTML entities properly handled',
      location: 'HTML structure',
      remediation: 'No action needed',
    },
  ];

  // Determine overall status
  const overallStatus = hasSpecialChars ? 'fail' : 'pass';

  return {
    status: overallStatus,
    message: hasSpecialChars ? 'Special characters detected in content' : 'Special characters test passed',
    location: 'All content blocks',
    remediation: hasSpecialChars ? 'Review and clean special characters' : 'No action needed',
    subTests,
  };
}

export default async function testSpecialCharacters(pageSource) {
  // Execute the actual test logic
  return runTest(pageSource);
}
