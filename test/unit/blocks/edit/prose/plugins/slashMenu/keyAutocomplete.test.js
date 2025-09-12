import { expect } from '@esm-bundle/chai';
import { processKeyData } from '../../../../../../../blocks/edit/prose/plugins/slashMenu/keyAutocomplete.js';

describe('processKeyData', () => {
  it('should process key data correctly', () => {
    // Test data
    const testData = [{
      blocks: 'Block1, Block2',
      key: 'testKey',
      values: 'Label1=Value1|Label2=Value2',
    }];

    const result = processKeyData(testData);

    // Test the structure
    expect(result).to.be.instanceof(Map);
    expect(result.has('block1')).to.be.true;
    expect(result.has('block2')).to.be.true;

    // Test block1 contents
    const block1Map = result.get('block1');
    expect(block1Map).to.be.instanceof(Map);
    expect(block1Map.has('testkey')).to.be.true;

    // Test values array
    const values = block1Map.get('testkey');
    expect(values).to.be.an('array');
    expect(values).to.have.lengthOf(2);

    // Test first value object
    const firstValue = values[0];
    expect(firstValue).to.have.property('title', 'Label1');
    expect(firstValue).to.have.property('value', 'Value1');
    expect(firstValue).to.have.property('command').that.is.a('function');
    expect(firstValue).to.have.property('class', 'key-autocomplete');
  });

  it('should handle empty data', () => {
    const result = processKeyData(null);
    expect(result).to.be.instanceof(Map);
    expect(result.size).to.equal(0);
  });

  it('should use label as value when no explicit value is provided', () => {
    const testData = [{
      blocks: 'Block1',
      key: 'testKey',
      values: 'Label1',
    }];

    const result = processKeyData(testData);
    const values = result.get('block1').get('testkey');
    expect(values[0].title).to.equal('Label1');
    expect(values[0].value).to.equal('Label1');
  });

  it('should handle multiple blocks and trim whitespace', () => {
    const testData = [{
      blocks: ' Block1 , Block2 ',
      key: 'testKey',
      values: 'Label1=Value1',
    }];

    const result = processKeyData(testData);
    expect(result.has('block1')).to.be.true;
    expect(result.has('block2')).to.be.true;

    // Verify both blocks have the same data
    const block1Values = result.get('block1').get('testkey');
    const block2Values = result.get('block2').get('testkey');
    expect(block1Values).to.deep.equal(block2Values);
  });
});
