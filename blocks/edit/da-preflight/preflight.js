import { DA_ORIGIN } from '../../shared/constants.js';
import getPathDetails from '../../shared/pathDetails.js';

// eslint-disable-next-line no-console
console.log('Preflight: Script is loading...');

// Simple daFetch implementation for iframe context
// Authentication is inherited from parent page context
async function daFetch(url, opts = {}) {
  opts.headers = opts.headers || {};
  const resp = await fetch(url, opts);
  return resp;
}

// eslint-disable-next-line no-console
console.log('Preflight: Imports successful, DA_ORIGIN:', DA_ORIGIN);

async function init() {
  // eslint-disable-next-line no-console
  console.log('Preflight: Init function called');
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const scanNowBtn = document.getElementById('scan-now-btn');

  // Track test results for summary
  let totalTests = 0;
  let totalPasses = 0;
  let totalFails = 0;
  let totalUnknown = 0;

  // Track if results heading listener has been added
  let resultsHeadingListenerAdded = false;

  // Function definitions
  async function loadConfiguration() {
    try {
      // Get context from URL params (when embedded in iframe) or from getPathDetails
      const urlParams = new URLSearchParams(window.location.search);
      const org = urlParams.get('org');
      const repo = urlParams.get('repo');

      // eslint-disable-next-line no-console
      console.log('Preflight: URL params org:', org, 'repo:', repo);
      let context;
      if (org && repo) {
        context = { owner: org, repo };
      } else {
        context = getPathDetails();
        if (!context || !context.owner || !context.repo) {
          throw new Error('Could not determine org/repo from current context');
        }
      }

      const configUrl = `${DA_ORIGIN}/config/${context.owner}/${context.repo}/`;
      // eslint-disable-next-line no-console
      console.log('Preflight: Fetching config from:', configUrl);

      const response = await daFetch(configUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // eslint-disable-next-line no-console
      console.log('Preflight: Config data:', data);

      // Extract only the preflight section
      const preflightData = data.preflight;

      // eslint-disable-next-line no-console
      console.log('Preflight: Preflight data:', preflightData);

      if (preflightData && preflightData.data) {
        // Hide loading, show preflight data
        loadingEl.style.display = 'none';

        // Filter for only 'test' keys and create styled list
        const testItems = preflightData.data.filter((item) => item.key === 'test');

        if (testItems.length > 0) {
          const testsSection = document.getElementById('configured-tests-section');
          const testsContent = document.getElementById('tests-content');
          const testsHeading = document.getElementById('tests-heading');
          const collapseIndicator = document.querySelector('.collapse-indicator');

          let testsList = '<ul class="test-list">';
          testItems.forEach((item) => {
            testsList += `<li class="test-item">${item.label || item.value}</li>`;
          });
          testsList += '</ul>';

          testsContent.innerHTML = testsList;
          testsSection.style.display = 'block';

          // Start collapsed by default
          testsContent.style.display = 'none';
          collapseIndicator.classList.add('collapsed');

          // Add click handler for collapse/expand
          testsHeading.addEventListener('click', () => {
            const isCollapsed = testsContent.style.display === 'none';
            testsContent.style.display = isCollapsed ? 'block' : 'none';
            collapseIndicator.classList.toggle('collapsed', !isCollapsed);
          });

          // Store test items for later execution
          window.configuredTestItems = testItems;
        } else {
          const testsSection = document.getElementById('configured-tests-section');
          const testsContent = document.getElementById('tests-content');
          testsContent.textContent = 'No test configuration values found.';
          testsSection.style.display = 'block';
        }
      } else {
        throw new Error('No preflight data found in response');
      }
    } catch (error) {
      // Hide loading, show error
      loadingEl.style.display = 'none';
      errorEl.textContent = `Error fetching configuration: ${error.message}`;
      errorEl.style.display = 'block';
    }
  }

  function addSummaryRow() {
    const resultsContent = document.getElementById('results-content');

    // Remove existing summary box if it exists
    const existingSummaryBox = document.getElementById('summary-box');
    if (existingSummaryBox) {
      existingSummaryBox.remove();
    }

    // Create summary box (not a table row)
    const summaryBox = document.createElement('div');
    summaryBox.id = 'summary-box';
    summaryBox.className = 'summary-box';

    summaryBox.innerHTML = `
      <div class="summary-container">
        <div class="summary-title">📊 Test Results Summary</div>
        <div class="summary-stats">
          <span class="summary-stat">
            <span class="summary-label">Total Tests:</span>
            <span class="summary-value" id="summary-total">0</span>
          </span>
          <span class="summary-stat">
            <span class="summary-label">Passed:</span>
            <span class="summary-value summary-pass" id="summary-passes">0</span>
          </span>
          <span class="summary-stat">
            <span class="summary-label">Failed:</span>
            <span class="summary-value summary-fail" id="summary-fails">0</span>
          </span>
          <span class="summary-stat">
            <span class="summary-label">Unknown:</span>
            <span class="summary-value summary-unknown" id="summary-unknown">0</span>
          </span>
        </div>
      </div>
    `;

    // Insert summary box before the results table
    const resultsTable = resultsContent.querySelector('.results-table');
    resultsContent.insertBefore(summaryBox, resultsTable);
  }

  function updateSummaryRow() {
    document.getElementById('summary-total').textContent = totalTests;
    document.getElementById('summary-passes').textContent = totalPasses;
    document.getElementById('summary-fails').textContent = totalFails;
    document.getElementById('summary-unknown').textContent = totalUnknown;
  }

  // Add result to the results table
  function addResultToTable(testName, result) {
    const resultsTbody = document.getElementById('results-tbody');

    // Create a collapsible test group
    const testGroupRow = document.createElement('tr');
    testGroupRow.className = 'test-group-row';

    // Determine if all sub-tests pass (for auto-collapse)
    let allTestsPass = true;
    if (result.subTests && result.subTests.length > 0) {
      allTestsPass = result.subTests.every((subTest) => subTest.status === 'pass');
    } else {
      allTestsPass = result.status === 'pass';
    }

    // Create the test group header row
    let statusIcon;
    if (result.status === 'pass') {
      statusIcon = '✅';
    } else if (result.status === 'fail') {
      statusIcon = '❌';
    } else {
      statusIcon = '❓';
    }

    testGroupRow.innerHTML = `
      <td colspan="4">
        <div class="test-group-header ${allTestsPass ? 'collapsed' : ''}" data-test-name="${testName}">
          <div class="test-group-title">
            <span class="collapse-indicator">${allTestsPass ? '▶' : '▼'}</span>
            <strong>${testName}</strong>
          </div>
          <div class="test-group-status">
            <span class="status-indicator status-${result.status}">${statusIcon} ${result.status.toUpperCase()}</span>
          </div>
        </div>
        <div class="test-group-content ${allTestsPass ? 'collapsed' : ''}" data-test-name="${testName}">
          <table class="test-details-table">
            <tr class="parent-test-row">
              <td><strong>${testName}</strong></td>
              <td>${statusIcon}</td>
              <td class="location-cell"></td>
              <td>${result.remediation || 'N/A'}</td>
            </tr>
          </table>
        </div>
      </td>
    `;

    resultsTbody.appendChild(testGroupRow);

    // Set the location content with proper HTML rendering
    const locationCell = testGroupRow.querySelector('.location-cell');
    locationCell.innerHTML = result.location || 'N/A';

    // Add click handler for collapse/expand
    const groupHeader = testGroupRow.querySelector('.test-group-header');
    const groupContent = testGroupRow.querySelector('.test-group-content');
    const collapseIndicator = testGroupRow.querySelector('.collapse-indicator');

    groupHeader.addEventListener('click', () => {
      const isCollapsed = groupContent.classList.contains('collapsed');
      groupContent.classList.toggle('collapsed', !isCollapsed);
      groupHeader.classList.toggle('collapsed', !isCollapsed);
      collapseIndicator.textContent = isCollapsed ? '▼' : '▶';
    });

    // Add sub-tests if they exist
    if (result.subTests && result.subTests.length > 0) {
      const testDetailsTable = testGroupRow.querySelector('.test-details-table');

      result.subTests.forEach((subTest) => {
        const subRow = document.createElement('tr');
        subRow.className = 'sub-test-row';

        let subStatusIcon;
        if (subTest.status === 'pass') {
          subStatusIcon = '✅';
        } else if (subTest.status === 'fail') {
          subStatusIcon = '❌';
        } else {
          subStatusIcon = '❓';
        }

        // Format location as HTML list if it contains multiple items
        let locationHtml = subTest.location || 'N/A';
        if (subTest.status === 'fail' && subTest.location && subTest.location.includes('\n• ')) {
          const items = subTest.location.split('\n• ');
          if (items.length > 1) {
            const listItems = items.map((item) => `<li>${item}</li>`).join('');
            locationHtml = `<ul class="location-list">${listItems}</ul>`;
          }
        }

        subRow.innerHTML = `
          <td style="padding-left: 30px;">└─ ${subTest.name}</td>
          <td>${subStatusIcon}</td>
          <td class="location-cell"></td>
          <td>${subTest.remediation || 'N/A'}</td>
        `;

        testDetailsTable.appendChild(subRow);

        // Set the location content with proper HTML rendering
        const subLocationCell = subRow.querySelector('.location-cell');
        subLocationCell.innerHTML = locationHtml;
      });
    }

    // Update counters
    if (result.subTests && result.subTests.length > 0) {
      result.subTests.forEach((subTest) => {
        totalTests += 1;
        if (subTest.status === 'pass') totalPasses += 1;
        else if (subTest.status === 'fail') totalFails += 1;
        else totalUnknown += 1;
      });
    } else {
      totalTests += 1;
      if (result.status === 'pass') totalPasses += 1;
      else if (result.status === 'fail') totalFails += 1;
      else totalUnknown += 1;
    }

    // Update summary after each test
    updateSummaryRow();
  }

  async function executeTest(testName, pageSource) {
    try {
      let module;

      // Check if testName is a URL (remote test)
      if (testName.startsWith('http://') || testName.startsWith('https://')) {
        // Fetch remote test file
        const response = await fetch(testName);
        if (!response.ok) {
          throw new Error(`Failed to fetch remote test: ${response.status} ${response.statusText}`);
        }

        const code = await response.text();

        // Create a blob URL and import it
        const blob = new Blob([code], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);

        try {
          module = await import(blobUrl);
        } finally {
          // Clean up the blob URL
          URL.revokeObjectURL(blobUrl);
        }
      } else {
        // Local test - use existing logic
        module = await import(`./tests/${testName}Test.js`);
      }

      return await module.default(pageSource);
    } catch (error) {
      return {
        status: 'fail',
        message: `Failed to load test module: ${error.message}`,
        location: 'N/A',
        remediation: 'Check console for details',
      };
    }
  }

  // Execute all configured tests
  async function executeConfiguredTests() {
    // Clear previous results
    const resultsTbody = document.getElementById('results-tbody');
    resultsTbody.innerHTML = '';

    // Reset counters
    totalTests = 0;
    totalPasses = 0;
    totalFails = 0;
    totalUnknown = 0;

    // Add summary row at the top
    addSummaryRow();

    // Get the configured test items
    const testItems = window.configuredTestItems || [];

    if (testItems.length === 0) {
      return;
    }

    // Fetch page source before executing tests
    let pageSource = null;
    try {
      // Get context from URL params (when embedded in iframe) or from getPathDetails
      const urlParams = new URLSearchParams(window.location.search);
      const org = urlParams.get('org');
      const repo = urlParams.get('repo');
      const path = urlParams.get('path');

      let context;
      let fullPath;
      if (org && repo) {
        context = { owner: org, repo };
        fullPath = path || `/${org}/${repo}`;
      } else {
        context = getPathDetails();
        fullPath = context.fullPath || `/${context.owner}/${context.repo}${context.path || ''}`;
      }

      // Add cache-busting parameter to ensure fresh content is fetched
      const cacheBuster = `?_=${Date.now()}`;
      const pageSourceResponse = await daFetch(
        `${DA_ORIGIN}/source${fullPath}.html${cacheBuster}`,
      );

      if (pageSourceResponse.ok) {
        pageSource = await pageSourceResponse.text();
      }
    } catch (error) {
      // Silently handle page source fetch errors
    }

    // Show and setup results section
    const resultsSection = document.getElementById('test-results-section');

    resultsSection.style.display = 'block';

    // Start results section expanded by default and always visible
    const resultsContent = document.getElementById('results-content');
    resultsContent.style.display = 'block';

    // Add click handler for collapse/expand (only once)
    if (!resultsHeadingListenerAdded) {
      const resultsHeading = document.getElementById('results-heading');
      resultsHeading.addEventListener('click', () => {
        const isCollapsed = resultsContent.style.display === 'none';
        resultsContent.style.display = isCollapsed ? 'block' : 'none';
      });
      resultsHeadingListenerAdded = true;
    }

    // Execute each configured test
    await Promise.all(testItems.map(async (testItem) => {
      try {
        // Execute the test based on its value, passing the page source
        const result = await executeTest(testItem.value, pageSource);

        // Add result to the table
        addResultToTable(testItem.label || testItem.value, result);
      } catch (error) {
        addResultToTable(testItem.label || testItem.value, {
          status: 'fail',
          message: error.message,
          location: 'N/A',
          remediation: 'Check console for details',
        });
      }
    }));

    // Update summary with final counts
    updateSummaryRow();
  }

  // Add click handler for Scan Now button
  scanNowBtn.addEventListener('click', async () => {
    await executeConfiguredTests();
  });

  // Load configuration on page load
  await loadConfiguration();
}

// Run init when DOM is ready or immediately if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

