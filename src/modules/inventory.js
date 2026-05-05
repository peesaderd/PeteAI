/**
 * ERP Core - Inventory Module
 */

export class InventoryItem {
  constructor(code, name, unitPrice) {
    this.code = code;
    this.name = name;
    this.unitPrice = unitPrice;
    this.quantity = 0;
  }

  receive(quantity) {
    if (quantity <= 0) throw new Error('Quantity must be positive');
    this.quantity += quantity;
    return this.quantity;
  }

  issue(quantity) {
    if (quantity <= 0) throw new Error('Quantity must be positive');
    if (quantity > this.quantity) throw new Error('Insufficient stock');
    this.quantity -= quantity;
    return this.quantity;
  }

  getStockValue() {
    return this.quantity * this.unitPrice;
  }
}

export class InventoryManager {
  constructor() {
    this.items = [];
  }

  addItem(item) {
    if (this.items.find(i => i.code === item.code)) {
      throw new Error(`Item ${item.code} already exists`);
    }
    this.items.push(item);
  }

  getItem(code) {
    return this.items.find(i => i.code === code);
  }

  getTotalStockValue() {
    return this.items.reduce((sum, item) => sum + item.getStockValue(), 0);
  }

  getAllItems() {
    return [...this.items];
  }
}
