import { test, expect } from '@playwright/test';

test('Branch name must respect IMS "spec"', () => {
  const { GITHUB_HEAD_REF: branch } = process.env;
  if (branch) {
    // specs: max 8 alpha numeric characters
    const specs = /^[a-zA-Z0-9]{1,8}$/;
    expect(branch).toMatch(specs);
  }
});
