import { expect } from '@esm-bundle/chai';
import {
  processKeyData,
  createKeyMenuItems,
  normalizeForSlashMenu,
} from '../../../../../../../blocks/edit/prose/plugins/slashMenu/keyAutocomplete.js';

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
    const block1Values = result.get('block1').get('testKey');
    const block2Values = result.get('block2').get('testKey');
    expect(block1Values).to.deep.equal(block2Values);
  });

  it('should copy "all" block values to other blocks', () => {
    const testData = [
      {
        blocks: 'all',
        key: 'sharedKey',
        values: 'Shared1=Value1|Shared2=Value2',
      },
      {
        blocks: 'block1',
        key: 'specificKey',
        values: 'Specific=SpecificValue',
      },
    ];

    const result = processKeyData(testData);
    const block1Map = result.get('block1');

    expect(block1Map.has('specifickey')).to.be.true;
    expect(block1Map.has('sharedkey')).to.be.true;

    const sharedValues = block1Map.get('sharedkey');
    expect(sharedValues).to.have.lengthOf(2);
    expect(sharedValues[0].title).to.equal('Shared1');
  });

  it('should not override specific block values with "all" block values', () => {
    const testData = [
      {
        blocks: 'all',
        key: 'testKey',
        values: 'AllValue=AllVal',
      },
      {
        blocks: 'block1',
        key: 'testKey',
        values: 'SpecificValue=SpecificVal',
      },
    ];

    const result = processKeyData(testData);
    const block1Values = result.get('block1').get('testkey');

    expect(block1Values).to.have.lengthOf(1);
    expect(block1Values[0].title).to.equal('SpecificValue');
    expect(block1Values[0].value).to.equal('SpecificVal');
  });

  it('should return "all" block as fallback for undefined blocks', () => {
    const testData = [{
      blocks: 'all',
      key: 'testKey',
      values: 'Label1=Value1',
    }];

    const result = processKeyData(testData);
    const undefinedBlock = result.get('nonexistent-block');

    expect(undefinedBlock).to.be.instanceof(Map);
    expect(undefinedBlock.has('testkey')).to.be.true;
  });

  it('should normalize block names for fallback lookup', () => {
    const testData = [{
      blocks: 'My Block',
      key: 'testKey',
      values: 'Label1=Value1',
    }];

    const result = processKeyData(testData);

    const normalizedBlock = result.get('My Block');
    expect(normalizedBlock).to.be.instanceof(Map);
    expect(normalizedBlock.has('testkey')).to.be.true;
  });
});

describe('normalizeForSlashMenu', () => {
  it('should convert to lowercase', () => {
    expect(normalizeForSlashMenu('MyBlock')).to.equal('myblock');
  });

  it('should trim whitespace', () => {
    expect(normalizeForSlashMenu('  myblock  ')).to.equal('myblock');
  });

  it('should replace spaces with hyphens', () => {
    expect(normalizeForSlashMenu('my block name')).to.equal('my-block-name');
  });

  it('should handle multiple spaces', () => {
    expect(normalizeForSlashMenu('my   block   name')).to.equal('my-block-name');
  });

  it('should handle null/undefined', () => {
    expect(normalizeForSlashMenu(null)).to.be.undefined;
    expect(normalizeForSlashMenu(undefined)).to.be.undefined;
  });

  it('should handle empty string', () => {
    expect(normalizeForSlashMenu('')).to.equal('');
  });

  it('should handle mixed case with spaces', () => {
    expect(normalizeForSlashMenu('My Test Block')).to.equal('my-test-block');
  });
});

describe('createKeyMenuItems', () => {
  it('should create menu items from keyData Map', () => {
    const keyData = new Map([
      ['key1', [{ title: 'Value1' }]],
      ['key2', [{ title: 'Value2' }]],
      ['key3', [{ title: 'Value3' }]],
    ]);

    const menuItems = createKeyMenuItems(keyData);

    expect(menuItems).to.be.an('array');
    expect(menuItems).to.have.lengthOf(3);

    expect(menuItems[0].title).to.equal('key1');
    expect(menuItems[0].value).to.equal('key1');
    expect(menuItems[0].class).to.equal('key-autocomplete');
    expect(menuItems[0].command).to.be.a('function');

    expect(menuItems[1].title).to.equal('key2');
    expect(menuItems[2].title).to.equal('key3');
  });

  it('should return empty array for null keyData', () => {
    const menuItems = createKeyMenuItems(null);
    expect(menuItems).to.be.an('array');
    expect(menuItems).to.have.lengthOf(0);
  });

  it('should return empty array for undefined keyData', () => {
    const menuItems = createKeyMenuItems(undefined);
    expect(menuItems).to.be.an('array');
    expect(menuItems).to.have.lengthOf(0);
  });

  it('should return empty array for empty Map', () => {
    const keyData = new Map();
    const menuItems = createKeyMenuItems(keyData);
    expect(menuItems).to.be.an('array');
    expect(menuItems).to.have.lengthOf(0);
  });

  it('should preserve key order from Map iteration', () => {
    const keyData = new Map([
      ['alpha', []],
      ['beta', []],
      ['gamma', []],
    ]);

    const menuItems = createKeyMenuItems(keyData);

    expect(menuItems[0].title).to.equal('alpha');
    expect(menuItems[1].title).to.equal('beta');
    expect(menuItems[2].title).to.equal('gamma');
  });

  it('should handle keys with special characters', () => {
    const keyData = new Map([
      ['key-with-dashes', []],
      ['key_with_underscores', []],
    ]);

    const menuItems = createKeyMenuItems(keyData);

    expect(menuItems[0].title).to.equal('key-with-dashes');
    expect(menuItems[1].title).to.equal('key_with_underscores');
  });

  it('should create menu items where title equals value', () => {
    const keyData = new Map([
      ['testKey', []],
    ]);

    const menuItems = createKeyMenuItems(keyData);

    expect(menuItems[0].title).to.equal(menuItems[0].value);
    expect(menuItems[0].title).to.equal('testKey');
  });
});
