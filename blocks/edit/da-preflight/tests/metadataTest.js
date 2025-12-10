function runTest(pageSource) {
  // Parse the page source
  const parser = new DOMParser();
  const doc = parser.parseFromString(pageSource, 'text/html');

  // Check for metadata div presence
  const metadataDiv = doc.querySelector('div.metadata');
  const hasMetadataDiv = !!metadataDiv;

  // Check for title key-value pair in metadata
  let hasTitleKey = false;
  let titleValue = '';

  if (hasMetadataDiv) {
    // Parse the HTML structure: <div><div><p>key</p></div><div><p>value</p></div></div>
    const metadataDivs = metadataDiv.children; // Get direct children (the outer divs)

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

        // Check if this is the title row
        if (key.toLowerCase() === 'title') {
          hasTitleKey = true;
          titleValue = value;
          break;
        }
      }
    }
  }

  // Create sub-tests
  const subTests = [
    {
      name: 'Metadata Div Presence',
      status: hasMetadataDiv ? 'pass' : 'fail',
      message: hasMetadataDiv ? 'Metadata div is present' : 'Metadata div is missing',
      location: hasMetadataDiv ? 'Page structure' : 'Page structure',
      remediation: hasMetadataDiv ? 'No action needed' : 'Add metadata div to page',
    },
    {
      name: 'Title Key Present',
      status: hasTitleKey ? 'pass' : 'fail',
      message: hasTitleKey ? 'Title key is present in metadata' : 'Title key is missing from metadata',
      location: hasTitleKey ? 'Metadata div' : 'Page Metadata',
      remediation: hasTitleKey ? 'No action needed' : 'Add title key-value pair to metadata',
    },
    {
      name: 'Title Value Set',
      status: hasTitleKey && titleValue.length > 0 ? 'pass' : 'fail',
      message: (() => {
        if (!hasTitleKey || titleValue.length === 0) {
          return hasTitleKey ? 'Title key exists but has no value' : 'Title key is missing';
        }
        return `Title value is set: "${titleValue.length > 50 ? `${titleValue.substring(0, 50)}...` : titleValue}"`;
      })(),
      location: (() => {
        if (!hasTitleKey || titleValue.length === 0) {
          return 'Metadata div';
        }
        return `Title: "${titleValue.length > 50 ? `${titleValue.substring(0, 50)}...` : titleValue}"`;
      })(),
      remediation: (() => {
        if (!hasTitleKey) {
          return 'Add title key-value pair to metadata';
        }
        if (titleValue.length === 0) {
          return 'Set a value for the title key';
        }
        return 'No action needed';
      })(),
    },
  ];

  // Determine overall status
  const overallStatus = (hasMetadataDiv && hasTitleKey && titleValue.length > 0) ? 'pass' : 'fail';

  return {
    status: overallStatus,
    message: (() => {
      if (!hasMetadataDiv) {
        return 'Metadata div is missing from page';
      }
      if (!hasTitleKey) {
        return 'Metadata div exists but title key is missing';
      }
      if (titleValue.length === 0) {
        return 'Title key exists but has no value';
      }
      return 'Metadata div and title are properly configured';
    })(),
    location: !hasMetadataDiv ? 'Page structure' : 'Metadata div',
    remediation: (() => {
      if (!hasMetadataDiv) {
        return 'Add metadata div to page';
      }
      if (!hasTitleKey) {
        return 'Add title key-value pair to metadata';
      }
      if (titleValue.length === 0) {
        return 'Set a value for the title key';
      }
      return 'No action needed';
    })(),
    subTests,
  };
}

export default async function testMetadata(pageSource) {
  // Execute the actual test logic
  return runTest(pageSource);
}
