// Import this first in tests whose static imports load modules that read getNx() or getNx2()
// at import time. ES modules evaluate sibling imports in order, so setNx runs before them.
import { setNx } from '../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
