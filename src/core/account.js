/**
 * ERP Core - Account Management Module
 */

export class Account {
  constructor(code, name, type) {
    this.code = code;
    this.name = name;
    this.type = type; // 'asset', 'liability', 'equity', 'revenue', 'expense'
    this.balance = 0;
    this.transactions = [];
  }

  debit(amount, description = '') {
    if (amount <= 0) throw new Error('Amount must be positive');
    if (this.type === 'asset' || this.type === 'expense') {
      this.balance += amount;
    } else {
      this.balance -= amount;
    }
    this.transactions.push({ type: 'debit', amount, description, date: new Date() });
    return this.balance;
  }

  credit(amount, description = '') {
    if (amount <= 0) throw new Error('Amount must be positive');
    if (this.type === 'liability' || this.type === 'equity' || this.type === 'revenue') {
      this.balance += amount;
    } else {
      this.balance -= amount;
    }
    this.transactions.push({ type: 'credit', amount, description, date: new Date() });
    return this.balance;
  }

  getBalance() {
    return this.balance;
  }

  getTransactionHistory() {
    return [...this.transactions];
  }
}
