// ============================================================
// Etsy Analytics Engine
// ============================================================

import { getDatabase } from '../db/database.js';

export interface EtsyAnalyticsQuery {
  tenantId: string;
  startDate?: number;
  endDate?: number;
}

export interface ProductPerformance {
  productId: string;
  name: string;
  sku: string;
  totalRevenue: number;
  totalOrders: number;
  totalQuantity: number;
  averagePrice: number;
  costPrice: number;
  profit: number;
  profitMargin: number;
  views: number;
  favorites: number;
  conversionRate: number;
}

export interface SalesTrend {
  date: string;
  revenue: number;
  orders: number;
  itemsSold: number;
  averageOrderValue: number;
}

export interface ChannelBreakdown {
  channel: string;
  revenue: number;
  orders: number;
  percentage: number;
}

export interface TopProduct {
  id: string;
  name: string;
  revenue: number;
  orders: number;
  quantity: number;
  profit: number;
}

export class EtsyAnalytics {
  private db = getDatabase();

  /**
   * Get product performance analytics
   */
  getProductPerformance(query: EtsyAnalyticsQuery): ProductPerformance[] {
    const { tenantId, startDate, endDate } = query;
    let sql = `
      SELECT 
        p.id as productId,
        p.name,
        p.sku,
        COALESCE(SUM(oi.total_price), 0) as totalRevenue,
        COUNT(DISTINCT o.id) as totalOrders,
        COALESCE(SUM(oi.quantity), 0) as totalQuantity,
        COALESCE(AVG(oi.unit_price), 0) as averagePrice,
        p.cost_price as costPrice,
        COALESCE(SUM(oi.total_price), 0) - (COALESCE(SUM(oi.quantity), 0) * p.cost_price) as profit,
        CASE 
          WHEN COALESCE(SUM(oi.total_price), 0) > 0 
          THEN ((COALESCE(SUM(oi.total_price), 0) - (COALESCE(SUM(oi.quantity), 0) * p.cost_price)) / COALESCE(SUM(oi.total_price), 0)) * 100 
          ELSE 0 
        END as profitMargin
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON o.id = oi.order_id AND o.tenant_id = p.tenant_id
      WHERE p.tenant_id = ?
    `;
    const params: any[] = [tenantId];

    if (startDate) {
      sql += ' AND o.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND o.created_at <= ?';
      params.push(endDate);
    }

    sql += ' GROUP BY p.id ORDER BY totalRevenue DESC';

    return this.db.prepare(sql).all(...params) as ProductPerformance[];
  }

  /**
   * Get sales trends (daily breakdown)
   */
  getSalesTrends(query: EtsyAnalyticsQuery): SalesTrend[] {
    const { tenantId, startDate, endDate } = query;
    let sql = `
      SELECT 
        DATE(o.created_at, 'unixepoch') as date,
        COALESCE(SUM(o.total), 0) as revenue,
        COUNT(DISTINCT o.id) as orders,
        COALESCE(SUM(oi.quantity), 0) as itemsSold,
        CASE 
          WHEN COUNT(DISTINCT o.id) > 0 
          THEN COALESCE(SUM(o.total), 0) / COUNT(DISTINCT o.id) 
          ELSE 0 
        END as averageOrderValue
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.tenant_id = ?
    `;
    const params: any[] = [tenantId];

    if (startDate) {
      sql += ' AND o.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND o.created_at <= ?';
      params.push(endDate);
    }

    sql += ' GROUP BY DATE(o.created_at, \'unixepoch\') ORDER BY date ASC';

    return this.db.prepare(sql).all(...params) as SalesTrend[];
  }

  /**
   * Get channel breakdown (Etsy vs other channels)
   */
  getChannelBreakdown(query: EtsyAnalyticsQuery): ChannelBreakdown[] {
    const { tenantId, startDate, endDate } = query;
    let sql = `
      SELECT 
        COALESCE(o.channel, 'direct') as channel,
        COALESCE(SUM(o.total), 0) as revenue,
        COUNT(DISTINCT o.id) as orders
      FROM orders o
      WHERE o.tenant_id = ?
    `;
    const params: any[] = [tenantId];

    if (startDate) {
      sql += ' AND o.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND o.created_at <= ?';
      params.push(endDate);
    }

    sql += ' GROUP BY channel ORDER BY revenue DESC';

    const rows = this.db.prepare(sql).all(...params) as any[];
    const total = rows.reduce((s: number, r: any) => s + r.revenue, 0);

    return rows.map((r: any) => ({
      channel: r.channel,
      revenue: r.revenue,
      orders: r.orders,
      percentage: total > 0 ? Math.round((r.revenue / total) * 100) : 0,
    }));
  }

  /**
   * Get top performing products
   */
  getTopProducts(query: EtsyAnalyticsQuery & { limit?: number }): TopProduct[] {
    const { tenantId, startDate, endDate, limit = 10 } = query;
    let sql = `
      SELECT 
        p.id,
        p.name,
        COALESCE(SUM(oi.total_price), 0) as revenue,
        COUNT(DISTINCT o.id) as orders,
        COALESCE(SUM(oi.quantity), 0) as quantity,
        COALESCE(SUM(oi.total_price), 0) - (COALESCE(SUM(oi.quantity), 0) * p.cost_price) as profit
      FROM products p
      JOIN order_items oi ON oi.product_id = p.id
      JOIN orders o ON o.id = oi.order_id AND o.tenant_id = p.tenant_id
      WHERE p.tenant_id = ?
    `;
    const params: any[] = [tenantId];

    if (startDate) {
      sql += ' AND o.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND o.created_at <= ?';
      params.push(endDate);
    }

    sql += ' GROUP BY p.id ORDER BY revenue DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params) as TopProduct[];
  }

  /**
   * Get summary metrics for dashboard
   */
  getDashboardSummary(query: EtsyAnalyticsQuery): Record<string, any> {
    const { tenantId, startDate, endDate } = query;
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 86400;

    // Current period
    const currentStart = startDate || thirtyDaysAgo;
    const currentEnd = endDate || now;

    // Previous period (same length, before current)
    const periodLength = currentEnd - currentStart;
    const prevStart = currentStart - periodLength;
    const prevEnd = currentStart;

    // Current period metrics
    const current = this.db.prepare(`
      SELECT 
        COALESCE(COUNT(DISTINCT o.id), 0) as orders,
        COALESCE(SUM(o.total), 0) as revenue,
        COALESCE(SUM(o.total) / NULLIF(COUNT(DISTINCT o.id), 0), 0) as aov,
        COALESCE(SUM(oi.quantity), 0) as itemsSold
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.tenant_id = ? AND o.created_at >= ? AND o.created_at <= ?
    `).get(tenantId, currentStart, currentEnd) as any;

    // Previous period metrics
    const previous = this.db.prepare(`
      SELECT 
        COALESCE(COUNT(DISTINCT o.id), 0) as orders,
        COALESCE(SUM(o.total), 0) as revenue
      FROM orders o
      WHERE o.tenant_id = ? AND o.created_at >= ? AND o.created_at <= ?
    `).get(tenantId, prevStart, prevEnd) as any;

    // Top product
    const topProduct = this.db.prepare(`
      SELECT p.name, COALESCE(SUM(oi.total_price), 0) as revenue
      FROM products p
      JOIN order_items oi ON oi.product_id = p.id
      JOIN orders o ON o.id = oi.order_id AND o.tenant_id = p.tenant_id
      WHERE p.tenant_id = ? AND o.created_at >= ? AND o.created_at <= ?
      GROUP BY p.id ORDER BY revenue DESC LIMIT 1
    `).get(tenantId, currentStart, currentEnd) as any;

    // Low stock count
    const lowStock = this.db.prepare(`
      SELECT COUNT(*) as count FROM products WHERE tenant_id = ? AND quantity <= low_stock_threshold AND status = 'active'
    `).get(tenantId) as any;

    const revenueChange = previous.revenue > 0
      ? Math.round(((current.revenue - previous.revenue) / previous.revenue) * 100)
      : 100;

    const orderChange = previous.orders > 0
      ? Math.round(((current.orders - previous.orders) / previous.orders) * 100)
      : 100;

    return {
      period: {
        start: currentStart,
        end: currentEnd,
        label: `${Math.round(periodLength / 86400)}d`,
      },
      metrics: {
        revenue: { value: current.revenue, change: revenueChange },
        orders: { value: current.orders, change: orderChange },
        aov: { value: Math.round(current.aov * 100) / 100, change: 0 },
        itemsSold: { value: current.itemsSold, change: 0 },
      },
      topProduct: topProduct?.name || 'N/A',
      lowStockCount: lowStock?.count || 0,
    };
  }

  /**
   * Get Etsy-specific analytics (requires channel = 'etsy')
   */
  getEtsySpecific(query: EtsyAnalyticsQuery): Record<string, any> {
    const { tenantId, startDate, endDate } = query;
    const now = Math.floor(Date.now() / 1000);
    const start = startDate || (now - 30 * 86400);
    const end = endDate || now;

    // Etsy orders summary
    const etsyOrders = this.db.prepare(`
      SELECT 
        COUNT(*) as totalOrders,
        COALESCE(SUM(total), 0) as totalRevenue,
        COALESCE(AVG(total), 0) as averageOrderValue,
        COALESCE(SUM(shipping_cost), 0) as totalShipping
      FROM orders 
      WHERE tenant_id = ? AND channel = 'etsy' AND created_at >= ? AND created_at <= ?
    `).get(tenantId, start, end) as any;

    // Top Etsy products
    const topEtsyProducts = this.db.prepare(`
      SELECT 
        p.name,
        COUNT(*) as orderCount,
        COALESCE(SUM(oi.total_price), 0) as revenue
      FROM products p
      JOIN order_items oi ON oi.product_id = p.id
      JOIN orders o ON o.id = oi.order_id
      WHERE p.tenant_id = ? AND o.channel = 'etsy' AND o.created_at >= ? AND o.created_at <= ?
      GROUP BY p.id ORDER BY revenue DESC LIMIT 5
    `).all(tenantId, start, end);

    return {
      totalOrders: etsyOrders?.totalOrders || 0,
      totalRevenue: etsyOrders?.totalRevenue || 0,
      averageOrderValue: Math.round((etsyOrders?.averageOrderValue || 0) * 100) / 100,
      totalShipping: etsyOrders?.totalShipping || 0,
      topProducts: topEtsyProducts,
    };
  }
}
