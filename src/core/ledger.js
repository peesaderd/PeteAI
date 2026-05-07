/**
 * ERP Core - Ledger Module
 */

export class Ledger {
  constructor() {
    this.accounts = [];
  }

  addAccount(account) {
    if (this.accounts.find(a => a.code === account.code)) {
      throw new Error(`Account ${account.code} already exists`);
    }
    this.accounts.push(account);
  }

  getAccount(code) {
    return this.accounts.find(a => a.code === code);
  }

  getAllAccounts() {
    return [...this.accounts];
  }

  getTrialBalance() {
    const totalDebit = this.accounts.reduce((sum, a) => {
      if (a.type === 'asset' || a.type === 'expense') return sum + a.balance;
      return sum;
    }, 0);

    const totalCredit = this.accounts.reduce((sum, a) => {
      if (a.type === 'liability' || a.type === 'equity' || a.type === 'revenue') return sum + a.balance;
      return sum;
    }, 0);

    return {
      totalDebit: Math.abs(totalDebit),
      totalCredit,
      balanced: Math.abs(Math.abs(totalDebit) - totalCredit) < 0.001
    };
  }
}
