import { describe, it, expect } from 'vitest';
import { InventoryItem, InventoryManager } from '../../src/modules/inventory.js';

describe('InventoryItem', () => {
  it('should receive stock correctly', () => {
    const item = new InventoryItem('ITEM-001', 'Widget', 100);
    item.receive(50);
    expect(item.quantity).toBe(50);
  });

  it('should issue stock correctly', () => {
    const item = new InventoryItem('ITEM-001', 'Widget', 100);
    item.receive(50);
    item.issue(20);
    expect(item.quantity).toBe(30);
  });

  it('should throw on insufficient stock', () => {
    const item = new InventoryItem('ITEM-001', 'Widget', 100);
    item.receive(10);
    expect(() => item.issue(20)).toThrow('Insufficient stock');
  });

  it('should calculate stock value', () => {
    const item = new InventoryItem('ITEM-001', 'Widget', 100);
    item.receive(10);
    expect(item.getStockValue()).toBe(1000);
  });
});

describe('InventoryManager', () => {
  it('should manage multiple items', () => {
    const manager = new InventoryManager();
    manager.addItem(new InventoryItem('ITEM-001', 'Widget', 100));
    manager.addItem(new InventoryItem('ITEM-002', 'Gadget', 200));
    expect(manager.getAllItems()).toHaveLength(2);
  });
});
