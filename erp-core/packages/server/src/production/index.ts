// ============================================================
// Production Planning Engine
// BOM Management, Auto Reorder, Production Scheduling
// ============================================================

import { getDatabase } from '../db/database.js';

export interface BOMInput {
  tenantId: string;
  productId: string;
  name: string;
  description?: string;
  components: Array<{
    componentProductId: string;
    quantity: number;
    unitCost?: number;
    wastagePercent?: number;
    notes?: string;
  }>;
  notes?: string;
}

export interface ReorderRuleInput {
  tenantId: string;
  productId: string;
  minStockLevel: number;
  maxStockLevel: number;
  reorderQuantity: number;
  leadTimeDays: number;
  forecastDailyDemand?: number;
}

export class ProductionPlanner {
  private db = getDatabase();

  // ============================================================
  // BOM Management
  // ============================================================

  createBOM(input: BOMInput) {
    const now = Math.floor(Date.now() / 1000);
    const bomId = crypto.randomUUID();

    let totalCost = 0;
    const componentData = input.components.map(c => {
      const product = this.db.prepare('SELECT cost_price FROM products WHERE id = ? AND tenant_id = ?').get(c.componentProductId, input.tenantId) as any;
      const unitCost = c.unitCost || product?.cost_price || 0;
      const cost = unitCost * c.quantity;
      totalCost += cost;
      return { ...c, unitCost, cost };
    });

    const insertBom = this.db.prepare(`
      INSERT INTO boms (id, tenant_id, product_id, name, description, version, is_active, total_cost, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)
    `);
    insertBom.run(bomId, input.tenantId, input.productId, input.name, input.description || null, totalCost, input.notes || null, now, now);

    const insertComponent = this.db.prepare(`
      INSERT INTO bom_components (id, bom_id, component_product_id, quantity, unit_cost, wastage_percent, notes, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    componentData.forEach((c, i) => {
      insertComponent.run(crypto.randomUUID(), bomId, c.componentProductId, c.quantity, c.unitCost, c.wastagePercent || 0, c.notes || null, i, now);
    });

    return this.getBOM(bomId);
  }

  getBOM(bomId: string) {
    const bom = this.db.prepare('SELECT * FROM boms WHERE id = ?').get(bomId) as any;
    if (!bom) return null;
    const components = this.db.prepare(`
      SELECT bc.*, p.name as component_name, p.sku as component_sku, p.quantity as stock_quantity
      FROM bom_components bc
      LEFT JOIN products p ON p.id = bc.component_product_id
      WHERE bc.bom_id = ?
      ORDER BY bc.sort_order
    `).all(bomId);
    return { ...bom, components };
  }

  listBOMs(tenantId: string, productId?: string) {
    let sql = `
      SELECT b.*, p.name as product_name, p.sku as product_sku,
        (SELECT COUNT(*) FROM bom_components WHERE bom_id = b.id) as component_count
      FROM boms b
      JOIN products p ON p.id = b.product_id
      WHERE b.tenant_id = ?
    `;
    const params: any[] = [tenantId];
    if (productId) {
      sql += ' AND b.product_id = ?';
      params.push(productId);
    }
    sql += ' ORDER BY b.updated_at DESC';
    return this.db.prepare(sql).all(...params);
  }

  updateBOM(bomId: string, updates: Partial<BOMInput & { isActive: boolean }>) {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.db.prepare('SELECT * FROM boms WHERE id = ?').get(bomId) as any;
    if (!existing) throw new Error('BOM not found');

    if (updates.name !== undefined || updates.description !== undefined || updates.notes !== undefined || updates.isActive !== undefined) {
      const fields: string[] = ['updated_at = ?'];
      const params: any[] = [now];
      if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
      if (updates.description !== undefined) { fields.push('description = ?'); params.push(updates.description); }
      if (updates.notes !== undefined) { fields.push('notes = ?'); params.push(updates.notes); }
      if (updates.isActive !== undefined) { fields.push('is_active = ?'); params.push(updates.isActive ? 1 : 0); }
      params.push(bomId);
      this.db.prepare(`UPDATE boms SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    if (updates.components) {
      this.db.prepare('DELETE FROM bom_components WHERE bom_id = ?').run(bomId);
      let totalCost = 0;
      const insertComponent = this.db.prepare(`
        INSERT INTO bom_components (id, bom_id, component_product_id, quantity, unit_cost, wastage_percent, notes, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      updates.components.forEach((c, i) => {
        const unitCost = c.unitCost || 0;
        totalCost += unitCost * c.quantity;
        insertComponent.run(crypto.randomUUID(), bomId, c.componentProductId, c.quantity, unitCost, c.wastagePercent || 0, c.notes || null, i, now);
      });
      this.db.prepare('UPDATE boms SET total_cost = ?, updated_at = ? WHERE id = ?').run(totalCost, now, bomId);
    }

    return this.getBOM(bomId);
  }

  // ============================================================
  // Auto Reorder Engine
  // ============================================================

  createReorderRule(input: ReorderRuleInput) {
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO reorder_rules (id, tenant_id, product_id, min_stock_level, max_stock_level, reorder_quantity, lead_time_days, forecast_daily_demand, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, input.tenantId, input.productId, input.minStockLevel, input.maxStockLevel, input.reorderQuantity, input.leadTimeDays, input.forecastDailyDemand || 0, now, now);
    return this.db.prepare('SELECT * FROM reorder_rules WHERE id = ?').get(id);
  }

  updateReorderRule(ruleId: string, updates: Partial<ReorderRuleInput & { isActive: boolean }>) {
    const now = Math.floor(Date.now() / 1000);
    const fields: string[] = ['updated_at = ?'];
    const params: any[] = [now];
    const fieldMap: Record<string, string> = {
      minStockLevel: 'min_stock_level',
      maxStockLevel: 'max_stock_level',
      reorderQuantity: 'reorder_quantity',
      leadTimeDays: 'lead_time_days',
      forecastDailyDemand: 'forecast_daily_demand',
      isActive: 'is_active',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if ((updates as any)[key] !== undefined) {
        fields.push(`${col} = ?`);
        params.push((updates as any)[key]);
      }
    }
    params.push(ruleId);
    this.db.prepare(`UPDATE reorder_rules SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.db.prepare('SELECT * FROM reorder_rules WHERE id = ?').get(ruleId);
  }

  listReorderRules(tenantId: string, productId?: string) {
    let sql = `
      SELECT rr.*, p.name as product_name, p.sku as product_sku, p.quantity as current_stock,
        (p.quantity - rr.min_stock_level) as stock_above_min
      FROM reorder_rules rr
      JOIN products p ON p.id = rr.product_id
      WHERE rr.tenant_id = ?
    `;
    const params: any[] = [tenantId];
    if (productId) {
      sql += ' AND rr.product_id = ?';
      params.push(productId);
    }
    sql += ' ORDER BY (p.quantity * 1.0 / rr.min_stock_level) ASC';
    return this.db.prepare(sql).all(...params);
  }

  checkReorderNeeds(tenantId: string) {
    const rules = this.db.prepare(`
      SELECT rr.*, p.name as product_name, p.sku as product_sku, p.quantity as current_stock,
        p.low_stock_threshold
      FROM reorder_rules rr
      JOIN products p ON p.id = rr.product_id
      WHERE rr.tenant_id = ? AND rr.is_active = 1
    `).all(tenantId) as any[];

    const needsReorder: any[] = [];
    for (const rule of rules) {
      if (rule.current_stock <= rule.min_stock_level) {
        const suggestedQty = Math.max(
          rule.reorder_quantity,
          Math.ceil((rule.max_stock_level - rule.current_stock) / rule.lead_time_days) * rule.lead_time_days
        );
        needsReorder.push({
          productId: rule.product_id,
          productName: rule.product_name,
          sku: rule.product_sku,
          currentStock: rule.current_stock,
          minLevel: rule.min_stock_level,
          maxLevel: rule.max_stock_level,
          suggestedReorderQty: suggestedQty,
          leadTimeDays: rule.lead_time_days,
          urgency: rule.current_stock <= 0 ? 'critical' :
                   rule.current_stock <= rule.min_stock_level * 0.5 ? 'high' : 'medium',
        });
      }
    }

    return {
      totalRules: rules.length,
      needsReorder: needsReorder.length,
      items: needsReorder.sort((a, b) => {
        const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
        return (urgencyOrder[a.urgency] || 99) - (urgencyOrder[b.urgency] || 99);
      }),
    };
  }

  autoScheduleProduction(tenantId: string) {
    const now = Math.floor(Date.now() / 1000);
    const needsReorder = this.checkReorderNeeds(tenantId);
    const createdOrders: any[] = [];

    for (const item of needsReorder.items) {
      const existingOrder = this.db.prepare(`
        SELECT id FROM production_orders
        WHERE tenant_id = ? AND product_id = ? AND status IN ('draft', 'planned', 'in_progress')
      `).get(tenantId, item.productId);

      if (existingOrder) continue;

      const orderId = crypto.randomUUID();
      const orderNumber = `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const dueDate = now + (item.leadTimeDays * 86400);

      this.db.prepare(`
        INSERT INTO production_orders (id, tenant_id, product_id, order_number, quantity, status, priority, due_date, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?)
      `).run(orderId, tenantId, item.productId, orderNumber, item.suggestedReorderQty,
        item.urgency === 'critical' ? 'high' : 'normal', dueDate,
        `Auto-scheduled: ${item.productName} stock at ${item.currentStock} (min: ${item.minLevel})`, now, now);

      createdOrders.push({
        orderId,
        orderNumber,
        productId: item.productId,
        productName: item.productName,
        quantity: item.suggestedReorderQty,
        dueDate,
        urgency: item.urgency,
      });
    }

    return {
      checked: needsReorder.totalRules,
      needed: needsReorder.needsReorder,
      created: createdOrders.length,
      orders: createdOrders,
    };
  }

  // ============================================================
  // Production Scheduling
  // ============================================================

  createProductionOrder(input: {
    tenantId: string;
    productId: string;
    bomId?: string;
    quantity: number;
    priority?: string;
    dueDate?: number;
    notes?: string;
  }) {
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const orderNumber = `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    this.db.prepare(`
      INSERT INTO production_orders (id, tenant_id, product_id, bom_id, order_number, quantity, status, priority, due_date, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
    `).run(id, input.tenantId, input.productId, input.bomId || null, orderNumber,
      input.quantity, input.priority || 'normal', input.dueDate || null,
      input.notes || null, now, now);

    if (input.bomId) {
      const components = this.db.prepare(`
        SELECT * FROM bom_components WHERE bom_id = ?
      `).all(input.bomId) as any[];

      const insertUsage = this.db.prepare(`
        INSERT INTO production_material_usage (id, production_order_id, component_product_id, quantity_planned, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const comp of components) {
        const plannedQty = comp.quantity * input.quantity;
        insertUsage.run(crypto.randomUUID(), id, comp.component_product_id, plannedQty, now);
      }
    }

    return this.getProductionOrder(id);
  }

  getProductionOrder(orderId: string) {
    const order = this.db.prepare(`
      SELECT po.*, p.name as product_name, p.sku as product_sku
      FROM production_orders po
      JOIN products p ON p.id = po.product_id
      WHERE po.id = ?
    `).get(orderId) as any;
    if (!order) return null;

    const materialUsage = this.db.prepare(`
      SELECT pmu.*, p.name as component_name, p.sku as component_sku
      FROM production_material_usage pmu
      LEFT JOIN products p ON p.id = pmu.component_product_id
      WHERE pmu.production_order_id = ?
    `).all(orderId);

    return { ...order, materialUsage };
  }

  listProductionOrders(tenantId: string, status?: string, limit = 50) {
    let sql = `
      SELECT po.*, p.name as product_name, p.sku as product_sku
      FROM production_orders po
      JOIN products p ON p.id = po.product_id
      WHERE po.tenant_id = ?
    `;
    const params: any[] = [tenantId];
    if (status) {
      sql += ' AND po.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY po.due_date ASC, po.created_at DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params);
  }

  updateProductionStatus(orderId: string, status: string, tenantId: string) {
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const params: any[] = [status, now];

    if (status === 'in_progress') {
      updates.push('started_at = ?');
      params.push(now);
    }
    if (status === 'completed') {
      updates.push('completed_at = ?', 'quantity_completed = quantity');
      params.push(now);

      const order = this.db.prepare('SELECT * FROM production_orders WHERE id = ? AND tenant_id = ?').get(orderId, tenantId) as any;
      if (order) {
        this.db.prepare('UPDATE products SET quantity = quantity + ? WHERE id = ?').run(order.quantity, order.product_id);
        this.db.prepare(`INSERT INTO inventory_transactions (id, tenant_id, product_id, type, quantity, reference_type, reference_id, notes, created_at) VALUES (?, ?, ?, 'production', ?, 'production_order', ?, ?, ?)`)
          .run(crypto.randomUUID(), tenantId, order.product_id, order.quantity, orderId, `Production completed: ${order.order_number}`, now);
      }
    }

    params.push(orderId, tenantId);
    this.db.prepare(`UPDATE production_orders SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...params);
    return this.getProductionOrder(orderId);
  }

  getProductionSchedule(tenantId: string, startDate?: number, endDate?: number) {
    const now = Math.floor(Date.now() / 1000);
    const start = startDate || now;
    const end = endDate || (now + 30 * 86400);

    const orders = this.db.prepare(`
      SELECT po.*, p.name as product_name, p.sku as product_sku
      FROM production_orders po
      JOIN products p ON p.id = po.product_id
      WHERE po.tenant_id = ?
        AND po.status IN ('planned', 'in_progress')
        AND (po.due_date IS NULL OR (po.due_date >= ? AND po.due_date <= ?))
      ORDER BY po.due_date ASC, po.priority DESC
    `).all(tenantId, start, end) as any[];

    const weeks: Record<string, any[]> = {};
    for (const order of orders) {
      const weekStart = order.due_date
        ? getWeekStart(new Date(order.due_date * 1000)).toISOString().split('T')[0]
        : 'unscheduled';
      if (!weeks[weekStart]) weeks[weekStart] = [];
      weeks[weekStart].push(order);
    }

    return {
      totalPlanned: orders.length,
      weeks: Object.entries(weeks).map(([week, items]) => ({
        week,
        orderCount: items.length,
        totalQuantity: items.reduce((s: number, o: any) => s + o.quantity, 0),
        orders: items,
      })),
    };
  }
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
