// ============================================================
// Advanced Reporting Engine
// ============================================================

import { getDatabase } from '../db/database.js';

interface ReportConfig {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type: 'sales' | 'inventory' | 'production' | 'channel' | 'custom';
  config: Record<string, any>;
  schedule?: 'daily' | 'weekly' | 'monthly' | null;
  recipients?: string[];
  created_at: number;
  updated_at: number;
}

export class ReportEngine {
  private db = getDatabase();

  // ---- Report CRUD ----

  createReport(args: {
    tenantId: string;
    name: string;
    description?: string;
    type: ReportConfig['type'];
    config: Record<string, any>;
    schedule?: ReportConfig['schedule'];
    recipients?: string[];
  }): ReportConfig {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO saved_reports (id, tenant_id, name, description, type, config, schedule, recipients, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, args.tenantId, args.name, args.description || null, args.type,
      JSON.stringify(args.config), args.schedule || null,
      JSON.stringify(args.recipients || []), now, now);
    return this.getReport(id)!;
  }

  getReport(id: string): ReportConfig | null {
    const row = this.db.prepare('SELECT * FROM saved_reports WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapReport(row);
  }

  listReports(tenantId: string, type?: string): ReportConfig[] {
    let sql = 'SELECT * FROM saved_reports WHERE tenant_id = ?';
    const params: any[] = [tenantId];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY updated_at DESC';
    return this.db.prepare(sql).all(...params).map((r: any) => this.mapReport(r));
  }

  updateReport(id: string, args: Partial<ReportConfig>): ReportConfig {
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];
    ['name', 'description', 'type', 'schedule'].forEach(f => {
      if ((args as any)[f] !== undefined) { updates.push(`${f} = ?`); params.push((args as any)[f]); }
    });
    if (args.config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(args.config)); }
    if (args.recipients !== undefined) { updates.push('recipients = ?'); params.push(JSON.stringify(args.recipients)); }
    params.push(id);
    this.db.prepare(`UPDATE saved_reports SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getReport(id)!;
  }

  deleteReport(id: string): void {
    this.db.prepare('DELETE FROM saved_reports WHERE id = ?').run(id);
  }

  // ---- Report Execution ----

  executeReport(reportId: string): any {
    const report = this.getReport(reportId);
    if (!report) throw new Error('Report not found');
    return this.runQuery(report.tenantId, report.type, report.config);
  }

  executeAdhocReport(args: {
    tenantId: string;
    type: ReportConfig['type'];
    config: Record<string, any>;
  }): any {
    return this.runQuery(args.tenantId, args.type, args.config);
  }

  private runQuery(tenantId: string, type: string, config: Record<string, any>): any {
    const now = Math.floor(Date.now() / 1000);
    const startDate = config.startDate || now - 30 * 86400;
    const endDate = config.endDate || now;

    switch (type) {
      case 'sales': return this.salesReport(tenantId, startDate, endDate, config);
      case 'inventory': return this.inventoryReport(tenantId, config);
      case 'production': return this.productionReport(tenantId, startDate, endDate, config);
      case 'channel': return this.channelReport(tenantId, config);
      case 'custom': return this.customQuery(tenantId, config);
      default: throw new Error(`Unknown report type: ${type}`);
    }
  }

  private salesReport(tenantId: string, startDate: number, endDate: number, config: Record<string, any>) {
    const groupBy = config.groupBy || 'day';
    const orders = this.db.prepare(
      'SELECT * FROM orders WHERE tenant_id = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC'
    ).all(tenantId, startDate, endDate) as any[];

    const items = this.db.prepare(`
      SELECT oi.*, o.created_at as order_date, o.channel
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.tenant_id = ? AND o.created_at >= ? AND o.created_at <= ?
      ORDER BY o.created_at ASC
    `).all(tenantId, startDate, endDate) as any[];

    const grouped = new Map<string, { revenue: number; orders: number; items: number }>();
    const dateFormat = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day';

    orders.forEach((o: any) => {
      const d = new Date(o.created_at * 1000);
      const key = dateFormat === 'month'
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : dateFormat === 'week'
          ? `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`
          : d.toISOString().split('T')[0];
      const existing = grouped.get(key) || { revenue: 0, orders: 0, items: 0 };
      existing.revenue += o.total;
      existing.orders += 1;
      grouped.set(key, existing);
    });

    items.forEach((i: any) => {
      const d = new Date(i.order_date * 1000);
      const key = dateFormat === 'month'
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : dateFormat === 'week'
          ? `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`
          : d.toISOString().split('T')[0];
      const existing = grouped.get(key);
      if (existing) existing.items += i.quantity;
    });

    const totalRevenue = orders.reduce((s: number, o: any) => s + o.total, 0);
    const totalOrders = orders.length;
    const totalItems = items.reduce((s: number, i: any) => s + i.quantity, 0);

    const channelMap = new Map<string, number>();
    orders.forEach((o: any) => {
      channelMap.set(o.channel, (channelMap.get(o.channel) || 0) + o.total);
    });

    const productMap = new Map<string, { name: string; revenue: number; quantity: number }>();
    items.forEach((i: any) => {
      const existing = productMap.get(i.product_id) || { name: i.name, revenue: 0, quantity: 0 };
      existing.revenue += i.total_price;
      existing.quantity += i.quantity;
      productMap.set(i.product_id, existing);
    });
    const topProducts = Array.from(productMap.entries())
      .map(([id, data]) => ({ productId: id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    return {
      summary: { totalRevenue, totalOrders, totalItems, averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0 },
      breakdown: Array.from(grouped.entries()).map(([period, data]) => ({ period, ...data })),
      channels: Array.from(channelMap.entries()).map(([channel, revenue]) => ({ channel, revenue })),
      topProducts,
      period: { startDate, endDate, groupBy },
    };
  }

  private inventoryReport(tenantId: string, config: Record<string, any>) {
    const products = this.db.prepare(
      'SELECT id, name, sku, quantity, cost_price, price, low_stock_threshold, status FROM products WHERE tenant_id = ? ORDER BY name'
    ).all(tenantId) as any[];

    const totalValue = products.reduce((s: number, p: any) => s + (p.quantity * (p.cost_price || 0)), 0);
    const totalPotential = products.reduce((s: number, p: any) => s + (p.quantity * p.price), 0);
    const lowStock = products.filter((p: any) => p.quantity <= p.low_stock_threshold);
    const outOfStock = products.filter((p: any) => p.quantity <= 0);

    return {
      summary: { totalProducts: products.length, totalCostValue: totalValue, totalPotentialRevenue: totalPotential, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length },
      lowStockItems: lowStock.map((p: any) => ({ id: p.id, name: p.name, sku: p.sku, quantity: p.quantity, threshold: p.low_stock_threshold })),
      products: products.map((p: any) => ({ id: p.id, name: p.name, sku: p.sku, quantity: p.quantity, costPrice: p.cost_price, price: p.price, value: p.quantity * (p.cost_price || 0) })),
    };
  }

  private productionReport(tenantId: string, startDate: number, endDate: number, config: Record<string, any>) {
    const orders = this.db.prepare(
      'SELECT * FROM production_orders WHERE tenant_id = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC'
    ).all(tenantId, startDate, endDate) as any[];

    const statusCount = new Map<string, number>();
    orders.forEach((o: any) => statusCount.set(o.status, (statusCount.get(o.status) || 0) + 1));

    const totalPlanned = orders.reduce((s: number, o: any) => s + o.quantity, 0);
    const totalCompleted = orders.reduce((s: number, o: any) => s + o.quantity_completed, 0);

    return {
      summary: { totalOrders: orders.length, totalPlanned, totalCompleted, completionRate: totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0 },
      statusBreakdown: Array.from(statusCount.entries()).map(([status, count]) => ({ status, count })),
      orders,
    };
  }

  private channelReport(tenantId: string, config: Record<string, any>) {
    const connections = this.db.prepare(
      'SELECT * FROM channel_connections WHERE tenant_id = ?'
    ).all(tenantId) as any[];

    const listings = this.db.prepare(`
      SELECT cl.*, p.name as product_name, p.quantity as stock_quantity
      FROM channel_listings cl
      JOIN products p ON cl.product_id = p.id
      WHERE cl.tenant_id = ?
    `).all(tenantId) as any[];

    const channelSales = this.db.prepare(
      'SELECT channel, COUNT(*) as order_count, SUM(total) as revenue FROM orders WHERE tenant_id = ? GROUP BY channel'
    ).all(tenantId) as any[];

    return {
      connections: connections.map((c: any) => ({ id: c.id, channelType: c.channel_type, label: c.label, isActive: c.is_active, lastSyncAt: c.last_sync_at })),
      listings: listings.map((l: any) => ({ id: l.id, channelListingId: l.channel_listing_id, productName: l.product_name, channelPrice: l.channel_price, channelQuantity: l.channel_quantity, stockQuantity: l.stock_quantity, needsSync: l.channel_quantity !== l.stock_quantity })),
      channelSales,
    };
  }

  private customQuery(tenantId: string, config: Record<string, any>) {
    const { sql, params = [] } = config;
    if (!sql) throw new Error('Custom query requires "sql" in config');
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT')) throw new Error('Only SELECT queries are allowed');
    const safeSql = sql.includes('WHERE') ? sql.replace('WHERE', `WHERE tenant_id = ? AND`) : `${sql} WHERE tenant_id = ?`;
    return this.db.prepare(safeSql).all(tenantId, ...params);
  }

  // ---- Export Functions ----

  exportCSV(data: any[], columns?: string[]): string {
    if (!data || data.length === 0) return '';
    const keys = columns || Object.keys(data[0]);
    const header = keys.join(',');
    const rows = data.map(row =>
      keys.map(k => {
        const val = row[k];
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    );
    return [header, ...rows].join('\n');
  }

  exportJSON(data: any): string {
    return JSON.stringify(data, null, 2);
  }

  // ---- PDF Generation ----

  exportPDF(title: string, sections: { heading: string; content: string[] }[]): Promise<Buffer> {
    try {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
      doc.moveDown(2);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      for (const section of sections) {
        doc.fontSize(14).font('Helvetica-Bold').text(section.heading);
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        for (const line of section.content) {
          doc.text(line, { indent: 10 });
        }
        doc.moveDown();
      }

      doc.end();
      return new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      });
    } catch {
      const lines: string[] = [
        `========================================`,
        `  ${title}`,
        `  Generated: ${new Date().toISOString()}`,
        `========================================`,
        '',
      ];
      for (const section of sections) {
        lines.push(`  ${section.heading}`);
        lines.push(`  ${'-'.repeat(section.heading.length + 2)}`);
        for (const line of section.content) {
          lines.push(`    ${line}`);
        }
        lines.push('');
      }
      return Promise.resolve(Buffer.from(lines.join('\n')));
    }
  }

  private mapReport(row: any): ReportConfig {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      type: row.type,
      config: JSON.parse(row.config || '{}'),
      schedule: row.schedule,
      recipients: JSON.parse(row.recipients || '[]'),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
