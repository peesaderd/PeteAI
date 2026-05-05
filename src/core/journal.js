/**
 * ERP Core - Journal Entry Module
 */

export class JournalEntry {
  constructor(reference, description, date = new Date()) {
    this.reference = reference;
    this.description = description;
    this.date = date;
    this.lines = [];
    this.posted = false;
  }

  addLine(accountCode, debit = 0, credit = 0) {
    if (debit < 0 || credit < 0) throw new Error('Debit and credit must be non-negative');
    if (debit === 0 && credit === 0) throw new Error('Either debit or credit must be provided');
    this.lines.push({ accountCode, debit, credit });
  }

  validate() {
    if (this.lines.length < 2) {
      return { valid: false, error: 'Journal entry must have at least 2 lines' };
    }
    const totalDebit = this.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = this.lines.reduce((sum, line) => sum + line.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      return { valid: false, error: `Debit (${totalDebit}) must equal Credit (${totalCredit})` };
    }
    return { valid: true, error: null };
  }

  post(accounts) {
    const validation = this.validate();
    if (!validation.valid) throw new Error(validation.error);

    for (const line of this.lines) {
      const account = accounts.find(a => a.code === line.accountCode);
      if (!account) throw new Error(`Account ${line.accountCode} not found`);
      if (line.debit > 0) account.debit(line.debit, this.reference);
      if (line.credit > 0) account.credit(line.credit, this.reference);
    }
    this.posted = true;
    return true;
  }
}
