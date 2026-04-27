// ============================================================
// API Gateway & Orchestrator
// Routes requests to appropriate services
// ============================================================

import { getDatabase } from '../db/database.js';
import { BillingManager } from '../billing/index.js';

export interface OrchestratorContext {
  tenantId: string;
  userId: string;
  roles: string[];
}

export class Orchestrator {
  private billing: BillingManager;

  constructor() {
    this.billing = new BillingManager();
  }

  /**
   * Check if tenant can perform an action based on their plan limits
   */
  async authorize(ctx: OrchestratorContext, resource: string, action: string): Promise<boolean> {
    // Check tenant limits for write operations
    if (['create', 'update', 'delete'].includes(action)) {
      const limits = this.billing.checkLimits(ctx.tenantId);
      if (!limits.allowed) {
        throw new Error(`Plan limit exceeded. Users: ${limits.usage?.users}/${limits.limits?.maxUsers}, Products: ${limits.usage?.products}/${limits.limits?.maxProducts}`);
      }
    }

    // Role-based access control
    if (resource === 'billing' && !ctx.roles.includes('admin')) {
      throw new Error('Only admins can access billing');
    }

    if (resource === 'settings' && !ctx.roles.includes('admin')) {
      throw new Error('Only admins can access settings');
    }

    return true;
  }

  /**
   * Route an MCP tool call to the appropriate handler
   */
  async route(ctx: OrchestratorContext, tool: string, args: any): Promise<any> {
    // Add tenant context to all queries
    const enrichedArgs = { ...args, tenantId: ctx.tenantId };

    // Determine resource type for authorization
    const resourceMap: Record<string, string> = {
      'create_product': 'products',
      'update_product': 'products',
      'delete_product': 'products',
      'create_order': 'orders',
      'update_order': 'orders',
      'create_customer': 'crm',
      'update_customer': 'crm',
      'create_invoice': 'billing',
      'update_plan': 'billing',
      'create_subscription': 'billing',
    };

    const actionMap: Record<string, string> = {
      'create_product': 'create',
      'update_product': 'update',
      'delete_product': 'delete',
      'create_order': 'create',
      'update_order': 'update',
      'create_customer': 'create',
      'update_customer': 'update',
      'create_invoice': 'create',
      'update_plan': 'update',
      'create_subscription': 'create',
    };

    const resource = resourceMap[tool] || 'read';
    const action = actionMap[tool] || 'read';

    await this.authorize(ctx, resource, action);

    return enrichedArgs;
  }

  /**
   * Get system health status across all services
   */
  async getHealth(): Promise<Record<string, any>> {
    const db = getDatabase();
    try {
      db.prepare('SELECT 1').get();
      return { status: 'healthy', database: 'connected', timestamp: Date.now() };
    } catch (err: any) {
      return { status: 'degraded', database: 'disconnected', error: err.message, timestamp: Date.now() };
    }
  }

  /**
   * Get aggregated dashboard data
   */
  async getDashboard(ctx: OrchestratorContext): Promise<Record<string, any>> {
    const db = getDatabase();
    const { tenantId } = ctx;

    const productCount = (db.prepare('SELECT COUNT(*) as count FROM products WHERE tenant_id = ?').get(tenantId) as any)?.count || 0;
    const orderCount = (db.prepare('SELECT COUNT(*) as count FROM orders WHERE tenant_id = ?').get(tenantId) as any)?.count || 0;
    const customerCount = (db.prepare('SELECT COUNT(*) as count FROM customers WHERE tenant_id = ?').get(tenantId) as any)?.count || 0;
    const revenue = (db.prepare('SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE tenant_id = ?').get(tenantId) as any)?.total || 0;

    const recentOrders = db.prepare(
      'SELECT id, order_number, total, status, created_at FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10'
    ).all(tenantId);

    const lowStock = db.prepare(
      'SELECT id, name, sku, quantity FROM products WHERE tenant_id = ? AND quantity <= 5 ORDER BY quantity ASC LIMIT 10'
    ).all(tenantId);

    return {
      stats: { products: productCount, orders: orderCount, customers: customerCount, revenue },
      recentOrders,
      lowStock,
    };
  }
}
