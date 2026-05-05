import { describe, it, expect } from 'vitest';
import { Ledger } from '../../src/core/ledger.js';
import { Account } from '../../src/core/account.js';

describe('Ledger', () => {
  it('should add accounts to ledger', () => {
    const ledger = new Ledger();
    const cash = new Account('1000', 'Cash', 'asset');
    ledger.addAccount(cash);
    expect(ledger.getAllAccounts()).toHaveLength(1);
  });

  it('should reject duplicate account codes', () => {
    const ledger = new Ledger();
    ledger.addAccount(new Account('1000', 'Cash', 'asset'));
    expect(() => ledger.addAccount(new Account('1000', 'Petty Cash', 'asset')))
      .toThrow('already exists');
  });

  it('should calculate trial balance correctly', () => {
    const ledger = new Ledger();
    const cash = new Account('1000', 'Cash', 'asset');
    const revenue = new Account('4000', 'Revenue', 'revenue');
    cash.debit(5000);
    revenue.credit(5000);
    ledger.addAccount(cash);
    ledger.addAccount(revenue);
    const tb = ledger.getTrialBalance();
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(5000);
    expect(tb.totalCredit).toBe(5000);
  });
});
