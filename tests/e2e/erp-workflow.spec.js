import { test, expect } from '@playwright/test';
import { Account, JournalEntry, Ledger } from '../../src/core/index.js';
import { Invoice } from '../../src/modules/invoice.js';
import { InventoryItem, InventoryManager } from '../../src/modules/inventory.js';

test.describe('ERP Core E2E Workflow', () => {
  test('should demonstrate full accounting workflow', () => {
    const ledger = new Ledger();
    const cash = new Account('1000', 'Cash', 'asset');
    const ar = new Account('1100', 'Accounts Receivable', 'asset');
    const revenue = new Account('4000', 'Service Revenue', 'revenue');

    ledger.addAccount(cash);
    ledger.addAccount(ar);
    ledger.addAccount(revenue);

    // Record revenue on credit
    const entry1 = new JournalEntry('JV-001', 'Service revenue');
    entry1.addLine('1100', 10000, 0);
    entry1.addLine('4000', 0, 10000);
    entry1.post([ar, revenue]);

    // Record cash collection
    const entry2 = new JournalEntry('JV-002', 'Cash collection');
    entry2.addLine('1000', 5000, 0);
    entry2.addLine('1100', 0, 5000);
    entry2.post([cash, ar]);

    const tb = ledger.getTrialBalance();
    expect(tb.balanced).toBe(true);
    expect(cash.getBalance()).toBe(5000);
    expect(ar.getBalance()).toBe(5000);
    expect(revenue.getBalance()).toBe(10000);
  });

  test('should demonstrate inventory and invoicing workflow', () => {
    const manager = new InventoryManager();
    const widget = new InventoryItem('ITEM-001', 'Widget', 150);
    manager.addItem(widget);
    widget.receive(100);

    const inv = new Invoice('INV-001', 'Acme Corp');
    inv.addItem('Widget', 10, 150);
    inv.send();
    widget.issue(10);

    expect(inv.status).toBe('sent');
    expect(inv.calculateTotal()).toBeCloseTo(1605, 2); // 1500 + 105 tax
    expect(widget.quantity).toBe(90);
  });
});
