import { describe, it, expect } from 'vitest';
import { JournalEntry } from '../../src/core/journal.js';
import { Account } from '../../src/core/account.js';

describe('JournalEntry', () => {
  it('should create a journal entry with reference', () => {
    const entry = new JournalEntry('JV-001', 'Test entry');
    expect(entry.reference).toBe('JV-001');
    expect(entry.description).toBe('Test entry');
    expect(entry.posted).toBe(false);
  });

  it('should add lines to journal entry', () => {
    const entry = new JournalEntry('JV-001', 'Test entry');
    entry.addLine('1000', 1000, 0);
    entry.addLine('4000', 0, 1000);
    expect(entry.lines).toHaveLength(2);
  });

  it('should validate balanced journal entry', () => {
    const entry = new JournalEntry('JV-001', 'Test entry');
    entry.addLine('1000', 1000, 0);
    entry.addLine('4000', 0, 1000);
    const result = entry.validate();
    expect(result.valid).toBe(true);
  });

  it('should reject unbalanced journal entry', () => {
    const entry = new JournalEntry('JV-001', 'Test entry');
    entry.addLine('1000', 1000, 0);
    entry.addLine('4000', 0, 500);
    const result = entry.validate();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Debit');
  });

  it('should post journal entry to accounts', () => {
    const cash = new Account('1000', 'Cash', 'asset');
    const revenue = new Account('4000', 'Revenue', 'revenue');
    const entry = new JournalEntry('JV-001', 'Test entry');
    entry.addLine('1000', 1000, 0);
    entry.addLine('4000', 0, 1000);
    entry.post([cash, revenue]);
    expect(entry.posted).toBe(true);
    expect(cash.getBalance()).toBe(1000);
    expect(revenue.getBalance()).toBe(1000);
  });
});
