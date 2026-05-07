/**
 * ERP Core - Shared Validators
 */

export function validateRequired(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${fieldName} is required`);
  }
  return true;
}

export function validatePositiveNumber(value, fieldName) {
  if (typeof value !== 'number' || value <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
  return true;
}

export function validateNonNegativeNumber(value, fieldName) {
  if (typeof value !== 'number' || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return true;
}

export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
  return true;
}

export function validateTaxId(taxId) {
  if (!/^\d{10,13}$/.test(taxId)) {
    throw new Error('Tax ID must be 10-13 digits');
  }
  return true;
}
