/**
 * Utility functions for email handling
 */

/**
 * Normalizes an email address by converting it to lowercase
 * @param {string} email - The email address to normalize
 * @returns {string} The normalized email address
 */
export function normalizeEmail(email) {
  if (!email) return '';
  return email.toLowerCase();
}

/**
 * Compares two email addresses case-insensitively
 * @param {string} email1 - First email address
 * @param {string} email2 - Second email address
 * @returns {boolean} True if emails match (case-insensitive)
 */
export function compareEmails(email1, email2) {
  if (!email1 || !email2) return false;
  return normalizeEmail(email1) === normalizeEmail(email2);
}
