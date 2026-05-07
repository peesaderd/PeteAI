import { describe, it, expect } from 'vitest';
import { Invoice } from '../../src/modules/invoice.js';

describe('Invoice', () => {
  it('should create invoice with draft status', () => {
    const inv = new Invoice('INV-001', 'John Doe');
    expect(inv.status).toBe('draft');
    expect(inv.invoiceNumber).toBe('INV-001');
  });

  it('should calculate totals correctly', () => {
    const inv = new Invoice('INV-001', 'John Doe');
    inv.addItem('Widget', 2, 100);
    inv.addItem('Gadget', 1, 200);
    expect(inv.calculateSubtotal()).toBe(400);
    expect(inv.calculateTax()).toBeCloseTo(28, 2); // 400 * 0.07
    expect(inv.calculateTotal()).toBeCloseTo(428, 2);
  });

  it('should transition status correctly', () => {
    const inv = new Invoice('INV-001', 'John Doe');
    inv.send();
    expect(inv.status).toBe('sent');
    inv.markPaid();
    expect(inv.status).toBe('paid');
  });

  it('should throw when cancelling paid invoice', () => {
    const inv = new Invoice('INV-001', 'John Doe');
    inv.send();
    inv.markPaid();
    expect(() => inv.cancel()).toThrow('Paid invoices cannot be cancelled');
  });
});
