import { describe, it, expect } from 'vitest';
import { Account } from '../../src/core/account.js';

describe('Account', () => {
  it('should create an account with initial balance of 0', () => {
    const acc = new Account('1000', 'Cash', 'asset');
    expect(acc.code).toBe('1000');
    expect(acc.name).toBe('Cash');
    expect(acc.type).toBe('asset');
    expect(acc.getBalance()).toBe(0);
  });

  it('should increase asset balance on debit', () => {
    const acc = new Account('1000', 'Cash', 'asset');
    acc.debit(1000);
    expect(acc.getBalance()).toBe(1000);
  });

  it('should decrease asset balance on credit', () => {
    const acc = new Account('1000', 'Cash', 'asset');
    acc.debit(1000);
    acc.credit(300);
    expect(acc.getBalance()).toBe(700);
  });

  it('should increase liability balance on credit', () => {
    const acc = new Account('2000', 'Accounts Payable', 'liability');
    acc.credit(500);
    expect(acc.getBalance()).toBe(500);
  });

  it('should throw error on debit with negative amount', () => {
    const acc = new Account('1000', 'Cash', 'asset');
    expect(() => acc.debit(-100)).toThrow('Amount must be positive');
  });

  it('should track transaction history', () => {
    const acc = new Account('1000', 'Cash', 'asset');
    acc.debit(1000, 'Initial deposit');
    acc.credit(200, 'Withdrawal');
    expect(acc.getTransactionHistory()).toHaveLength(2);
    expect(acc.getTransactionHistory()[0].amount).toBe(1000);
    expect(acc.getTransactionHistory()[0].type).toBe('debit');
  });
});
