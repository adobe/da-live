/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { expect } from '@esm-bundle/chai';

import { formatExternalBrief } from '../../../../../blocks/shared/aem-assets/external-brief.js';

function makeDoc(text, h1Title = '') {
  return {
    textContent: text,
    descendants: (fn) => {
      if (h1Title) {
        fn({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: h1Title });
      }
    },
  };
}

describe('shared AEM asset external brief', () => {
  it('returns empty string when document has no text content', () => {
    const doc = makeDoc('');
    expect(formatExternalBrief(doc)).to.equal('');
  });

  it('includes content text in brief', () => {
    const doc = makeDoc('We sell great shoes.');
    const brief = formatExternalBrief(doc);
    expect(brief).to.include('We sell great shoes.');
  });

  it('includes h1 title in brief when present', () => {
    const doc = makeDoc('We sell great shoes.', 'Our Products');
    const brief = formatExternalBrief(doc);
    expect(brief).to.include('Title: Our Products');
  });

  it('omits title line when no h1 is present', () => {
    const doc = makeDoc('Some page content without a heading.');
    const brief = formatExternalBrief(doc);
    expect(brief).to.not.include('Title:');
    expect(brief).to.include('Some page content without a heading.');
  });
});
