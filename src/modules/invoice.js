/**
 * ERP Core - Invoice Module
 */

export class Invoice {
  constructor(invoiceNumber, customerName, items = [], taxRate = 0.07) {
    this.invoiceNumber = invoiceNumber;
    this.customerName = customerName;
    this.items = items;
    this.taxRate = taxRate;
    this.status = 'draft'; // draft, sent, paid, cancelled
    this.createdAt = new Date();
  }

  addItem(description, quantity, unitPrice) {
    this.items.push({ description, quantity, unitPrice });
  }

  calculateSubtotal() {
    return this.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }

  calculateTax() {
    return this.calculateSubtotal() * this.taxRate;
  }

  calculateTotal() {
    return this.calculateSubtotal() + this.calculateTax();
  }

  send() {
    if (this.status !== 'draft') throw new Error('Only draft invoices can be sent');
    this.status = 'sent';
  }

  markPaid() {
    if (this.status !== 'sent') throw new Error('Only sent invoices can be marked as paid');
    this.status = 'paid';
  }

  cancel() {
    if (this.status === 'paid') throw new Error('Paid invoices cannot be cancelled');
    this.status = 'cancelled';
  }
}
