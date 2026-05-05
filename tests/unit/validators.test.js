import { describe, it, expect } from 'vitest';
import {
  validateRequired,
  validatePositiveNumber,
  validateEmail,
  validateTaxId
} from '../../src/shared/validators.js';

describe('Validators', () => {
  it('should validate required fields', () => {
    expect(() => validateRequired('', 'Name')).toThrow('Name is required');
    expect(() => validateRequired(null, 'Name')).toThrow('Name is required');
    expect(validateRequired('John', 'Name')).toBe(true);
  });

  it('should validate positive numbers', () => {
    expect(() => validatePositiveNumber(-1, 'Price')).toThrow('Price must be a positive number');
    expect(() => validatePositiveNumber(0, 'Price')).toThrow('Price must be a positive number');
    expect(validatePositiveNumber(100, 'Price')).toBe(true);
  });

  it('should validate email format', () => {
    expect(() => validateEmail('invalid')).toThrow('Invalid email format');
    expect(validateEmail('test@example.com')).toBe(true);
  });

  it('should validate tax ID format', () => {
    expect(() => validateTaxId('123')).toThrow('Tax ID must be 10-13 digits');
    expect(validateTaxId('1234567890')).toBe(true);
  });
});
