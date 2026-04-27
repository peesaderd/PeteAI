// ============================================================
// ERP Core - MCP Server (Main)
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getDatabase } from '../db/database.js';
import { AuthManager } from '../auth/auth.js';
import { EtsyAnalytics } from '../analytics/etsy.js';
import { ProductionPlanner } from '../production/index.js';
import { ChannelManager } from '../channels/index.js';
import { ReportEngine } from '../reports/index.js';
import { NotificationEngine } from '../notifications/index.js';
import { RBACManager } from '../rbac/index.js';

function tool(name: string, description: string, schema: z.ZodObject<any>) {
  return { name, description, inputSchema: zodToJsonSchema(schema) };
}

const TOOLS = [
  // ---- PRODUCTS ----
  tool('list_products', 'List all products', z.object({
    tenantId: z.string().describe('Tenant ID'),
    categoryId: z.string().optional().describe('Filter by category'),
    status: z.enum(['active', 'draft', 'archived']).optional().describe('Filter by status'),
    search: z.string().optional().describe('Search by name or SKU'),
    limit: z.number().optional().describe('Max results'),
    offset: z.number().optional().describe('Offset for pagination'),
  })),

  tool('get_product', 'Get product details', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().describe('Product ID'),
  })),

  tool('create_product', 'Create a new product', z.object({
    tenantId: z.string().describe('Tenant ID'),
    name: z.string().describe('Product name'),
    description: z.string().optional().describe('Product description'),
    sku: z.string().optional().describe('SKU'),
    price: z.number().describe('Price'),
    costPrice: z.number().optional().describe('Cost price'),
    quantity: z.number().optional().describe('Initial quantity'),
    categoryId: z.string().optional().describe('Category ID'),
    tags: z.array(z.string()).optional().describe('Tags'),
    weight: z.number().optional().describe('Weight'),
  })),

  tool('update_product', 'Update a product', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().describe('Product ID'),
    name: z.string().optional(),
    description: z.string().optional(),
    price: z.number().optional(),
    quantity: z.number().optional(),
    status: z.enum(['active', 'draft', 'archived']).optional(),
  })),

  // ---- SALES / ORDERS ----
  tool('list_orders', 'List orders', z.object({
    tenantId: z.string().describe('Tenant ID'),
    status: z.string().optional().describe('Filter by status'),
    startDate: z.number().optional().describe('Start date (Unix)'),
    endDate: z.number().optional().describe('End date (Unix)'),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool('get_order', 'Get order details', z.object({
    tenantId: z.string().describe('Tenant ID'),
    orderId: z.string().describe('Order ID'),
  })),

  tool('create_order', 'Create a manual order', z.object({
    tenantId: z.string().describe('Tenant ID'),
    customerName: z.string().describe('Customer name'),
    customerEmail: z.string().optional(),
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number(),
      unitPrice: z.number().optional(),
    })).describe('Order items'),
    shippingCost: z.number().optional(),
    channel: z.string().optional().describe('Sales channel (direct, etsy, amazon, shopify, ebay)'),
    notes: z.string().optional(),
  })),

  // ---- INVENTORY ----
  tool('get_inventory', 'Get inventory status', z.object({
    tenantId: z.string().describe('Tenant ID'),
    lowStockOnly: z.boolean().optional().describe('Show only low stock items'),
    threshold: z.number().optional().describe('Low stock threshold'),
  })),

  tool('adjust_inventory', 'Adjust inventory quantity', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().describe('Product ID'),
    quantity: z.number().describe('Quantity to add (positive) or remove (negative)'),
    reason: z.string().optional().describe('Reason for adjustment'),
  })),

  // ---- CRM / CUSTOMERS ----
  tool('list_customers', 'List customers', z.object({
    tenantId: z.string().describe('Tenant ID'),
    search: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool('get_customer', 'Get customer details', z.object({
    tenantId: z.string().describe('Tenant ID'),
    customerId: z.string().describe('Customer ID'),
  })),

  tool('get_customer_insights', 'Get customer analytics', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  // ---- FINANCE ----
  tool('get_finance_summary', 'Get finance summary', z.object({
    tenantId: z.string().describe('Tenant ID'),
    startDate: z.number().optional(),
    endDate: z.number().optional(),
  })),

  tool('list_transactions', 'List finance transactions', z.object({
    tenantId: z.string().describe('Tenant ID'),
    type: z.string().optional(),
    category: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  // ---- PRODUCTION ----
  tool('list_production_orders', 'List production orders', z.object({
    tenantId: z.string().describe('Tenant ID'),
    status: z.string().optional(),
    limit: z.number().optional(),
  })),

  tool('create_production_order', 'Create a production order', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().describe('Product ID'),
    quantity: z.number().describe('Quantity to produce'),
    dueDate: z.number().optional().describe('Due date (Unix)'),
    notes: z.string().optional(),
  })),

  tool('update_production_status', 'Update production order status', z.object({
    tenantId: z.string().describe('Tenant ID'),
    orderId: z.string().describe('Production order ID'),
    status: z.enum(['in_progress', 'completed', 'cancelled']).describe('New status'),
  })),

  // ---- REPORTS ----
  tool('get_sales_report', 'Get sales report', z.object({
    tenantId: z.string().describe('Tenant ID'),
    period: z.enum(['7d', '30d', '90d', '1y']).describe('Report period'),
  })),

  tool('get_inventory_report', 'Get inventory valuation report', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  // ---- KNOWLEDGE BASE ----
  tool('list_kb_collections', 'List knowledge base collections', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('list_kb_documents', 'List knowledge base documents', z.object({
    tenantId: z.string().describe('Tenant ID'),
    collectionId: z.string().optional(),
    search: z.string().optional(),
  })),

  tool('get_kb_document', 'Get knowledge base document', z.object({
    tenantId: z.string().describe('Tenant ID'),
    documentId: z.string().describe('Document ID'),
  })),

  tool('create_kb_document', 'Create a knowledge base document', z.object({
    tenantId: z.string().describe('Tenant ID'),
    collectionId: z.string().describe('Collection ID'),
    title: z.string().describe('Document title'),
    content: z.string().describe('Markdown content'),
    tags: z.array(z.string()).optional(),
  })),

  // ---- TENANT / BILLING ----
  tool('get_tenant_info', 'Get tenant/organization info', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('get_subscription', 'Get current subscription details', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('get_usage_stats', 'Get usage statistics for billing', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  // ---- ANALYTICS ----
  tool('get_dashboard_summary', 'Get dashboard summary metrics with period comparison', z.object({
    tenantId: z.string().describe('Tenant ID'),
    startDate: z.number().optional().describe('Start date (Unix)'),
    endDate: z.number().optional().describe('End date (Unix)'),
  })),

  tool('get_product_performance', 'Get product performance analytics with profit margins', z.object({
    tenantId: z.string().describe('Tenant ID'),
    startDate: z.number().optional().describe('Start date (Unix)'),
    endDate: z.number().optional().describe('End date (Unix)'),
  })),

  tool('get_sales_trends', 'Get daily sales trends', z.object({
    tenantId: z.string().describe('Tenant ID'),
    startDate: z.number().optional().describe('Start date (Unix)'),
    endDate: z.number().optional().describe('End date (Unix)'),
  })),

  tool('get_channel_breakdown', 'Get sales breakdown by channel (Etsy vs direct)', z.object({
    tenantId: z.string().describe('Tenant ID'),
    startDate: z.number().optional().describe('Start date (Unix)'),
    endDate: z.number().optional().describe('End date (Unix)'),
  })),

  tool('get_top_products', 'Get top performing products by revenue', z.object({
    tenantId: z.string().describe('Tenant ID'),
    startDate: z.number().optional().describe('Start date (Unix)'),
    endDate: z.number().optional().describe('End date (Unix)'),
    limit: z.number().optional().describe('Number of products'),
  })),

  tool('get_etsy_analytics', 'Get Etsy-specific analytics', z.object({
    tenantId: z.string().describe('Tenant ID'),
    startDate: z.number().optional().describe('Start date (Unix)'),
    endDate: z.number().optional().describe('End date (Unix)'),
  })),

  // ---- PRODUCTION PLANNING: BOM ----
  tool('create_bom', 'Create a Bill of Materials', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().describe('Product ID'),
    name: z.string().describe('BOM name'),
    description: z.string().optional().describe('BOM description'),
    components: z.array(z.object({
      componentProductId: z.string().describe('Component product ID'),
      quantity: z.number().describe('Quantity needed'),
      unitCost: z.number().optional().describe('Unit cost override'),
      wastagePercent: z.number().optional().describe('Wastage percentage'),
      notes: z.string().optional(),
    })).describe('List of components'),
    notes: z.string().optional(),
  })),

  tool('get_bom', 'Get BOM details with components', z.object({
    tenantId: z.string().describe('Tenant ID'),
    bomId: z.string().describe('BOM ID'),
  })),

  tool('list_boms', 'List all BOMs', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().optional().describe('Filter by product'),
  })),

  tool('update_bom', 'Update a BOM', z.object({
    tenantId: z.string().describe('Tenant ID'),
    bomId: z.string().describe('BOM ID'),
    name: z.string().optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    components: z.array(z.object({
      componentProductId: z.string(),
      quantity: z.number(),
      unitCost: z.number().optional(),
      wastagePercent: z.number().optional(),
      notes: z.string().optional(),
    })).optional(),
  })),

  // ---- PRODUCTION PLANNING: REORDER ----
  tool('create_reorder_rule', 'Create a reorder rule for auto-stock management', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().describe('Product ID'),
    minStockLevel: z.number().describe('Minimum stock level before reorder'),
    maxStockLevel: z.number().describe('Maximum stock level target'),
    reorderQuantity: z.number().describe('Quantity to reorder'),
    leadTimeDays: z.number().describe('Lead time in days'),
    forecastDailyDemand: z.number().optional().describe('Forecasted daily demand'),
  })),

  tool('list_reorder_rules', 'List reorder rules', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().optional(),
  })),

  tool('check_reorder_needs', 'Check which products need reordering', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('auto_schedule_production', 'Auto-generate production orders based on stock levels', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  // ---- PRODUCTION PLANNING: ORDERS ----
  tool('create_production_order', 'Create a production order', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().describe('Product ID'),
    bomId: z.string().optional().describe('BOM ID for material tracking'),
    quantity: z.number().describe('Quantity to produce'),
    priority: z.enum(['low', 'normal', 'high']).optional().describe('Priority'),
    dueDate: z.number().optional().describe('Due date (Unix)'),
    notes: z.string().optional(),
  })),

  tool('list_production_orders', 'List production orders', z.object({
    tenantId: z.string().describe('Tenant ID'),
    status: z.string().optional().describe('Filter by status'),
    limit: z.number().optional(),
  })),

  tool('get_production_order', 'Get production order details', z.object({
    tenantId: z.string().describe('Tenant ID'),
    orderId: z.string().describe('Production order ID'),
  })),

  tool('update_production_status', 'Update production order status', z.object({
    tenantId: z.string().describe('Tenant ID'),
    orderId: z.string().describe('Production order ID'),
    status: z.enum(['in_progress', 'completed', 'cancelled']).describe('New status'),
  })),

  tool('get_production_schedule', 'Get production schedule by week', z.object({
    tenantId: z.string().describe('Tenant ID'),
    startDate: z.number().optional().describe('Start date (Unix)'),
    endDate: z.number().optional().describe('End date (Unix)'),
  })),

  // ---- MULTI-CHANNEL: CONNECTIONS ----
  tool('create_channel_connection', 'Create a channel connection (Amazon, Shopify, etc.)', z.object({
    tenantId: z.string().describe('Tenant ID'),
    channelType: z.enum(['amazon', 'shopify', 'etsy', 'ebay']).describe('Channel type'),
    label: z.string().describe('Display label'),
    credentials: z.record(z.string()).describe('Channel credentials (API keys, tokens)'),
    config: z.record(z.any()).optional().describe('Additional configuration'),
  })),

  tool('list_channel_connections', 'List channel connections', z.object({
    tenantId: z.string().describe('Tenant ID'),
    channelType: z.string().optional().describe('Filter by channel type'),
  })),

  tool('update_channel_connection', 'Update a channel connection', z.object({
    tenantId: z.string().describe('Tenant ID'),
    connectionId: z.string().describe('Connection ID'),
    label: z.string().optional(),
    credentials: z.record(z.string()).optional(),
    isActive: z.boolean().optional(),
  })),

  tool('delete_channel_connection', 'Delete a channel connection', z.object({
    tenantId: z.string().describe('Tenant ID'),
    connectionId: z.string().describe('Connection ID'),
  })),

  // ---- MULTI-CHANNEL: LISTINGS ----
  tool('create_channel_listing', 'Link a product to a channel listing', z.object({
    tenantId: z.string().describe('Tenant ID'),
    channelConnectionId: z.string().describe('Channel connection ID'),
    productId: z.string().describe('Product ID'),
    channelListingId: z.string().describe('Listing ID on the channel'),
    channelSku: z.string().optional().describe('SKU on the channel'),
    channelPrice: z.number().optional().describe('Price on the channel'),
    channelQuantity: z.number().optional().describe('Quantity listed on channel'),
    listingData: z.record(z.any()).optional().describe('Additional listing data'),
  })),

  tool('list_channel_listings', 'List channel listings', z.object({
    tenantId: z.string().describe('Tenant ID'),
    channelConnectionId: z.string().optional(),
    productId: z.string().optional(),
  })),

  tool('get_inventory_sync_status', 'Check inventory sync status across channels', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  // ---- ADVANCED REPORTS ----
  tool('create_report', 'Create a saved report configuration', z.object({
    tenantId: z.string().describe('Tenant ID'),
    name: z.string().describe('Report name'),
    description: z.string().optional().describe('Report description'),
    type: z.enum(['sales', 'inventory', 'production', 'channel', 'custom']).describe('Report type'),
    config: z.record(z.any()).describe('Report configuration (startDate, endDate, groupBy, etc.)'),
    schedule: z.enum(['daily', 'weekly', 'monthly']).optional().describe('Schedule for auto-generation'),
    recipients: z.array(z.string()).optional().describe('Notification recipients'),
  })),

  tool('list_reports', 'List saved reports', z.object({
    tenantId: z.string().describe('Tenant ID'),
    type: z.string().optional().describe('Filter by report type'),
  })),

  tool('get_report', 'Get a saved report configuration', z.object({
    tenantId: z.string().describe('Tenant ID'),
    reportId: z.string().describe('Report ID'),
  })),

  tool('update_report', 'Update a saved report', z.object({
    tenantId: z.string().describe('Tenant ID'),
    reportId: z.string().describe('Report ID'),
    name: z.string().optional(),
    description: z.string().optional(),
    config: z.record(z.any()).optional(),
    schedule: z.string().optional(),
  })),

  tool('delete_report', 'Delete a saved report', z.object({
    tenantId: z.string().describe('Tenant ID'),
    reportId: z.string().describe('Report ID'),
  })),

  tool('execute_report', 'Execute a saved report and get results', z.object({
    tenantId: z.string().describe('Tenant ID'),
    reportId: z.string().describe('Report ID'),
  })),

  tool('execute_adhoc_report', 'Run an ad-hoc report without saving', z.object({
    tenantId: z.string().describe('Tenant ID'),
    type: z.enum(['sales', 'inventory', 'production', 'channel', 'custom']).describe('Report type'),
    config: z.record(z.any()).describe('Report configuration'),
  })),

  tool('export_report_csv', 'Export report data as CSV', z.object({
    tenantId: z.string().describe('Tenant ID'),
    type: z.enum(['sales', 'inventory', 'production', 'channel', 'custom']).describe('Report type'),
    config: z.record(z.any()).describe('Report configuration'),
  })),

  tool('export_report_pdf', 'Export report as PDF', z.object({
    tenantId: z.string().describe('Tenant ID'),
    type: z.enum(['sales', 'inventory', 'production', 'channel', 'custom']).describe('Report type'),
    config: z.record(z.any()).describe('Report configuration'),
  })),

  // ---- NOTIFICATIONS ----
  tool('create_notification_channel', 'Create a notification channel (email, slack, line, webhook)', z.object({
    tenantId: z.string().describe('Tenant ID'),
    type: z.enum(['email', 'slack', 'line', 'webhook']).describe('Channel type'),
    label: z.string().describe('Display label'),
    config: z.record(z.any()).describe('Channel configuration (webhook URL, SMTP, tokens)'),
  })),

  tool('list_notification_channels', 'List notification channels', z.object({
    tenantId: z.string().describe('Tenant ID'),
    type: z.string().optional().describe('Filter by type'),
  })),

  tool('create_notification_rule', 'Create a notification rule', z.object({
    tenantId: z.string().describe('Tenant ID'),
    name: z.string().describe('Rule name'),
    eventType: z.string().describe('Event type (low_stock, new_order, production_complete, etc.)'),
    conditionConfig: z.record(z.any()).optional().describe('Condition config {field, operator, value}'),
    channelIds: z.array(z.string()).describe('Channel IDs to notify'),
  })),

  tool('list_notification_rules', 'List notification rules', z.object({
    tenantId: z.string().describe('Tenant ID'),
    eventType: z.string().optional().describe('Filter by event type'),
  })),

  tool('send_notification', 'Send a test notification', z.object({
    tenantId: z.string().describe('Tenant ID'),
    eventType: z.string().describe('Event type'),
    message: z.string().describe('Notification message'),
    data: z.record(z.any()).optional().describe('Additional data for condition evaluation'),
  })),

  tool('get_notification_logs', 'Get notification delivery logs', z.object({
    tenantId: z.string().describe('Tenant ID'),
    limit: z.number().optional().describe('Max logs to return'),
  })),

  // ---- RBAC & TEAMS ----
  tool('create_role', 'Create a custom role with permissions', z.object({
    tenantId: z.string().describe('Tenant ID'),
    name: z.string().describe('Role name'),
    description: z.string().optional(),
    permissions: z.array(z.string()).describe('List of permission keys'),
  })),

  tool('list_roles', 'List all roles', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('update_role', 'Update a role', z.object({
    tenantId: z.string().describe('Tenant ID'),
    roleId: z.string().describe('Role ID'),
    name: z.string().optional(),
    description: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  })),

  tool('delete_role', 'Delete a custom role', z.object({
    tenantId: z.string().describe('Tenant ID'),
    roleId: z.string().describe('Role ID'),
  })),

  tool('check_permission', 'Check if a user has a specific permission', z.object({
    tenantId: z.string().describe('Tenant ID'),
    userId: z.string().describe('User ID'),
    permission: z.string().describe('Permission key to check'),
  })),

  tool('create_team', 'Create a team', z.object({
    tenantId: z.string().describe('Tenant ID'),
    name: z.string().describe('Team name'),
    description: z.string().optional(),
  })),

  tool('list_teams', 'List all teams', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('add_team_member', 'Add a user to a team with optional role', z.object({
    tenantId: z.string().describe('Tenant ID'),
    teamId: z.string().describe('Team ID'),
    userId: z.string().describe('User ID'),
    roleId: z.string().optional().describe('Role ID for this team member'),
  })),

  tool('list_team_members', 'List team members', z.object({
    tenantId: z.string().describe('Tenant ID'),
    teamId: z.string().describe('Team ID'),
  })),

  tool('remove_team_member', 'Remove a user from a team', z.object({
    tenantId: z.string().describe('Tenant ID'),
    teamId: z.string().describe('Team ID'),
    userId: z.string().describe('User ID'),
  })),

  tool('get_audit_logs', 'Get audit logs', z.object({
    tenantId: z.string().describe('Tenant ID'),
    limit: z.number().optional().describe('Max logs'),
    offset: z.number().optional().describe('Offset'),
  })),
];

export function createMCPServer() {
  const server = new Server(
    { name: 'erp-core', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  const db = getDatabase();
  const auth = new AuthManager();

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      return await handleToolCall(name, args as Record<string, any>, db, auth);
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: true, message: error.message }, null, 2) }],
      };
    }
  });

  return server;
}

export async function handleToolCall(name: string, _args: Record<string, any>, db: any, auth: AuthManager) {
  const args = _args as any;
  const { tenantId } = args;
  if (!tenantId) throw new Error('tenantId is required');

  const now = Math.floor(Date.now() / 1000);

  switch (name) {
    case 'list_products': {
      const { categoryId, status, search, limit = 50, offset = 0 } = args;
      let sql = 'SELECT * FROM products WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (categoryId) { sql += ' AND category_id = ?'; params.push(categoryId); }
      if (status) { sql += ' AND status = ?'; params.push(status); }
      if (search) { sql += ' AND (name LIKE ? OR sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const products = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(products, null, 2) }] };
    }

    case 'get_product': {
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(args.productId, tenantId);
      if (!product) throw new Error('Product not found');
      return { content: [{ type: 'text', text: JSON.stringify(product, null, 2) }] };
    }

    case 'create_product': {
      const id = crypto.randomUUID();
      const { name, description, sku, price, costPrice, quantity = 0, categoryId, tags, weight } = args;
      db.prepare(`INSERT INTO products (id, tenant_id, name, description, sku, price, cost_price, quantity, category_id, tags, weight, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, tenantId, name, description || null, sku || null, price, costPrice || 0, quantity, categoryId || null, JSON.stringify(tags || []), weight || null, now, now);
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      return { content: [{ type: 'text', text: JSON.stringify(product, null, 2) }] };
    }

    case 'update_product': {
      const { productId, ...fields } = args;
      const updates: string[] = [];
      const params: any[] = [];
      ['name', 'description', 'price', 'quantity', 'status'].forEach(f => {
        if (fields[f] !== undefined) { updates.push(`${f} = ?`); params.push(fields[f]); }
      });
      if (updates.length === 0) throw new Error('No fields to update');
      updates.push('updated_at = ?'); params.push(now);
      params.push(productId, tenantId);
      db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...params);
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
      return { content: [{ type: 'text', text: JSON.stringify(product, null, 2) }] };
    }

    case 'list_orders': {
      const { status, startDate, endDate, limit = 50, offset = 0 } = args;
      let sql = 'SELECT * FROM orders WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (status) { sql += ' AND status = ?'; params.push(status); }
      if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate); }
      if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate); }
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const orders = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(orders, null, 2) }] };
    }

    case 'get_order': {
      const order = db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').get(args.orderId, tenantId) as any;
      if (!order) throw new Error('Order not found');
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      return { content: [{ type: 'text', text: JSON.stringify({ ...order, items }, null, 2) }] };
    }

    case 'create_order': {
      const id = crypto.randomUUID();
      const orderNumber = `ORD-${Date.now()}`;
      const { customerName, customerEmail, items, shippingCost = 0, notes, channel = 'direct' } = args;
      let subtotal = 0;
      const itemData: any[] = [];
      for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(item.productId, tenantId) as any;
        if (!product) throw new Error(`Product ${item.productId} not found`);
        const price = item.unitPrice || product.price;
        subtotal += price * item.quantity;
        itemData.push({ ...item, product });
      }
      const total = subtotal + shippingCost;
      db.prepare(`INSERT INTO orders (id, tenant_id, order_number, status, customer_name, customer_email, subtotal, shipping_cost, total, channel, notes, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, tenantId, orderNumber, customerName, customerEmail || null, subtotal, shippingCost, total, channel, notes || null, now, now);
      const insertItem = db.prepare(`INSERT INTO order_items (id, order_id, product_id, name, sku, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const item of itemData) {
        const product = item.product;
        const price = item.unitPrice || product.price;
        insertItem.run(crypto.randomUUID(), id, item.productId, product.name, product.sku, item.quantity, price, price * item.quantity);
        db.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ?').run(item.quantity, item.productId);
      }
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      return { content: [{ type: 'text', text: JSON.stringify(order, null, 2) }] };
    }

    case 'get_inventory': {
      const { lowStockOnly, threshold = 5 } = args;
      let sql = 'SELECT id, name, sku, quantity, low_stock_threshold, price, cost_price, status FROM products WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (lowStockOnly) sql += ' AND quantity <= low_stock_threshold AND status = "active"';
      const products = db.prepare(sql).all(...params) as any[];
      const totalValue = products.reduce((sum: number, p: any) => sum + (p.quantity * (p.cost_price || 0)), 0);
      return { content: [{ type: 'text', text: JSON.stringify({ totalProducts: products.length, totalValue, lowStockCount: lowStockOnly ? products.length : products.filter((p: any) => p.quantity <= p.low_stock_threshold).length, products }, null, 2) }] };
    }

    case 'adjust_inventory': {
      const { productId, quantity, reason } = args;
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(productId, tenantId) as any;
      if (!product) throw new Error('Product not found');
      db.prepare('UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ?').run(quantity, now, productId);
      db.prepare(`INSERT INTO inventory_transactions (id, tenant_id, product_id, type, quantity, reference_type, notes, created_at) VALUES (?, ?, ?, 'adjustment', ?, 'manual', ?, ?)`)
        .run(crypto.randomUUID(), tenantId, productId, quantity, reason || null, now);
      const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
      return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
    }

    case 'list_customers': {
      const { search, limit = 50, offset = 0 } = args;
      let sql = 'SELECT * FROM customers WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (search) { sql += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      sql += ' ORDER BY total_spent DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const customers = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(customers, null, 2) }] };
    }

    case 'get_customer': {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND tenant_id = ?').get(args.customerId, tenantId);
      if (!customer) throw new Error('Customer not found');
      const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20').all(args.customerId);
      return { content: [{ type: 'text', text: JSON.stringify({ ...customer, recentOrders: orders }, null, 2) }] };
    }

    case 'get_customer_insights': {
      const total = db.prepare('SELECT COUNT(*) as count, SUM(total_spent) as revenue FROM customers WHERE tenant_id = ?').get(tenantId) as any;
      const repeatRate = db.prepare('SELECT COUNT(*) as count FROM customers WHERE tenant_id = ? AND total_orders > 1').get(tenantId) as any;
      const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers WHERE tenant_id = ?').get(tenantId) as any;
      return { content: [{ type: 'text', text: JSON.stringify({ totalCustomers: totalCustomers.count, totalRevenue: total.revenue || 0, repeatCustomers: repeatRate.count, repeatRate: totalCustomers.count > 0 ? Math.round((repeatRate.count / totalCustomers.count) * 100) : 0 }, null, 2) }] };
    }

    case 'get_finance_summary': {
      const { startDate, endDate } = args;
      let sql = 'SELECT SUM(total) as revenue, COUNT(*) as orders FROM orders WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate); }
      if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate); }
      const summary = db.prepare(sql).get(...params) as any;
      const transactions = db.prepare('SELECT type, SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? GROUP BY type').all(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify({ revenue: summary.revenue || 0, totalOrders: summary.orders || 0, transactions }, null, 2) }] };
    }

    case 'list_transactions': {
      const { type, category, limit = 50, offset = 0 } = args;
      let sql = 'SELECT * FROM finance_transactions WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (type) { sql += ' AND type = ?'; params.push(type); }
      if (category) { sql += ' AND category = ?'; params.push(category); }
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const results = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }

    case 'get_sales_report': {
      const { period } = args;
      const periodMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
      const days = periodMap[period] || 30;
      const startDate = now - days * 86400;
      const orders = db.prepare('SELECT * FROM orders WHERE tenant_id = ? AND created_at >= ? ORDER BY created_at ASC').all(tenantId, startDate) as any[];
      const dailyMap = new Map<string, { revenue: number; orders: number }>();
      orders.forEach((o: any) => {
        const date = new Date(o.created_at * 1000).toISOString().split('T')[0];
        const existing = dailyMap.get(date) || { revenue: 0, orders: 0 };
        existing.revenue += o.total;
        existing.orders += 1;
        dailyMap.set(date, existing);
      });
      const totalRevenue = orders.reduce((s: number, o: any) => s + o.total, 0);
      const totalOrders = orders.length;
      return { content: [{ type: 'text', text: JSON.stringify({ period, totalRevenue, totalOrders, averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0, dailyBreakdown: Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data })) }, null, 2) }] };
    }

    case 'get_inventory_report': {
      const products = db.prepare('SELECT id, name, sku, quantity, cost_price, price, (quantity * cost_price) as total_value FROM products WHERE tenant_id = ?').all(tenantId) as any[];
      const totalValue = products.reduce((s: number, p: any) => s + (p.total_value || 0), 0);
      const totalPotential = products.reduce((s: number, p: any) => s + (p.quantity * p.price), 0);
      return { content: [{ type: 'text', text: JSON.stringify({ totalProducts: products.length, totalCostValue: totalValue, totalPotentialRevenue: totalPotential, products }, null, 2) }] };
    }

    case 'list_kb_collections': {
      const collections = db.prepare('SELECT * FROM kb_collections WHERE tenant_id = ? ORDER BY sort_order').all(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(collections, null, 2) }] };
    }

    case 'list_kb_documents': {
      const { collectionId, search } = args;
      let sql = 'SELECT id, collection_id, title, tags, is_published, created_at, updated_at FROM kb_documents WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (collectionId) { sql += ' AND collection_id = ?'; params.push(collectionId); }
      if (search) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      sql += ' ORDER BY updated_at DESC';
      const docs = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(docs, null, 2) }] };
    }

    case 'get_kb_document': {
      const doc = db.prepare('SELECT * FROM kb_documents WHERE id = ? AND tenant_id = ?').get(args.documentId, tenantId);
      if (!doc) throw new Error('Document not found');
      return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
    }

    case 'create_kb_document': {
      const id = crypto.randomUUID();
      const { collectionId, title, content, tags } = args;
      const contentHtml = content
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
      db.prepare(`INSERT INTO kb_documents (id, tenant_id, collection_id, title, content, content_html, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, tenantId, collectionId, title, content, contentHtml, JSON.stringify(tags || []), now, now);
      const doc = db.prepare('SELECT * FROM kb_documents WHERE id = ?').get(id);
      return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
    }

    case 'get_tenant_info': {
      const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
      if (!tenant) throw new Error('Tenant not found');
      const users = db.prepare('SELECT id, email, name, role FROM users WHERE tenant_id = ?').all(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify({ ...tenant, users }, null, 2) }] };
    }

    case 'get_subscription': {
      const sub = db.prepare('SELECT * FROM subscriptions WHERE tenant_id = ? AND status = "active"').get(tenantId);
      if (!sub) return { content: [{ type: 'text', text: JSON.stringify({ plan: 'free', status: 'no_active_subscription' }, null, 2) }] };
      return { content: [{ type: 'text', text: JSON.stringify(sub, null, 2) }] };
    }

    case 'get_usage_stats': {
      const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders WHERE tenant_id = ?').get(tenantId) as any;
      const productCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE tenant_id = ?').get(tenantId) as any;
      const customerCount = db.prepare('SELECT COUNT(*) as count FROM customers WHERE tenant_id = ?').get(tenantId) as any;
      const storageSize = db.prepare('SELECT COUNT(*) as count FROM kb_documents WHERE tenant_id = ?').get(tenantId) as any;
      return { content: [{ type: 'text', text: JSON.stringify({ orders: orderCount.count, products: productCount.count, customers: customerCount.count, documents: storageSize.count }, null, 2) }] };
    }

    // ---- ANALYTICS HANDLERS ----
    case 'get_dashboard_summary': {
      const analytics = new EtsyAnalytics();
      const result = analytics.getDashboardSummary({ tenantId, startDate: args.startDate, endDate: args.endDate });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_product_performance': {
      const analytics = new EtsyAnalytics();
      const result = analytics.getProductPerformance({ tenantId, startDate: args.startDate, endDate: args.endDate });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_sales_trends': {
      const analytics = new EtsyAnalytics();
      const result = analytics.getSalesTrends({ tenantId, startDate: args.startDate, endDate: args.endDate });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_channel_breakdown': {
      const analytics = new EtsyAnalytics();
      const result = analytics.getChannelBreakdown({ tenantId, startDate: args.startDate, endDate: args.endDate });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_top_products': {
      const analytics = new EtsyAnalytics();
      const result = analytics.getTopProducts({ tenantId, startDate: args.startDate, endDate: args.endDate, limit: args.limit });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_etsy_analytics': {
      const analytics = new EtsyAnalytics();
      const result = analytics.getEtsySpecific({ tenantId, startDate: args.startDate, endDate: args.endDate });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    // ---- PRODUCTION PLANNING HANDLERS ----
    case 'create_bom': {
      const planner = new ProductionPlanner();
      const result = planner.createBOM(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_bom': {
      const planner = new ProductionPlanner();
      const result = planner.getBOM(args.bomId);
      if (!result) throw new Error('BOM not found');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_boms': {
      const planner = new ProductionPlanner();
      const result = planner.listBOMs(tenantId, args.productId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'update_bom': {
      const planner = new ProductionPlanner();
      const result = planner.updateBOM(args.bomId, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'create_reorder_rule': {
      const planner = new ProductionPlanner();
      const result = planner.createReorderRule(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_reorder_rules': {
      const planner = new ProductionPlanner();
      const result = planner.listReorderRules(tenantId, args.productId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'check_reorder_needs': {
      const planner = new ProductionPlanner();
      const result = planner.checkReorderNeeds(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'auto_schedule_production': {
      const planner = new ProductionPlanner();
      const result = planner.autoScheduleProduction(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'create_production_order': {
      const planner = new ProductionPlanner();
      const result = planner.createProductionOrder(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_production_orders': {
      const planner = new ProductionPlanner();
      const result = planner.listProductionOrders(tenantId, args.status, args.limit);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_production_order': {
      const planner = new ProductionPlanner();
      const result = planner.getProductionOrder(args.orderId);
      if (!result) throw new Error('Production order not found');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'update_production_status': {
      const planner = new ProductionPlanner();
      const result = planner.updateProductionStatus(args.orderId, args.status, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_production_schedule': {
      const planner = new ProductionPlanner();
      const result = planner.getProductionSchedule(tenantId, args.startDate, args.endDate);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    // ---- MULTI-CHANNEL HANDLERS ----
    case 'create_channel_connection': {
      const cm = new ChannelManager();
      const result = cm.createConnection(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_channel_connections': {
      const cm = new ChannelManager();
      const result = cm.listConnections(tenantId, args.channelType);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'update_channel_connection': {
      const cm = new ChannelManager();
      const result = cm.updateConnection(args.connectionId, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'delete_channel_connection': {
      const cm = new ChannelManager();
      const result = cm.deleteConnection(args.connectionId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'create_channel_listing': {
      const cm = new ChannelManager();
      const result = cm.createListing(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_channel_listings': {
      const cm = new ChannelManager();
      const result = cm.listListings(tenantId, args.channelConnectionId, args.productId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_inventory_sync_status': {
      const cm = new ChannelManager();
      const result = cm.getInventorySyncStatus(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    // ---- ADVANCED REPORTS ----
    case 'create_report': {
      const re = new ReportEngine();
      const result = re.createReport(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_reports': {
      const re = new ReportEngine();
      const result = re.listReports(tenantId, args.type);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_report': {
      const re = new ReportEngine();
      const result = re.getReport(args.reportId);
      if (!result) throw new Error('Report not found');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'update_report': {
      const re = new ReportEngine();
      const result = re.updateReport(args.reportId, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'delete_report': {
      const re = new ReportEngine();
      re.deleteReport(args.reportId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }, null, 2) }] };
    }

    case 'execute_report': {
      const re = new ReportEngine();
      const result = re.executeReport(args.reportId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'execute_adhoc_report': {
      const re = new ReportEngine();
      const result = re.executeAdhocReport(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'export_report_csv': {
      const re = new ReportEngine();
      const data = re.executeAdhocReport(args);
      const csv = re.exportCSV(data.breakdown || data.products || data.orders || data.listings || [data.summary]);
      return { content: [{ type: 'text', text: csv }] };
    }

    case 'export_report_pdf': {
      const re = new ReportEngine();
      const data = re.executeAdhocReport(args);
      const sections: { heading: string; content: string[] }[] = [];
      if (data.summary) {
        sections.push({
          heading: 'Summary',
          content: Object.entries(data.summary).map(([k, v]) => `${k}: ${v}`),
        });
      }
      if (data.breakdown) {
        sections.push({
          heading: 'Breakdown',
          content: data.breakdown.slice(0, 50).map((b: any) => JSON.stringify(b)),
        });
      }
      if (data.topProducts) {
        sections.push({
          heading: 'Top Products',
          content: data.topProducts.slice(0, 20).map((p: any) => `${p.name}: $${p.revenue} (${p.quantity} units)`),
        });
      }
      if (data.channels) {
        sections.push({
          heading: 'Channel Breakdown',
          content: data.channels.map((c: any) => `${c.channel}: $${c.revenue}`),
        });
      }
      const pdfBuf = await re.exportPDF(`Report: ${args.type}`, sections);
      return { content: [{ type: 'text', text: pdfBuf.toString('base64') }] };
    }

    // ---- NOTIFICATIONS ----
    case 'create_notification_channel': {
      const ne = new NotificationEngine();
      const result = ne.createChannel(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_notification_channels': {
      const ne = new NotificationEngine();
      const result = ne.listChannels(tenantId, args.type);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'create_notification_rule': {
      const ne = new NotificationEngine();
      const result = ne.createRule(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_notification_rules': {
      const ne = new NotificationEngine();
      const result = ne.listRules(tenantId, args.eventType);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'send_notification': {
      const ne = new NotificationEngine();
      const result = ne.sendNotification(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_notification_logs': {
      const ne = new NotificationEngine();
      const result = ne.getLogs(tenantId, args.limit);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    // ---- RBAC & TEAMS ----
    case 'create_role': {
      const rbac = new RBACManager();
      const result = rbac.createRole(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_roles': {
      const rbac = new RBACManager();
      const result = rbac.listRoles(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'update_role': {
      const rbac = new RBACManager();
      const result = rbac.updateRole(args.roleId, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'delete_role': {
      const rbac = new RBACManager();
      rbac.deleteRole(args.roleId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }, null, 2) }] };
    }

    case 'check_permission': {
      const rbac = new RBACManager();
      const result = rbac.hasPermission(args.userId, args.permission);
      return { content: [{ type: 'text', text: JSON.stringify({ hasPermission: result }, null, 2) }] };
    }

    case 'create_team': {
      const rbac = new RBACManager();
      const result = rbac.createTeam(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_teams': {
      const rbac = new RBACManager();
      const result = rbac.listTeams(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'add_team_member': {
      const rbac = new RBACManager();
      const result = rbac.addTeamMember(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_team_members': {
      const rbac = new RBACManager();
      const result = rbac.listTeamMembers(args.teamId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'remove_team_member': {
      const rbac = new RBACManager();
      rbac.removeTeamMember(args.teamId, args.userId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }, null, 2) }] };
    }

    case 'get_audit_logs': {
      const rbac = new RBACManager();
      const result = rbac.getAuditLogs(tenantId, args.limit, args.offset);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
