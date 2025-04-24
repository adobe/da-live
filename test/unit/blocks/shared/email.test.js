import { expect } from '@esm-bundle/chai';
import { normalizeEmail, compareEmails } from '../../../../blocks/shared/utils.js';

describe('Email utilities', () => {
  describe('normalizeEmail', () => {
    it('should convert email to lowercase', () => {
      expect(normalizeEmail('Test@Example.com')).to.equal('test@example.com');
      expect(normalizeEmail('USER@DOMAIN.COM')).to.equal('user@domain.com');
    });

    it('should handle empty or null input', () => {
      expect(normalizeEmail('')).to.equal('');
      expect(normalizeEmail(null)).to.equal('');
      expect(normalizeEmail(undefined)).to.equal('');
    });
  });

  describe('compareEmails', () => {
    it('should compare emails case-insensitively', () => {
      expect(compareEmails('Test@Example.com', 'test@example.com')).to.be.true;
      expect(compareEmails('USER@DOMAIN.COM', 'user@domain.com')).to.be.true;
      expect(compareEmails('Test@Example.com', 'TEST@EXAMPLE.COM')).to.be.true;
    });

    it('should return false for different emails', () => {
      expect(compareEmails('test1@example.com', 'test2@example.com')).to.be.false;
      expect(compareEmails('test@example1.com', 'test@example2.com')).to.be.false;
    });

    it('should handle empty or null input', () => {
      expect(compareEmails('', 'test@example.com')).to.be.false;
      expect(compareEmails('test@example.com', '')).to.be.false;
      expect(compareEmails(null, 'test@example.com')).to.be.false;
      expect(compareEmails('test@example.com', null)).to.be.false;
    });
  });
});
