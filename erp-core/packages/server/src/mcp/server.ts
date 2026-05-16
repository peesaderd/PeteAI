// ============================================================
// ERP Core - MCP Server (Main)
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v3';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getDatabase } from '../db/database.js';
import { AuthManager } from '../auth/auth.js';
import { EtsyAnalytics } from '../analytics/etsy.js';
import { ProductionPlanner } from '../production/index.js';
import { ChannelManager } from '../channels/index.js';
import { ReportEngine } from '../reports/index.js';
import { NotificationEngine } from '../notifications/index.js';
import { RBACManager } from '../rbac/index.js';
import { ServiceRegistry } from '../gateway/registry.js';

function tool(name: string, description: string, schema: z.ZodTypeAny) {
  return { name, description, inputSchema: zodToJsonSchema(schema as any) };
}

const TOOLS = [
  // ---- AUTH ----
  tool('auth_register', 'Register a new user', z.object({
    tenantId: z.string().describe('Tenant ID'),
    email: z.string().describe('User email'),
    name: z.string().describe('User display name'),
    password: z.string().describe('Password'),
    role: z.string().optional().describe('Role (admin, manager, member)'),
  })),

  tool('auth_login', 'Login with email and password', z.object({
    tenantId: z.string().describe('Tenant ID'),
    email: z.string().describe('User email'),
    password: z.string().describe('Password'),
  })),

  tool('auth_verify', 'Verify a JWT token', z.object({
    tenantId: z.string().describe('Tenant ID'),
    token: z.string().describe('JWT token to verify'),
  })),

  tool('auth_list_users', 'List all users in a tenant', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('auth_get_user', 'Get user details by ID', z.object({
    tenantId: z.string().describe('Tenant ID'),
    userId: z.string().describe('User ID'),
  })),

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

  tool('update_order_status', 'Update order status', z.object({
    tenantId: z.string().describe('Tenant ID'),
    orderId: z.string().describe('Order ID'),
    status: z.enum(["pending", "preparing", "served", "paid", "cancelled"]).describe('New order status'),
    notes: z.string().optional().describe('Updated notes (JSON string for POS fields)'),
  })),

  tool('update_order_items', 'Replace all items in an order', z.object({
    tenantId: z.string().describe('Tenant ID'),
    orderId: z.string().describe('Order ID'),
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number(),
      unitPrice: z.number().optional(),
    })).describe('New order items'),
  })),

  tool('append_order_items', 'Append items to an existing order', z.object({
    tenantId: z.string().describe('Tenant ID'),
    orderId: z.string().describe('Order ID'),
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number(),
      unitPrice: z.number().optional(),
    })).describe('Items to append'),
  })),

  tool('mark_item_served', 'Mark a specific order item as served', z.object({
    tenantId: z.string().describe('Tenant ID'),
    orderId: z.string().describe('Order ID'),
    itemId: z.string().describe('Order item ID'),
  })),

  tool('delete_order', 'Cancel/delete an order', z.object({
    tenantId: z.string().describe('Tenant ID'),
    orderId: z.string().describe('Order ID'),
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

  tool('create_transaction', 'Create a finance transaction', z.object({
    tenantId: z.string().describe('Tenant ID'),
    type: z.enum(["income","expense","transfer","ar","ap"]).describe("Transaction type"),
    category: z.string().describe("Transaction category"),
    amount: z.number().describe("Transaction amount"),
    currency: z.string().optional().describe("Currency (default: USD)"),
    description: z.string().optional(),
    accountId: z.string().optional().describe("Chart of Accounts ID"),
    referenceType: z.string().optional(),
    referenceId: z.string().optional(),
    transactionDate: z.number().optional().describe("Unix timestamp"),
  })),

  tool("get_chart_of_accounts", "Get chart of accounts", z.object({
    tenantId: z.string().describe("Tenant ID"),
    type: z.string().optional().describe("Filter by type (asset, liability, equity, income, expense)"),
    activeOnly: z.boolean().optional(),
  })),

  tool("create_account", "Create a chart of account entry", z.object({
    tenantId: z.string().describe("Tenant ID"),
    code: z.string().describe("Account code (e.g. 1100)"),
    name: z.string().describe("Account name"),
    type: z.enum(["asset","liability","equity","income","expense"]).describe("Account type"),
    subtype: z.string().optional(),
    parentId: z.string().optional(),
    description: z.string().optional(),
  })),

  tool("get_balance_sheet", "Get balance sheet", z.object({
    tenantId: z.string().describe("Tenant ID"),
    asOfDate: z.number().optional().describe("Unix timestamp"),
  })),

  tool("get_profit_loss", "Get profit & loss statement", z.object({
    tenantId: z.string().describe("Tenant ID"),
    startDate: z.number().optional(),
    endDate: z.number().optional(),
  })),

  tool("get_accounts_receivable", "List accounts receivable", z.object({
    tenantId: z.string().describe("Tenant ID"),
    status: z.string().optional().describe("pending, partial, paid, overdue, written_off"),
  })),

  tool("get_accounts_payable", "List accounts payable", z.object({
    tenantId: z.string().describe("Tenant ID"),
    status: z.string().optional(),
  })),

  tool("create_ar_invoice", "Create an accounts receivable invoice", z.object({
    tenantId: z.string().describe("Tenant ID"),
    customerId: z.string().describe("Customer ID"),
    invoiceNumber: z.string().describe("Invoice number"),
    amount: z.number().describe("Invoice amount"),
    dueDate: z.number().describe("Due date (Unix)"),
    notes: z.string().optional(),
  })),

  tool("create_ap_invoice", "Create an accounts payable invoice", z.object({
    tenantId: z.string().describe("Tenant ID"),
    vendorName: z.string().describe("Vendor name"),
    invoiceNumber: z.string().describe("Invoice number"),
    amount: z.number().describe("Invoice amount"),
    dueDate: z.number().describe("Due date (Unix)"),
    notes: z.string().optional(),
  })),

  tool("record_payment", "Record a payment against AR or AP", z.object({
    tenantId: z.string().describe("Tenant ID"),
    type: z.enum(["ar","ap"]).describe("AR or AP"),
    invoiceId: z.string().describe("Invoice ID"),
    amount: z.number().describe("Payment amount"),
  })),

  tool("get_tax_rates", "List tax rates", z.object({
    tenantId: z.string().describe("Tenant ID"),
  })),

  tool("create_tax_rate", "Create a tax rate", z.object({
    tenantId: z.string().describe("Tenant ID"),
    name: z.string().describe("Tax name (e.g. VAT 7%)"),
    rate: z.number().describe("Tax rate (e.g. 0.07 for 7%)"),
    type: z.enum(["vat","sales_tax","gst","other"]).describe("Tax type"),
  })),

  tool("get_budgets", "List budgets", z.object({
    tenantId: z.string().describe("Tenant ID"),
  })),

  tool("create_budget", "Create a budget", z.object({
    tenantId: z.string().describe("Tenant ID"),
    name: z.string().describe("Budget name"),
    category: z.string().describe("Budget category"),
    amount: z.number().describe("Budget amount"),
    period: z.enum(["monthly","quarterly","yearly"]).describe("Budget period"),
    startDate: z.number().describe("Start date (Unix)"),
    endDate: z.number().describe("End date (Unix)"),
  })),

  tool("get_bank_reconciliations", "List bank reconciliations", z.object({
    tenantId: z.string().describe("Tenant ID"),
  })),

  tool("create_bank_reconciliation", "Create a bank reconciliation", z.object({
    tenantId: z.string().describe("Tenant ID"),
    accountName: z.string().describe("Bank account name"),
    statementBalance: z.number().describe("Balance per bank statement"),
    systemBalance: z.number().describe("Balance per system"),
    notes: z.string().optional(),
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

  tool('get_settings', 'Get POS/shop settings', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('update_settings', 'Update POS/shop settings', z.object({
    tenantId: z.string().describe('Tenant ID'),
    settings: z.record(z.any()).describe('Settings key-value pairs to update'),
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

  // ---- PROCUREMENT & SUPPLY CHAIN ----

  tool('list_suppliers', 'List all suppliers', z.object({
    tenantId: z.string().describe('Tenant ID'),
    status: z.string().optional().describe('Filter by status (active/inactive/blacklisted)'),
    search: z.string().optional().describe('Search by name or code'),
    limit: z.number().optional().describe('Max results'),
    offset: z.number().optional().describe('Offset'),
  })),

  tool('get_supplier', 'Get supplier details', z.object({
    tenantId: z.string().describe('Tenant ID'),
    supplierId: z.string().describe('Supplier ID'),
  })),

  tool('create_supplier', 'Create a new supplier', z.object({
    tenantId: z.string().describe('Tenant ID'),
    code: z.string().describe('Supplier code'),
    name: z.string().describe('Supplier name'),
    contactPerson: z.string().optional().describe('Contact person'),
    email: z.string().optional().describe('Email'),
    phone: z.string().optional().describe('Phone'),
    address: z.string().optional().describe('Address'),
    taxId: z.string().optional().describe('Tax ID'),
    paymentTerms: z.string().optional().describe('Payment terms (e.g. net30)'),
    leadTimeDays: z.number().optional().describe('Lead time in days'),
    notes: z.string().optional().describe('Notes'),
  })),

  tool('update_supplier', 'Update a supplier', z.object({
    tenantId: z.string().describe('Tenant ID'),
    supplierId: z.string().describe('Supplier ID'),
    name: z.string().optional().describe('Supplier name'),
    contactPerson: z.string().optional().describe('Contact person'),
    email: z.string().optional().describe('Email'),
    phone: z.string().optional().describe('Phone'),
    address: z.string().optional().describe('Address'),
    taxId: z.string().optional().describe('Tax ID'),
    paymentTerms: z.string().optional().describe('Payment terms'),
    leadTimeDays: z.number().optional().describe('Lead time in days'),
    status: z.string().optional().describe('Status (active/inactive/blacklisted)'),
    notes: z.string().optional().describe('Notes'),
  })),

  tool('list_supplier_products', 'List products a supplier provides', z.object({
    tenantId: z.string().describe('Tenant ID'),
    supplierId: z.string().describe('Supplier ID'),
    limit: z.number().optional().describe('Max results'),
    offset: z.number().optional().describe('Offset'),
  })),

  tool('create_supplier_product', 'Link a product to a supplier', z.object({
    tenantId: z.string().describe('Tenant ID'),
    supplierId: z.string().describe('Supplier ID'),
    productId: z.string().describe('Product ID'),
    supplierSku: z.string().optional().describe('Supplier SKU'),
    unitCost: z.number().describe('Unit cost from supplier'),
    moq: z.number().optional().describe('Minimum order quantity'),
    leadTimeDays: z.number().optional().describe('Lead time in days'),
    isPreferred: z.boolean().optional().describe('Is preferred supplier for this product'),
  })),

  tool('list_purchase_orders', 'List purchase orders', z.object({
    tenantId: z.string().describe('Tenant ID'),
    status: z.string().optional().describe('Filter by status'),
    supplierId: z.string().optional().describe('Filter by supplier'),
    limit: z.number().optional().describe('Max results'),
    offset: z.number().optional().describe('Offset'),
  })),

  tool('get_purchase_order', 'Get purchase order details', z.object({
    tenantId: z.string().describe('Tenant ID'),
    poId: z.string().describe('Purchase Order ID'),
  })),

  tool('create_purchase_order', 'Create a purchase order', z.object({
    tenantId: z.string().describe('Tenant ID'),
    poNumber: z.string().describe('PO number'),
    supplierId: z.string().describe('Supplier ID'),
    expectedDate: z.number().optional().describe('Expected delivery date (epoch ms)'),
    notes: z.string().optional().describe('Notes'),
    shippingAddress: z.string().optional().describe('Shipping address'),
    items: z.array(z.object({
      productId: z.string().describe('Product ID'),
      quantityOrdered: z.number().describe('Quantity ordered'),
      unitCost: z.number().describe('Unit cost'),
    })).describe('PO line items'),
  })),

  tool('update_purchase_order_status', 'Update purchase order status', z.object({
    tenantId: z.string().describe('Tenant ID'),
    poId: z.string().describe('Purchase Order ID'),
    status: z.enum(['draft','pending_approval','approved','sent','confirmed','partially_received','received','cancelled']).describe('New status'),
    notes: z.string().optional().describe('Status change notes'),
  })),

  tool('receive_purchase_order', 'Receive items against a purchase order', z.object({
    tenantId: z.string().describe('Tenant ID'),
    poId: z.string().describe('Purchase Order ID'),
    items: z.array(z.object({
      itemId: z.string().describe('PO item ID'),
      quantityReceived: z.number().describe('Quantity received'),
    })).describe('Items being received'),
    warehouseId: z.string().optional().describe('Warehouse to receive into'),
  })),

  tool('list_warehouses', 'List warehouse locations', z.object({
    tenantId: z.string().describe('Tenant ID'),
    type: z.string().optional().describe('Filter by type'),
    limit: z.number().optional().describe('Max results'),
    offset: z.number().optional().describe('Offset'),
  })),

  tool('create_warehouse', 'Create a warehouse location', z.object({
    tenantId: z.string().describe('Tenant ID'),
    code: z.string().describe('Warehouse code'),
    name: z.string().describe('Warehouse name'),
    type: z.string().optional().describe('Type (warehouse/store/storage/returns/transit)'),
    address: z.string().optional().describe('Address'),
  })),

  tool('list_warehouse_bins', 'List bins in a warehouse', z.object({
    tenantId: z.string().describe('Tenant ID'),
    warehouseId: z.string().describe('Warehouse ID'),
    zone: z.string().optional().describe('Filter by zone'),
    limit: z.number().optional().describe('Max results'),
    offset: z.number().optional().describe('Offset'),
  })),

  tool('create_warehouse_bin', 'Create a bin in a warehouse', z.object({
    tenantId: z.string().describe('Tenant ID'),
    warehouseId: z.string().describe('Warehouse ID'),
    code: z.string().describe('Bin code'),
    zone: z.string().optional().describe('Zone'),
    maxCapacity: z.number().optional().describe('Max capacity'),
  })),

  tool('transfer_inventory', 'Transfer inventory between locations', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().describe('Product ID'),
    quantity: z.number().describe('Quantity to transfer'),
    fromLocationId: z.string().optional().describe('Source location ID'),
    toLocationId: z.string().optional().describe('Destination location ID'),
    fromBinId: z.string().optional().describe('Source bin ID'),
    toBinId: z.string().optional().describe('Destination bin ID'),
    notes: z.string().optional().describe('Transfer notes'),
  })),

  tool('list_inventory_movements', 'List inventory movements', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().optional().describe('Filter by product'),
    type: z.string().optional().describe('Filter by type (transfer/receipt/adjustment/issue/return)'),
    limit: z.number().optional().describe('Max results'),
    offset: z.number().optional().describe('Offset'),
  })),

  tool('list_drop_ship_orders', 'List drop ship orders', z.object({
    tenantId: z.string().describe('Tenant ID'),
    status: z.string().optional().describe('Filter by status'),
    supplierId: z.string().optional().describe('Filter by supplier'),
    limit: z.number().optional().describe('Max results'),
    offset: z.number().optional().describe('Offset'),
  })),

  tool('update_drop_ship_status', 'Update drop ship order status', z.object({
    tenantId: z.string().describe('Tenant ID'),
    dropShipId: z.string().describe('Drop ship order ID'),
    status: z.enum(['pending','sent','confirmed','shipped','delivered','cancelled']).describe('New status'),
    trackingNumber: z.string().optional().describe('Tracking number'),
    notes: z.string().optional().describe('Notes'),
  })),

  tool('get_shipping_tracking', 'Get shipping tracking info', z.object({
    tenantId: z.string().describe('Tenant ID'),
    referenceType: z.string().describe('Reference type (purchase_order/sales_order/drop_ship)'),
    referenceId: z.string().describe('Reference ID'),
  })),

  tool('update_shipping_tracking', 'Update shipping tracking info', z.object({
    tenantId: z.string().describe('Tenant ID'),
    referenceType: z.string().describe('Reference type'),
    referenceId: z.string().describe('Reference ID'),
    carrier: z.string().optional().describe('Carrier name'),
    trackingNumber: z.string().optional().describe('Tracking number'),
    status: z.string().optional().describe('Status'),
    notes: z.string().optional().describe('Notes'),
  })),

  tool('get_audit_logs', 'Get audit logs', z.object({
    tenantId: z.string().describe('Tenant ID'),
    limit: z.number().optional().describe('Max logs'),
    offset: z.number().optional().describe('Offset'),
  })),

  // ---- AI AGENT MODULES (Phase 2) ----

  tool('ai_chat', 'AI Customer Support Chat - answer customer questions using KB + ERP data', z.object({
    tenantId: z.string().describe('Tenant ID'),
    sessionId: z.string().optional().describe('Conversation session ID'),
    message: z.string().describe('Customer message'),
    customerId: z.string().optional().describe('Customer ID for context'),
    language: z.string().optional().describe('Language (th/en)'),
  })),

  tool('ai_generate_product_description', 'Generate AI product description from product data', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().describe('Product ID'),
    style: z.enum(['standard', 'marketing', 'seo', 'short']).optional().describe('Description style'),
    language: z.string().optional().describe('Language (th/en)'),
    keywords: z.array(z.string()).optional().describe('Keywords to include'),
  })),

  tool('ai_forecast_demand', 'Forecast product demand based on historical sales data', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().optional().describe('Product ID (omit for all products)'),
    categoryId: z.string().optional().describe('Category ID'),
    period: z.enum(['7d', '30d', '90d']).optional().describe('Forecast period'),
    method: z.enum(['moving_average', 'trend', 'seasonal']).optional().describe('Forecast method'),
  })),

  tool('ai_detect_fraud', 'Detect potentially fraudulent orders/transactions', z.object({
    tenantId: z.string().describe('Tenant ID'),
    orderId: z.string().optional().describe('Check specific order'),
    days: z.number().optional().describe('Look back days (default 30)'),
    threshold: z.number().optional().describe('Risk threshold 0-1 (default 0.7)'),
  })),

  tool('ai_analyze_image', 'Analyze product image using AI vision', z.object({
    tenantId: z.string().describe('Tenant ID'),
    imageUrl: z.string().describe('Image URL or base64 data'),
    analysis: z.enum(['labels', 'text', 'quality', 'category', 'all']).optional().describe('Analysis type'),
    productId: z.string().optional().describe('Associated product ID'),
  })),
  tool('list_ai_providers', 'List all configured AI providers for a tenant', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('get_active_ai_provider', 'Get the currently active AI provider for a tenant', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('set_active_ai_provider', 'Set the active AI provider for a tenant', z.object({
    tenantId: z.string().describe('Tenant ID'),
    providerId: z.string().describe('Provider ID to activate'),
  })),

  tool('test_ai_provider', 'Test connection to an AI provider', z.object({
    tenantId: z.string().describe('Tenant ID'),
    providerId: z.string().describe('Provider ID to test'),
  })),

  tool('upsert_ai_provider', 'Create or update an AI provider configuration', z.object({
    tenantId: z.string().describe('Tenant ID'),
    providerId: z.string().optional().describe('Provider ID (omit to create new)'),
    name: z.string().describe('Display name'),
    provider: z.enum(['openai','deepseek','anthropic','ollama','openhands','custom']).describe('Provider type'),
    apiKey: z.string().optional().describe('API key'),
    apiUrl: z.string().optional().describe('Custom API URL'),
    model: z.string().optional().describe('Model name'),
    maxTokens: z.number().optional().describe('Max tokens'),
    temperature: z.number().optional().describe('Temperature'),
  })),
  // ============================================================
  // HR & PAYROLL TOOLS
  // ============================================================

  tool('list_employees', 'List all employees', z.object({
    tenantId: z.string().describe('Tenant ID'),
    department: z.string().optional().describe('Filter by department'),
    status: z.string().optional().describe('Filter by status (active/inactive/terminated/on_leave)'),
    search: z.string().optional().describe('Search by name or code'),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool('get_employee', 'Get employee details', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().describe('Employee ID'),
  })),

  tool('create_employee', 'Create a new employee', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeCode: z.string().describe('Employee code'),
    firstName: z.string().describe('First name'),
    lastName: z.string().describe('Last name'),
    email: z.string().optional(),
    phone: z.string().optional(),
    position: z.string().optional(),
    department: z.string().optional(),
    managerId: z.string().optional(),
    hireDate: z.number().optional(),
    employmentType: z.enum(['full_time','part_time','contract','intern','temporary']).optional(),
    baseSalary: z.number().optional(),
    currency: z.string().optional(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    taxId: z.string().optional(),
    address: z.string().optional(),
    emergencyContact: z.string().optional(),
    emergencyPhone: z.string().optional(),
    notes: z.string().optional(),
  })),

  tool('update_employee', 'Update employee details', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().describe('Employee ID'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    position: z.string().optional(),
    department: z.string().optional(),
    managerId: z.string().optional(),
    status: z.enum(['active','inactive','terminated','on_leave']).optional(),
    baseSalary: z.number().optional(),
    currency: z.string().optional(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    taxId: z.string().optional(),
    address: z.string().optional(),
    emergencyContact: z.string().optional(),
    emergencyPhone: z.string().optional(),
    notes: z.string().optional(),
  })),

  tool('clock_in', 'Clock in for an employee', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().describe('Employee ID'),
    timestamp: z.number().optional().describe('Custom timestamp (default now)'),
  })),

  tool('clock_out', 'Clock out for an employee', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().describe('Employee ID'),
    timestamp: z.number().optional().describe('Custom timestamp (default now)'),
  })),

  tool('get_time_today', 'Get today time record for an employee', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().describe('Employee ID'),
  })),

  tool('list_time_records', 'List time tracking records', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool('request_leave', 'Request a leave', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().describe('Employee ID'),
    leaveType: z.enum(['annual','sick','personal','maternity','paternity','bereavement','unpaid','other']).describe('Leave type'),
    startDate: z.string().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().describe('End date (YYYY-MM-DD)'),
    totalDays: z.number().describe('Total days'),
    reason: z.string().optional(),
  })),

  tool('approve_leave', 'Approve or reject a leave request', z.object({
    tenantId: z.string().describe('Tenant ID'),
    leaveId: z.string().describe('Leave request ID'),
    status: z.enum(['approved','rejected']).describe('New status'),
    approvedBy: z.string().describe('Approver employee ID'),
    notes: z.string().optional(),
  })),

  tool('list_leave_requests', 'List leave requests', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().optional(),
    status: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool('get_leave_balance', 'Get leave balance for an employee', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().describe('Employee ID'),
    year: z.number().optional().describe('Year (default current)'),
  })),

  tool('create_payroll_period', 'Create a payroll period', z.object({
    tenantId: z.string().describe('Tenant ID'),
    periodName: z.string().describe('Period name'),
    periodType: z.enum(['weekly','biweekly','monthly']).describe('Period type'),
    startDate: z.string().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().describe('End date (YYYY-MM-DD)'),
    paymentDate: z.string().optional().describe('Payment date'),
  })),

  tool('process_payroll', 'Process payroll for a period (generate payroll items for all active employees)', z.object({
    tenantId: z.string().describe('Tenant ID'),
    periodId: z.string().describe('Payroll period ID'),
  })),

  tool('list_payroll_periods', 'List payroll periods', z.object({
    tenantId: z.string().describe('Tenant ID'),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool('list_payroll_items', 'List payroll items for a period', z.object({
    tenantId: z.string().describe('Tenant ID'),
    periodId: z.string().describe('Payroll period ID'),
    employeeId: z.string().optional(),
  })),

  tool('mark_payroll_paid', 'Mark payroll period as paid', z.object({
    tenantId: z.string().describe('Tenant ID'),
    periodId: z.string().describe('Payroll period ID'),
    paidAt: z.number().optional().describe('Payment timestamp'),
  })),

  tool('create_performance_review', 'Create a performance review', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().describe('Employee ID'),
    reviewerId: z.string().describe('Reviewer employee ID'),
    reviewPeriod: z.string().describe('Review period (e.g. Q1-2026)'),
    rating: z.number().min(1).max(5).optional(),
    goalsAchieved: z.string().optional(),
    strengths: z.string().optional(),
    areasForImprovement: z.string().optional(),
    overallFeedback: z.string().optional(),
  })),

  tool('list_performance_reviews', 'List performance reviews', z.object({
    tenantId: z.string().describe('Tenant ID'),
    employeeId: z.string().optional(),
    reviewerId: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool('update_performance_review', 'Update a performance review', z.object({
    tenantId: z.string().describe('Tenant ID'),
    reviewId: z.string().describe('Review ID'),
    status: z.enum(['draft','submitted','acknowledged','completed']).describe('New status'),
    rating: z.number().min(1).max(5).optional(),
    overallFeedback: z.string().optional(),
  })),

  // ============================================================
  // MARKETING TOOLS
  // ============================================================

  tool('list_campaigns', 'List marketing campaigns', z.object({
    tenantId: z.string().describe('Tenant ID'),
    status: z.string().optional().describe('Filter by status'),
    type: z.string().optional().describe('Filter by type'),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool('create_campaign', 'Create a marketing campaign', z.object({
    tenantId: z.string().describe('Tenant ID'),
    name: z.string().describe('Campaign name'),
    description: z.string().optional(),
    type: z.enum(['email','social','seo','discount','multi']).describe('Campaign type'),
    budget: z.number().optional(),
    targetAudience: z.string().optional(),
    startDate: z.number().optional(),
    endDate: z.number().optional(),
  })),

  tool('update_campaign', 'Update a marketing campaign', z.object({
    tenantId: z.string().describe('Tenant ID'),
    campaignId: z.string().describe('Campaign ID'),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['draft','scheduled','active','paused','completed','cancelled']).optional(),
    budget: z.number().optional(),
  })),

  tool('get_campaign_metrics', 'Get campaign performance metrics', z.object({
    tenantId: z.string().describe('Tenant ID'),
    campaignId: z.string().describe('Campaign ID'),
  })),

  tool('list_email_templates', 'List email templates', z.object({
    tenantId: z.string().describe('Tenant ID'),
    category: z.string().optional(),
  })),

  tool('create_email_template', 'Create an email template', z.object({
    tenantId: z.string().describe('Tenant ID'),
    name: z.string().describe('Template name'),
    subject: z.string().describe('Email subject'),
    bodyHtml: z.string().optional().describe('HTML body'),
    bodyText: z.string().optional().describe('Plain text body'),
    category: z.string().optional(),
  })),

  tool('list_email_lists', 'List email subscriber lists', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('create_email_list', 'Create an email subscriber list', z.object({
    tenantId: z.string().describe('Tenant ID'),
    name: z.string().describe('List name'),
    description: z.string().optional(),
  })),

  tool('add_subscriber', 'Add a subscriber to an email list', z.object({
    tenantId: z.string().describe('Tenant ID'),
    listId: z.string().describe('List ID'),
    email: z.string().describe('Subscriber email'),
    name: z.string().optional(),
  })),

  tool('list_seo_keywords', 'List SEO keywords', z.object({
    tenantId: z.string().describe('Tenant ID'),
    productId: z.string().optional(),
  })),

  tool('create_seo_keyword', 'Create an SEO keyword tracker', z.object({
    tenantId: z.string().describe('Tenant ID'),
    keyword: z.string().describe('Keyword'),
    productId: z.string().optional(),
    targetUrl: z.string().optional(),
    targetRanking: z.number().optional(),
    searchVolume: z.number().optional(),
  })),

  tool('list_social_accounts', 'List social media accounts', z.object({
    tenantId: z.string().describe('Tenant ID'),
  })),

  tool('create_social_account', 'Add a social media account', z.object({
    tenantId: z.string().describe('Tenant ID'),
    platform: z.enum(['facebook','instagram','twitter','linkedin','tiktok','line','other']).describe('Platform'),
    label: z.string().describe('Display label'),
    accountId: z.string().optional(),
  })),

  tool('schedule_social_post', 'Schedule a social media post', z.object({
    tenantId: z.string().describe('Tenant ID'),
    accountId: z.string().describe('Social account ID'),
    content: z.string().describe('Post content'),
    scheduledAt: z.number().describe('Scheduled timestamp'),
    mediaUrls: z.array(z.string()).optional(),
  })),

  tool('list_discounts', 'List discount coupons', z.object({
    tenantId: z.string().describe('Tenant ID'),
    isActive: z.boolean().optional(),
  })),

  tool('create_discount', 'Create a discount coupon', z.object({
    tenantId: z.string().describe('Tenant ID'),
    code: z.string().describe('Coupon code'),
    type: z.enum(['percentage','fixed_amount','free_shipping','buy_x_get_y']).describe('Discount type'),
    value: z.number().describe('Discount value'),
    minOrderAmount: z.number().optional(),
    maxDiscountAmount: z.number().optional(),
    usageLimit: z.number().optional(),
    startDate: z.number().optional(),
    endDate: z.number().optional(),
    description: z.string().optional(),
  })),

  tool('validate_discount', 'Validate a discount code for an order', z.object({
    tenantId: z.string().describe('Tenant ID'),
    code: z.string().describe('Coupon code'),
    orderAmount: z.number().describe('Order amount'),
    customerId: z.string().optional(),
  })),


  // ---- HR & PAYROLL ----

  tool("list_employees", "List all employees", z.object({
    tenantId: z.string().describe("Tenant ID"),
    department: z.string().optional().describe("Filter by department"),
    status: z.string().optional().describe("Filter by status"),
    search: z.string().optional().describe("Search by name or code"),
    limit: z.number().optional().describe("Max results"),
    offset: z.number().optional().describe("Offset"),
  })),

  tool("get_employee", "Get employee details", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().describe("Employee ID"),
  })),

  tool("create_employee", "Create a new employee", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeCode: z.string().describe("Employee code"),
    firstName: z.string().describe("First name"),
    lastName: z.string().describe("Last name"),
    email: z.string().optional().describe("Email"),
    phone: z.string().optional().describe("Phone"),
    position: z.string().optional().describe("Job position"),
    department: z.string().optional().describe("Department"),
    managerId: z.string().optional().describe("Manager employee ID"),
    hireDate: z.number().optional().describe("Hire date (epoch ms)"),
    employmentType: z.enum(["full_time","part_time","contract","intern","temporary"]).optional().describe("Employment type"),
    baseSalary: z.number().optional().describe("Base salary"),
    currency: z.string().optional().describe("Currency"),
    bankName: z.string().optional().describe("Bank name"),
    bankAccount: z.string().optional().describe("Bank account"),
    taxId: z.string().optional().describe("Tax ID"),
    address: z.string().optional().describe("Address"),
    emergencyContact: z.string().optional().describe("Emergency contact name"),
    emergencyPhone: z.string().optional().describe("Emergency contact phone"),
    notes: z.string().optional().describe("Notes"),
  })),

  tool("update_employee", "Update an employee", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().describe("Employee ID"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    position: z.string().optional(),
    department: z.string().optional(),
    managerId: z.string().optional(),
    status: z.enum(["active","inactive","terminated","on_leave"]).optional(),
    baseSalary: z.number().optional(),
    currency: z.string().optional(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    taxId: z.string().optional(),
    address: z.string().optional(),
    emergencyContact: z.string().optional(),
    emergencyPhone: z.string().optional(),
    notes: z.string().optional(),
  })),

  tool("clock_in", "Record employee clock-in", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().describe("Employee ID"),
    timestamp: z.number().optional().describe("Clock-in timestamp (epoch ms, defaults to now)"),
  })),

  tool("clock_out", "Record employee clock-out", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().describe("Employee ID"),
    timestamp: z.number().optional().describe("Clock-out timestamp (epoch ms, defaults to now)"),
  })),

  tool("get_time_today", "Get today\"s time tracking for an employee", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().describe("Employee ID"),
  })),

  tool("list_time_records", "List time tracking records", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().optional().describe("Filter by employee"),
    dateFrom: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    dateTo: z.string().optional().describe("End date (YYYY-MM-DD)"),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool("request_leave", "Submit a leave request", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().describe("Employee ID"),
    leaveType: z.enum(["annual","sick","personal","maternity","paternity","bereavement","unpaid","other"]).describe("Leave type"),
    startDate: z.string().describe("Start date (YYYY-MM-DD)"),
    endDate: z.string().describe("End date (YYYY-MM-DD)"),
    totalDays: z.number().describe("Total days"),
    reason: z.string().optional().describe("Reason"),
  })),

  tool("approve_leave", "Approve or reject a leave request", z.object({
    tenantId: z.string().describe("Tenant ID"),
    leaveId: z.string().describe("Leave request ID"),
    status: z.enum(["approved","rejected"]).describe("New status"),
    approvedBy: z.string().describe("Approver employee ID"),
    notes: z.string().optional().describe("Notes"),
  })),

  tool("list_leave_requests", "List leave requests", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().optional().describe("Filter by employee"),
    status: z.string().optional().describe("Filter by status"),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool("get_leave_balance", "Get employee leave balance for a year", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().describe("Employee ID"),
    year: z.number().optional().describe("Year (defaults to current)"),
  })),

  tool("create_payroll_period", "Create a payroll period", z.object({
    tenantId: z.string().describe("Tenant ID"),
    periodName: z.string().describe("Period name (e.g. May 2026)"),
    periodType: z.enum(["weekly","biweekly","monthly"]).describe("Period type"),
    startDate: z.string().describe("Start date (YYYY-MM-DD)"),
    endDate: z.string().describe("End date (YYYY-MM-DD)"),
    paymentDate: z.string().optional().describe("Payment date (YYYY-MM-DD)"),
  })),

  tool("process_payroll", "Calculate payroll for all employees in a period", z.object({
    tenantId: z.string().describe("Tenant ID"),
    periodId: z.string().describe("Payroll period ID"),
  })),

  tool("list_payroll_periods", "List payroll periods", z.object({
    tenantId: z.string().describe("Tenant ID"),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool("list_payroll_items", "List payroll items for a period", z.object({
    tenantId: z.string().describe("Tenant ID"),
    periodId: z.string().describe("Payroll period ID"),
    employeeId: z.string().optional().describe("Filter by employee"),
  })),

  tool("mark_payroll_paid", "Mark payroll items as paid", z.object({
    tenantId: z.string().describe("Tenant ID"),
    periodId: z.string().describe("Payroll period ID"),
    paidAt: z.number().optional().describe("Payment timestamp (epoch ms)"),
  })),

  tool("create_performance_review", "Create a performance review", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().describe("Employee ID"),
    reviewerId: z.string().describe("Reviewer employee ID"),
    reviewPeriod: z.string().describe("Review period (e.g. Q1 2026)"),
    rating: z.number().min(1).max(5).optional().describe("Rating 1-5"),
    goalsAchieved: z.string().optional().describe("Goals achieved"),
    strengths: z.string().optional().describe("Strengths"),
    areasForImprovement: z.string().optional().describe("Areas for improvement"),
    overallFeedback: z.string().optional().describe("Overall feedback"),
  })),

  tool("list_performance_reviews", "List performance reviews", z.object({
    tenantId: z.string().describe("Tenant ID"),
    employeeId: z.string().optional().describe("Filter by employee"),
    reviewerId: z.string().optional().describe("Filter by reviewer"),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })),

  tool("update_performance_review", "Update a performance review status", z.object({
    tenantId: z.string().describe("Tenant ID"),
    reviewId: z.string().describe("Review ID"),
    status: z.enum(["draft","submitted","acknowledged","completed"]).describe("New status"),
    rating: z.number().min(1).max(5).optional(),
    overallFeedback: z.string().optional(),
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
    // ---- AUTH ----
    case 'auth_register': {
      const { email, name: userName, password, role } = args;
      try {
        const user = await auth.register(tenantId, email, userName, password, role || 'member');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, user }, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }, null, 2) }] };
      }
    }

    case 'auth_login': {
      const { email, password } = args;
      const result = await auth.login(email, password);
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Invalid email or password' }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...result }, null, 2) }] };
    }

    case 'auth_verify': {
      const { token } = args;
      const payload = auth.verifyToken(token);
      if (!payload) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Invalid or expired token' }, null, 2) }] };
      }
      const user = auth.getUser(payload.userId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, payload, user }, null, 2) }] };
    }

    case 'auth_list_users': {
      const users = auth.listUsers(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(users, null, 2) }] };
    }

    case 'auth_get_user': {
      const { userId } = args;
      const user = auth.getUser(userId);
      if (!user) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found' }) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(user, null, 2) }] };
    }

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

    case 'update_order_status': {
      const { orderId, status, notes } = args;
      const existing = db.prepare("SELECT * FROM orders WHERE id = ? AND tenant_id = ?").get(orderId, tenantId) as any;
      if (!existing) throw new Error("Order not found");
      const now = Date.now();
      let updateNotes = existing.notes;
      if (notes !== undefined) {
        try {
          const existingNotes = existing.notes ? JSON.parse(existing.notes) : {};
          const newNotes = JSON.parse(notes);
          updateNotes = JSON.stringify({ ...existingNotes, ...newNotes });
        } catch {
          updateNotes = notes;
        }
      }
      db.prepare("UPDATE orders SET status = ?, notes = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
        .run(status, updateNotes, now, orderId, tenantId);
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
      return { content: [{ type: "text", text: JSON.stringify({ ...order, items }, null, 2) }] };
    }

    case 'update_order_items': {
      const { orderId, items } = args;
      const existing = db.prepare("SELECT * FROM orders WHERE id = ? AND tenant_id = ?").get(orderId, tenantId) as any;
      if (!existing) throw new Error("Order not found");
      if (existing.status === "paid" || existing.status === "cancelled") throw new Error("Cannot modify a paid/cancelled order");
      db.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
      let subtotal = 0;
      const insertItem = db.prepare("INSERT INTO order_items (id, order_id, product_id, name, sku, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const item of items) {
        const product = db.prepare("SELECT * FROM products WHERE id = ? AND tenant_id = ?").get(item.productId, tenantId) as any;
        if (!product) throw new Error("Product " + item.productId + " not found");
        const price = item.unitPrice || product.price;
        const totalPrice = price * item.quantity;
        subtotal += totalPrice;
        insertItem.run(crypto.randomUUID(), orderId, item.productId, product.name, product.sku, item.quantity, price, totalPrice);
      }
      const now = Date.now();
      const total = subtotal + (existing.shipping_cost || 0);
      db.prepare("UPDATE orders SET subtotal = ?, total = ?, updated_at = ? WHERE id = ?").run(subtotal, total, now, orderId);
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      const orderItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
      return { content: [{ type: "text", text: JSON.stringify({ ...order, items: orderItems }, null, 2) }] };
    }

    case 'append_order_items': {
      const { orderId, items } = args;
      const existing = db.prepare("SELECT * FROM orders WHERE id = ? AND tenant_id = ?").get(orderId, tenantId) as any;
      if (!existing) throw new Error("Order not found");
      if (existing.status === "paid" || existing.status === "cancelled") throw new Error("Cannot modify a paid/cancelled order");
      let subtotal = existing.subtotal || 0;
      const insertItem = db.prepare("INSERT INTO order_items (id, order_id, product_id, name, sku, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const item of items) {
        const product = db.prepare("SELECT * FROM products WHERE id = ? AND tenant_id = ?").get(item.productId, tenantId) as any;
        if (!product) throw new Error("Product " + item.productId + " not found");
        const price = item.unitPrice || product.price;
        const totalPrice = price * item.quantity;
        subtotal += totalPrice;
        insertItem.run(crypto.randomUUID(), orderId, item.productId, product.name, product.sku, item.quantity, price, totalPrice);
      }
      const now = Date.now();
      const total = subtotal + (existing.shipping_cost || 0);
      db.prepare("UPDATE orders SET subtotal = ?, total = ?, updated_at = ? WHERE id = ?").run(subtotal, total, now, orderId);
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      const orderItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
      return { content: [{ type: "text", text: JSON.stringify({ ...order, items: orderItems }, null, 2) }] };
    }

    case 'mark_item_served': {
      const { orderId, itemId } = args;
      const existing = db.prepare("SELECT * FROM orders WHERE id = ? AND tenant_id = ?").get(orderId, tenantId) as any;
      if (!existing) throw new Error("Order not found");
      const item = db.prepare("SELECT * FROM order_items WHERE id = ? AND order_id = ?").get(itemId, orderId) as any;
      if (!item) throw new Error("Order item not found");
      const now = Date.now();
      let notes = existing.notes ? JSON.parse(existing.notes) : {};
      if (typeof notes === "string") { try { notes = JSON.parse(notes); } catch { notes = {}; } }
      if (!notes.servedItems) notes.servedItems = {};
      notes.servedItems[itemId] = { servedAt: now, name: item.name };
      db.prepare("UPDATE orders SET notes = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(notes), now, orderId);
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      const orderItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
      return { content: [{ type: "text", text: JSON.stringify({ ...order, items: orderItems }, null, 2) }] };
    }

    case 'delete_order': {
      const { orderId } = args;
      const existing = db.prepare("SELECT * FROM orders WHERE id = ? AND tenant_id = ?").get(orderId, tenantId) as any;
      if (!existing) throw new Error("Order not found");
      db.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
      db.prepare("DELETE FROM orders WHERE id = ? AND tenant_id = ?").run(orderId, tenantId);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, deleted: orderId }, null, 2) }] };
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

    case 'get_settings': {
      db.prepare('CREATE TABLE IF NOT EXISTS tenant_settings (tenant_id TEXT PRIMARY KEY, settings TEXT NOT NULL)').run();
      const row = db.prepare('SELECT settings FROM tenant_settings WHERE tenant_id = ?').get(tenantId) as any;
      const settings = row ? JSON.parse(row.settings) : {};
      return { content: [{ type: 'text', text: JSON.stringify(settings, null, 2) }] };
    }

    case 'update_settings': {
      db.prepare('CREATE TABLE IF NOT EXISTS tenant_settings (tenant_id TEXT PRIMARY KEY, settings TEXT NOT NULL)').run();
      const existing = db.prepare('SELECT settings FROM tenant_settings WHERE tenant_id = ?').get(tenantId) as any;
      const current = existing ? JSON.parse(existing.settings) : {};
      const merged = { ...current, ...args.settings };
      db.prepare('INSERT OR REPLACE INTO tenant_settings (tenant_id, settings) VALUES (?, ?)').run(tenantId, JSON.stringify(merged));
      return { content: [{ type: 'text', text: JSON.stringify(merged, null, 2) }] };
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

    // ---- PROCUREMENT & SUPPLY CHAIN HANDLERS ----

    case 'list_suppliers': {
      const { status, search, limit = 50, offset = 0 } = args;
      let sql = 'SELECT * FROM suppliers WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (status) { sql += ' AND status = ?'; params.push(status); }
      if (search) { sql += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      sql += ' ORDER BY name ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const result = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_supplier': {
      const { supplierId } = args;
      const result = db.prepare('SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?').get(supplierId, tenantId);
      if (!result) throw new Error('Supplier not found');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'create_supplier': {
      const { code, name, contactPerson, email, phone, address, taxId, paymentTerms, leadTimeDays, notes } = args;
      const id = 'sup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO suppliers (id, tenant_id, code, name, contact_person, email, phone, address, tax_id, payment_terms, lead_time_days, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`).run(id, tenantId, code, name, contactPerson || null, email || null, phone || null, address || null, taxId || null, paymentTerms || 'net30', leadTimeDays || 7, notes || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'update_supplier': {
      const { supplierId, name, contactPerson, email, phone, address, taxId, paymentTerms, leadTimeDays, status, notes } = args;
      const now = Date.now();
      const existing = db.prepare('SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?').get(supplierId, tenantId) as any;
      if (!existing) throw new Error('Supplier not found');
      db.prepare(`UPDATE suppliers SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?, tax_id = ?, payment_terms = ?, lead_time_days = ?, status = ?, notes = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`).run(name ?? existing.name, contactPerson ?? existing.contact_person, email ?? existing.email, phone ?? existing.phone, address ?? existing.address, taxId ?? existing.tax_id, paymentTerms ?? existing.payment_terms, leadTimeDays ?? existing.lead_time_days, status ?? existing.status, notes ?? existing.notes, now, supplierId, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify({ id: supplierId, success: true }, null, 2) }] };
    }

    case 'list_supplier_products': {
      const { supplierId, limit = 50, offset = 0 } = args;
      const result = db.prepare('SELECT sp.*, p.name as product_name, p.sku as product_sku FROM supplier_products sp JOIN products p ON p.id = sp.product_id WHERE sp.supplier_id = ? AND sp.tenant_id = ? ORDER BY sp.is_preferred DESC LIMIT ? OFFSET ?').all(supplierId, tenantId, limit, offset);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'create_supplier_product': {
      const { supplierId, productId, supplierSku, unitCost, moq, leadTimeDays, isPreferred } = args;
      const id = 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO supplier_products (id, tenant_id, supplier_id, product_id, supplier_sku, unit_cost, moq, lead_time_days, is_preferred, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, supplierId, productId, supplierSku || null, unitCost, moq || 1, leadTimeDays || null, isPreferred ? 1 : 0, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'list_purchase_orders': {
      const { status, supplierId, limit = 50, offset = 0 } = args;
      let sql = 'SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.tenant_id = ?';
      const params: any[] = [tenantId];
      if (status) { sql += ' AND po.status = ?'; params.push(status); }
      if (supplierId) { sql += ' AND po.supplier_id = ?'; params.push(supplierId); }
      sql += ' ORDER BY po.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const result = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'get_purchase_order': {
      const { poId } = args;
      const po = db.prepare('SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ? AND po.tenant_id = ?').get(poId, tenantId) as any;
      if (!po) throw new Error('Purchase order not found');
      const items = db.prepare('SELECT poi.*, p.name as product_name, p.sku as product_sku FROM purchase_order_items poi JOIN products p ON p.id = poi.product_id WHERE poi.po_id = ?').all(poId);
      po.items = items;
      return { content: [{ type: 'text', text: JSON.stringify(po, null, 2) }] };
    }

    case 'create_purchase_order': {
      const { poNumber, supplierId, expectedDate, notes, shippingAddress, items } = args;
      if (!items || items.length === 0) throw new Error('At least one item is required');
      const id = 'po_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      let subtotal = 0;
      for (const item of items) {
        subtotal += item.quantityOrdered * item.unitCost;
      }
      db.prepare(`INSERT INTO purchase_orders (id, tenant_id, po_number, supplier_id, status, order_date, subtotal, total_amount, notes, shipping_address, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, poNumber, supplierId, now, subtotal, subtotal, notes || null, shippingAddress || null, now, now);
      for (const item of items) {
        const itemId = 'poi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        db.prepare(`INSERT INTO purchase_order_items (id, tenant_id, po_id, product_id, quantity_ordered, quantity_received, unit_cost, total_cost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`).run(itemId, tenantId, id, item.productId, item.quantityOrdered, item.unitCost, item.quantityOrdered * item.unitCost, now, now);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ id, poNumber, success: true }, null, 2) }] };
    }

    case 'update_purchase_order_status': {
      const { poId, status, notes } = args;
      const now = Date.now();
      const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND tenant_id = ?').get(poId, tenantId) as any;
      if (!existing) throw new Error('Purchase order not found');
      db.prepare(`UPDATE purchase_orders SET status = ?, notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END, updated_at = ? WHERE id = ? AND tenant_id = ?`).run(status, notes, notes, now, poId, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify({ id: poId, status, success: true }, null, 2) }] };
    }

    case 'receive_purchase_order': {
      const { poId, items, warehouseId } = args;
      const now = Date.now();
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND tenant_id = ?').get(poId, tenantId) as any;
      if (!po) throw new Error('Purchase order not found');
      let allReceived = true;
      for (const item of items) {
        const poi = db.prepare('SELECT * FROM purchase_order_items WHERE id = ? AND po_id = ?').get(item.itemId, poId) as any;
        if (!poi) throw new Error(`Item ${item.itemId} not found in PO`);
        const newReceived = poi.quantity_received + item.quantityReceived;
        db.prepare('UPDATE purchase_order_items SET quantity_received = ?, updated_at = ? WHERE id = ?').run(newReceived, now, item.itemId);
        if (newReceived < poi.quantity_ordered) allReceived = false;
        // Update product inventory
        const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(poi.product_id, tenantId) as any;
        if (product) {
          db.prepare('UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ?').run(item.quantityReceived, now, poi.product_id);
        }
        // Record inventory movement
        const movId = 'mov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        db.prepare(`INSERT INTO inventory_movements (id, tenant_id, product_id, to_location_id, quantity, type, reference_type, reference_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'receipt', 'purchase_order', ?, ?, ?)`).run(movId, tenantId, poi.product_id, warehouseId || null, item.quantityReceived, poId, now, now);
      }
      const newStatus = allReceived ? 'received' : 'partially_received';
      db.prepare('UPDATE purchase_orders SET status = ?, received_date = ?, updated_at = ? WHERE id = ?').run(newStatus, now, now, poId);
      return { content: [{ type: 'text', text: JSON.stringify({ id: poId, status: newStatus, success: true }, null, 2) }] };
    }

    case 'list_warehouses': {
      const { type, limit = 50, offset = 0 } = args;
      let sql = 'SELECT * FROM warehouse_locations WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (type) { sql += ' AND type = ?'; params.push(type); }
      sql += ' ORDER BY name ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const result = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'create_warehouse': {
      const { code, name, type = 'warehouse', address } = args;
      const id = 'wh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO warehouse_locations (id, tenant_id, code, name, type, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, code, name, type, address || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'list_warehouse_bins': {
      const { warehouseId, zone, limit = 50, offset = 0 } = args;
      let sql = 'SELECT * FROM warehouse_bins WHERE tenant_id = ? AND warehouse_id = ?';
      const params: any[] = [tenantId, warehouseId];
      if (zone) { sql += ' AND zone = ?'; params.push(zone); }
      sql += ' ORDER BY code ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const result = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'create_warehouse_bin': {
      const { warehouseId, code, zone, maxCapacity } = args;
      const id = 'bin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO warehouse_bins (id, tenant_id, warehouse_id, code, zone, max_capacity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, warehouseId, code, zone || null, maxCapacity || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'transfer_inventory': {
      const { productId, quantity, fromLocationId, toLocationId, fromBinId, toBinId, notes } = args;
      if (quantity <= 0) throw new Error('Quantity must be positive');
      const now = Date.now();
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(productId, tenantId) as any;
      if (!product) throw new Error('Product not found');
      // Deduct from source
      if (fromLocationId) {
        db.prepare('UPDATE products SET quantity = quantity - ?, updated_at = ? WHERE id = ?').run(quantity, now, productId);
      }
      // Add to destination
      if (toLocationId) {
        db.prepare('UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ?').run(quantity, now, productId);
      }
      const id = 'mov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      db.prepare(`INSERT INTO inventory_movements (id, tenant_id, product_id, from_location_id, to_location_id, from_bin_id, to_bin_id, quantity, type, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?)`).run(id, tenantId, productId, fromLocationId || null, toLocationId || null, fromBinId || null, toBinId || null, quantity, notes || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'list_inventory_movements': {
      const { productId, type, limit = 50, offset = 0 } = args;
      let sql = 'SELECT im.*, p.name as product_name, p.sku as product_sku FROM inventory_movements im JOIN products p ON p.id = im.product_id WHERE im.tenant_id = ?';
      const params: any[] = [tenantId];
      if (productId) { sql += ' AND im.product_id = ?'; params.push(productId); }
      if (type) { sql += ' AND im.type = ?'; params.push(type); }
      sql += ' ORDER BY im.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const result = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_drop_ship_orders': {
      const { status, supplierId, limit = 50, offset = 0 } = args;
      let sql = 'SELECT dso.*, s.name as supplier_name FROM drop_ship_orders dso JOIN suppliers s ON s.id = dso.supplier_id WHERE dso.tenant_id = ?';
      const params: any[] = [tenantId];
      if (status) { sql += ' AND dso.status = ?'; params.push(status); }
      if (supplierId) { sql += ' AND dso.supplier_id = ?'; params.push(supplierId); }
      sql += ' ORDER BY dso.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const result = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'update_drop_ship_status': {
      const { dropShipId, status, trackingNumber, notes } = args;
      const now = Date.now();
      const existing = db.prepare('SELECT * FROM drop_ship_orders WHERE id = ? AND tenant_id = ?').get(dropShipId, tenantId) as any;
      if (!existing) throw new Error('Drop ship order not found');
      db.prepare(`UPDATE drop_ship_orders SET status = ?, tracking_number = COALESCE(?, tracking_number), notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND tenant_id = ?`).run(status, trackingNumber || null, notes || null, now, dropShipId, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify({ id: dropShipId, status, success: true }, null, 2) }] };
    }

    case 'get_shipping_tracking': {
      const { referenceType, referenceId } = args;
      const result = db.prepare('SELECT * FROM shipping_tracking WHERE reference_type = ? AND reference_id = ? AND tenant_id = ?').all(referenceType, referenceId, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'update_shipping_tracking': {
      const { referenceType, referenceId, carrier, trackingNumber, status, notes } = args;
      const now = Date.now();
      const existing = db.prepare('SELECT * FROM shipping_tracking WHERE reference_type = ? AND reference_id = ? AND tenant_id = ?').get(referenceType, referenceId, tenantId) as any;
      if (existing) {
        db.prepare(`UPDATE shipping_tracking SET carrier = COALESCE(?, carrier), tracking_number = COALESCE(?, tracking_number), status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`).run(carrier || null, trackingNumber || null, status || null, notes || null, now, existing.id);
        return { content: [{ type: 'text', text: JSON.stringify({ id: existing.id, success: true }, null, 2) }] };
      } else {
        const id = 'st_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        db.prepare(`INSERT INTO shipping_tracking (id, tenant_id, reference_type, reference_id, carrier, tracking_number, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, referenceType, referenceId, carrier || null, trackingNumber || null, status || 'pending', notes || null, now, now);
        return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
      }
    }

    // ---- FINANCE TOOL HANDLERS ----

    case 'create_transaction': {
      const { type, category, amount, currency = 'USD', description, accountId, referenceType, referenceId, transactionDate } = args;
      const id = 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      const txnDate = transactionDate || now;
      db.prepare(`INSERT INTO finance_transactions (id, tenant_id, type, category, amount, currency, description, account_id, reference_type, reference_id, transaction_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, type, category, amount, currency, description, accountId || null, referenceType || null, referenceId || null, txnDate, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'get_chart_of_accounts': {
      const { type, activeOnly } = args;
      let sql = 'SELECT * FROM chart_of_accounts WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (type) { sql += ' AND type = ?'; params.push(type); }
      if (activeOnly) { sql += ' AND is_active = 1'; }
      sql += ' ORDER BY code ASC';
      const results = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }

    case 'create_account': {
      const { code, name, type, subtype, parentId, description } = args;
      const id = 'acct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO chart_of_accounts (id, tenant_id, code, name, type, subtype, parent_id, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, code, name, type, subtype || null, parentId || null, description || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'get_balance_sheet': {
      const { asOfDate } = args;
      const date = asOfDate || Date.now();
      // Assets
      const assets = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type IN ('income','ar') AND transaction_date <= ?").get(tenantId, date) as any;
      // Liabilities
      const liabilities = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type IN ('expense','ap') AND transaction_date <= ?").get(tenantId, date) as any;
      const equity = (assets?.total || 0) - (liabilities?.total || 0);
      return { content: [{ type: 'text', text: JSON.stringify({
        asOfDate: date,
        totalAssets: assets?.total || 0,
        totalLiabilities: liabilities?.total || 0,
        equity,
        assets: db.prepare("SELECT type, SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type IN ('income','ar') AND transaction_date <= ? GROUP BY type").all(tenantId, date),
        liabilities: db.prepare("SELECT type, SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type IN ('expense','ap') AND transaction_date <= ? GROUP BY type").all(tenantId, date),
      }, null, 2) }] };
    }

    case 'get_profit_loss': {
      const { startDate, endDate } = args;
      const now = Date.now();
      const sd = startDate || (now - 30 * 86400 * 1000);
      const ed = endDate || now;
      const income = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type = 'income' AND transaction_date >= ? AND transaction_date <= ?").get(tenantId, sd, ed) as any;
      const expenses = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type = 'expense' AND transaction_date >= ? AND transaction_date <= ?").get(tenantId, sd, ed) as any;
      const netIncome = (income?.total || 0) - (expenses?.total || 0);
      return { content: [{ type: 'text', text: JSON.stringify({
        startDate: sd, endDate: ed,
        totalIncome: income?.total || 0,
        totalExpenses: expenses?.total || 0,
        netIncome,
      }, null, 2) }] };
    }

    case 'get_accounts_receivable': {
      const { status } = args;
      let sql = 'SELECT * FROM accounts_receivable WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (status) { sql += ' AND status = ?'; params.push(status); }
      sql += ' ORDER BY due_date ASC';
      const results = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }

    case 'get_accounts_payable': {
      const { status } = args;
      let sql = 'SELECT * FROM accounts_payable WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (status) { sql += ' AND status = ?'; params.push(status); }
      sql += ' ORDER BY due_date ASC';
      const results = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }

    case 'create_ar_invoice': {
      const { customerId, invoiceNumber, amount, dueDate, notes } = args;
      const id = 'ar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO accounts_receivable (id, tenant_id, customer_id, invoice_number, amount, amount_paid, due_date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', ?, ?, ?)`).run(id, tenantId, customerId, invoiceNumber, amount, dueDate, notes || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'create_ap_invoice': {
      const { vendorName, invoiceNumber, amount, dueDate, notes } = args;
      const id = 'ap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO accounts_payable (id, tenant_id, vendor_name, invoice_number, amount, amount_paid, due_date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', ?, ?, ?)`).run(id, tenantId, vendorName, invoiceNumber, amount, dueDate, notes || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'record_payment': {
      const { type, invoiceId, amount } = args;
      const now = Date.now();
      if (type === 'ar') {
        const inv = db.prepare('SELECT * FROM accounts_receivable WHERE id = ? AND tenant_id = ?').get(invoiceId, tenantId) as any;
        if (!inv) throw new Error('AR invoice not found');
        const newPaid = inv.amount_paid + amount;
        const newStatus = newPaid >= inv.amount ? 'paid' : 'partial';
        db.prepare('UPDATE accounts_receivable SET amount_paid = ?, status = ?, updated_at = ? WHERE id = ?').run(newPaid, newStatus, now, invoiceId);
      } else {
        const inv = db.prepare('SELECT * FROM accounts_payable WHERE id = ? AND tenant_id = ?').get(invoiceId, tenantId) as any;
        if (!inv) throw new Error('AP invoice not found');
        const newPaid = inv.amount_paid + amount;
        const newStatus = newPaid >= inv.amount ? 'paid' : 'partial';
        db.prepare('UPDATE accounts_payable SET amount_paid = ?, status = ?, updated_at = ? WHERE id = ?').run(newPaid, newStatus, now, invoiceId);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, amount, type, invoiceId }, null, 2) }] };
    }

    case 'get_tax_rates': {
      const results = db.prepare('SELECT * FROM tax_rates WHERE tenant_id = ? AND is_active = 1').all(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }

    case 'create_tax_rate': {
      const { name, rate, type } = args;
      const id = 'tax_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO tax_rates (id, tenant_id, name, rate, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, name, rate, type, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'get_budgets': {
      const results = db.prepare('SELECT * FROM budgets WHERE tenant_id = ? ORDER BY start_date DESC').all(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }

    case 'create_budget': {
      const { name, category, amount, period, startDate, endDate } = args;
      const id = 'budget_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO budgets (id, tenant_id, name, category, amount, period, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, name, category, amount, period, startDate, endDate, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'get_bank_reconciliations': {
      const results = db.prepare('SELECT * FROM bank_reconciliation WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }

    case 'create_bank_reconciliation': {
      const { accountName, statementBalance, systemBalance, notes } = args;
      const id = 'recon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      const difference = statementBalance - systemBalance;
      db.prepare(`INSERT INTO bank_reconciliation (id, tenant_id, account_name, statement_balance, system_balance, difference, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`).run(id, tenantId, accountName, statementBalance, systemBalance, difference, notes || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, difference, success: true }, null, 2) }] };
    }

    // ---- MARKETING MODULE (Phase 2) ----

    // ---- HR & PAYROLL MODULE (Phase 3) ----

    case 'list_employees': {
      const { department, status, search, limit, offset } = args;
      let sql = 'SELECT * FROM employees WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (department) { sql += ' AND department = ?'; params.push(department); }
      if (status) { sql += ' AND status = ?'; params.push(status); }
      if (search) { sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR employee_code LIKE ?)'; const s = '%' + search + '%'; params.push(s, s, s); }
      sql += ' ORDER BY created_at DESC';
      if (limit) sql += ' LIMIT ?'; params.push(limit || 50);
      if (offset) sql += ' OFFSET ?'; params.push(offset || 0);
      const employees = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(employees, null, 2) }] };
    }

    case 'get_employee': {
      const { employeeId } = args;
      const employee = db.prepare('SELECT * FROM employees WHERE id = ? AND tenant_id = ?').get(employeeId, tenantId);
      if (!employee) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Employee not found' }) }] };
      return { content: [{ type: 'text', text: JSON.stringify(employee, null, 2) }] };
    }

    case 'create_employee': {
      const { employeeCode, firstName, lastName, email, phone, position, department, managerId, hireDate, employmentType, baseSalary, currency, bankName, bankAccount, taxId, address, emergencyContact, emergencyPhone, notes } = args;
      const id = 'emp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO employees (id, tenant_id, employee_code, first_name, last_name, email, phone, position, department, manager_id, hire_date, employment_type, status, base_salary, currency, bank_name, bank_account, tax_id, address, emergency_contact, emergency_phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, employeeCode, firstName, lastName, email || null, phone || null, position || null, department || null, managerId || null, hireDate || null, employmentType || 'full_time', baseSalary || 0, currency || 'THB', bankName || null, bankAccount || null, taxId || null, address || null, emergencyContact || null, emergencyPhone || null, notes || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'update_employee': {
      const { employeeId, firstName, lastName, email, phone, position, department, managerId, status, baseSalary, currency, bankName, bankAccount, taxId, address, emergencyContact, emergencyPhone, notes } = args;
      const existing = db.prepare('SELECT * FROM employees WHERE id = ? AND tenant_id = ?').get(employeeId, tenantId);
      if (!existing) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Employee not found' }) }] };
      const now = Date.now();
      db.prepare(`UPDATE employees SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), email = COALESCE(?, email), phone = COALESCE(?, phone), position = COALESCE(?, position), department = COALESCE(?, department), manager_id = COALESCE(?, manager_id), status = COALESCE(?, status), base_salary = COALESCE(?, base_salary), currency = COALESCE(?, currency), bank_name = COALESCE(?, bank_name), bank_account = COALESCE(?, bank_account), tax_id = COALESCE(?, tax_id), address = COALESCE(?, address), emergency_contact = COALESCE(?, emergency_contact), emergency_phone = COALESCE(?, emergency_phone), notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND tenant_id = ?`).run(firstName || null, lastName || null, email || null, phone || null, position || null, department || null, managerId || null, status || null, baseSalary ?? null, currency || null, bankName || null, bankAccount || null, taxId || null, address || null, emergencyContact || null, emergencyPhone || null, notes || null, now, employeeId, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify({ id: employeeId, success: true }, null, 2) }] };
    }

    case 'clock_in': {
      const { employeeId, timestamp } = args;
      const now = timestamp || Date.now();
      const today = new Date(now).toISOString().split('T')[0];
      const existing = db.prepare('SELECT * FROM time_tracking WHERE employee_id = ? AND date = ? AND tenant_id = ?').get(employeeId, today, tenantId);
      if (existing) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Already clocked in today' }) }] };
      const id = 'tim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      db.prepare(`INSERT INTO time_tracking (id, tenant_id, employee_id, date, clock_in, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`).run(id, tenantId, employeeId, today, now, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, clockIn: now, success: true }, null, 2) }] };
    }

    case 'clock_out': {
      const { employeeId, timestamp } = args;
      const now = timestamp || Date.now();
      const today = new Date(now).toISOString().split('T')[0];
      const record = db.prepare('SELECT * FROM time_tracking WHERE employee_id = ? AND date = ? AND tenant_id = ?').get(employeeId, today, tenantId);
      if (!record) return { content: [{ type: 'text', text: JSON.stringify({ error: 'No clock-in record found for today' }) }] };
      if (record.clock_out) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Already clocked out today' }) }] };
      const totalHours = (now - record.clock_in) / (1000 * 60 * 60);
      const overtimeHours = Math.max(0, totalHours - 8);
      db.prepare(`UPDATE time_tracking SET clock_out = ?, total_hours = ?, overtime_hours = ?, updated_at = ? WHERE id = ?`).run(now, Math.round(totalHours * 100) / 100, Math.round(overtimeHours * 100) / 100, now, record.id);
      return { content: [{ type: 'text', text: JSON.stringify({ id: record.id, clockOut: now, totalHours: Math.round(totalHours * 100) / 100, overtimeHours: Math.round(overtimeHours * 100) / 100, success: true }, null, 2) }] };
    }

    case 'get_time_today': {
      const { employeeId } = args;
      const today = new Date().toISOString().split('T')[0];
      const record = db.prepare('SELECT * FROM time_tracking WHERE employee_id = ? AND date = ? AND tenant_id = ?').get(employeeId, today, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(record || { message: 'No record for today' }, null, 2) }] };
    }

    case 'list_time_records': {
      const { employeeId, dateFrom, dateTo, limit, offset } = args;
      let sql = 'SELECT * FROM time_tracking WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (employeeId) { sql += ' AND employee_id = ?'; params.push(employeeId); }
      if (dateFrom) { sql += ' AND date >= ?'; params.push(dateFrom); }
      if (dateTo) { sql += ' AND date <= ?'; params.push(dateTo); }
      sql += ' ORDER BY date DESC';
      if (limit) sql += ' LIMIT ?'; params.push(limit || 50);
      if (offset) sql += ' OFFSET ?'; params.push(offset || 0);
      const records = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(records, null, 2) }] };
    }

    case 'request_leave': {
      const { employeeId, leaveType, startDate, endDate, totalDays, reason } = args;
      const id = 'lev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO leave_requests (id, tenant_id, employee_id, leave_type, start_date, end_date, total_days, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).run(id, tenantId, employeeId, leaveType, startDate, endDate, totalDays, reason || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, status: 'pending', success: true }, null, 2) }] };
    }

    case 'approve_leave': {
      const { leaveId, status, approvedBy, notes } = args;
      const existing = db.prepare('SELECT * FROM leave_requests WHERE id = ? AND tenant_id = ?').get(leaveId, tenantId);
      if (!existing) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Leave request not found' }) }] };
      const now = Date.now();
      db.prepare(`UPDATE leave_requests SET status = ?, approved_by = ?, approved_at = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND tenant_id = ?`).run(status, approvedBy, now, notes || null, now, leaveId, tenantId);
      if (status === 'approved') {
        const year = new Date(existing.start_date).getFullYear();
        const balance = db.prepare('SELECT * FROM leave_balances WHERE tenant_id = ? AND employee_id = ? AND year = ? AND leave_type = ?').get(tenantId, existing.employee_id, year, existing.leave_type);
        if (balance) {
          db.prepare('UPDATE leave_balances SET used_days = used_days + ?, updated_at = ? WHERE id = ?').run(existing.total_days, now, balance.id);
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ id: leaveId, status, success: true }, null, 2) }] };
    }

    case 'list_leave_requests': {
      const { employeeId, status, limit, offset } = args;
      let sql = 'SELECT * FROM leave_requests WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (employeeId) { sql += ' AND employee_id = ?'; params.push(employeeId); }
      if (status) { sql += ' AND status = ?'; params.push(status); }
      sql += ' ORDER BY created_at DESC';
      if (limit) sql += ' LIMIT ?'; params.push(limit || 50);
      if (offset) sql += ' OFFSET ?'; params.push(offset || 0);
      const requests = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(requests, null, 2) }] };
    }

    case 'get_leave_balance': {
      const { employeeId, year } = args;
      const y = year || new Date().getFullYear();
      const balances = db.prepare('SELECT * FROM leave_balances WHERE tenant_id = ? AND employee_id = ? AND year = ?').all(tenantId, employeeId, y);
      if (balances.length === 0) {
        const defaultBalances = [
          { leave_type: 'annual', total_days: 12 },
          { leave_type: 'sick', total_days: 30 },
          { leave_type: 'personal', total_days: 3 },
        ];
        const now = Date.now();
        for (const b of defaultBalances) {
          const id = 'leb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          db.prepare(`INSERT INTO leave_balances (id, tenant_id, employee_id, year, leave_type, total_days, used_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`).run(id, tenantId, employeeId, y, b.leave_type, b.total_days, now, now);
        }
        const result = db.prepare('SELECT * FROM leave_balances WHERE tenant_id = ? AND employee_id = ? AND year = ?').all(tenantId, employeeId, y);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(balances, null, 2) }] };
    }

    case 'create_payroll_period': {
      const { periodName, periodType, startDate, endDate, paymentDate } = args;
      const id = 'prp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO payroll_periods (id, tenant_id, period_name, period_type, start_date, end_date, payment_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`).run(id, tenantId, periodName, periodType, startDate, endDate, paymentDate || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, status: 'draft', success: true }, null, 2) }] };
    }

    case 'process_payroll': {
      const { periodId } = args;
      const period = db.prepare('SELECT * FROM payroll_periods WHERE id = ? AND tenant_id = ?').get(periodId, tenantId);
      if (!period) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Payroll period not found' }) }] };
      const employees = db.prepare("SELECT * FROM employees WHERE tenant_id = ? AND status = 'active'").all(tenantId);
      const now = Date.now();
      let processed = 0;
      for (const emp of employees) {
        const existing = db.prepare('SELECT * FROM payroll_items WHERE period_id = ? AND employee_id = ?').get(periodId, emp.id);
        if (existing) continue;
        const itemId = 'pri_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const monthlySalary = emp.base_salary || 0;
        const socialSecurity = Math.min(monthlySalary * 0.05, 750);
        const taxDeduction = monthlySalary > 50000 ? monthlySalary * 0.1 : 0;
        const netPay = monthlySalary - socialSecurity - taxDeduction;
        db.prepare(`INSERT INTO payroll_items (id, tenant_id, period_id, employee_id, base_salary, overtime_pay, bonus, commission, allowance, deductions, tax_deduction, social_security, net_pay, payment_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?, ?, 'pending', ?, ?)`).run(itemId, tenantId, periodId, emp.id, monthlySalary, taxDeduction, socialSecurity, Math.round(netPay * 100) / 100, now, now);
        processed++;
      }
      db.prepare("UPDATE payroll_periods SET status = 'processing', updated_at = ? WHERE id = ?").run(now, periodId);
      return { content: [{ type: 'text', text: JSON.stringify({ periodId, employeesProcessed: processed, success: true }, null, 2) }] };
    }

    case 'list_payroll_periods': {
      const { limit, offset } = args;
      let sql = 'SELECT * FROM payroll_periods WHERE tenant_id = ? ORDER BY created_at DESC';
      const params: any[] = [tenantId];
      if (limit) sql += ' LIMIT ?'; params.push(limit || 50);
      if (offset) sql += ' OFFSET ?'; params.push(offset || 0);
      const periods = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(periods, null, 2) }] };
    }

    case 'list_payroll_items': {
      const { periodId, employeeId } = args;
      let sql = 'SELECT pi.*, e.first_name, e.last_name, e.department FROM payroll_items pi JOIN employees e ON pi.employee_id = e.id WHERE pi.tenant_id = ? AND pi.period_id = ?';
      const params: any[] = [tenantId, periodId];
      if (employeeId) { sql += ' AND pi.employee_id = ?'; params.push(employeeId); }
      sql += ' ORDER BY e.department, e.first_name';
      const items = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
    }

    case 'mark_payroll_paid': {
      const { periodId, paidAt } = args;
      const now = paidAt || Date.now();
      db.prepare("UPDATE payroll_items SET payment_status = 'paid', paid_at = ?, updated_at = ? WHERE period_id = ? AND tenant_id = ?").run(now, now, periodId, tenantId);
      db.prepare("UPDATE payroll_periods SET status = 'paid', updated_at = ? WHERE id = ?").run(now, periodId);
      return { content: [{ type: 'text', text: JSON.stringify({ periodId, status: 'paid', paidAt: now, success: true }, null, 2) }] };
    }

    case 'create_performance_review': {
      const { employeeId, reviewerId, reviewPeriod, rating, goalsAchieved, strengths, areasForImprovement, overallFeedback } = args;
      const id = 'prv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO performance_reviews (id, tenant_id, employee_id, reviewer_id, review_period, review_date, rating, goals_achieved, strengths, areas_for_improvement, overall_feedback, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`).run(id, tenantId, employeeId, reviewerId, reviewPeriod, now, rating || null, goalsAchieved || null, strengths || null, areasForImprovement || null, overallFeedback || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, status: 'draft', success: true }, null, 2) }] };
    }

    case 'list_performance_reviews': {
      const { employeeId, reviewerId, limit, offset } = args;
      let sql = 'SELECT pr.*, e.first_name, e.last_name, e.department FROM performance_reviews pr JOIN employees e ON pr.employee_id = e.id WHERE pr.tenant_id = ?';
      const params: any[] = [tenantId];
      if (employeeId) { sql += ' AND pr.employee_id = ?'; params.push(employeeId); }
      if (reviewerId) { sql += ' AND pr.reviewer_id = ?'; params.push(reviewerId); }
      sql += ' ORDER BY pr.created_at DESC';
      if (limit) sql += ' LIMIT ?'; params.push(limit || 50);
      if (offset) sql += ' OFFSET ?'; params.push(offset || 0);
      const reviews = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(reviews, null, 2) }] };
    }

    case 'update_performance_review': {
      const { reviewId, status, rating, overallFeedback } = args;
      const existing = db.prepare('SELECT * FROM performance_reviews WHERE id = ? AND tenant_id = ?').get(reviewId, tenantId);
      if (!existing) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Review not found' }) }] };
      const now = Date.now();
      db.prepare(`UPDATE performance_reviews SET status = ?, rating = COALESCE(?, rating), overall_feedback = COALESCE(?, overall_feedback), updated_at = ? WHERE id = ? AND tenant_id = ?`).run(status, rating ?? null, overallFeedback || null, now, reviewId, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify({ id: reviewId, status, success: true }, null, 2) }] };
    }


    case 'list_campaigns': {
      const { status, type, limit, offset } = args;
      let sql = 'SELECT * FROM marketing_campaigns WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (status) { sql += ' AND status = ?'; params.push(status); }
      if (type) { sql += ' AND type = ?'; params.push(type); }
      sql += ' ORDER BY created_at DESC';
      if (limit) sql += ' LIMIT ?'; params.push(limit || 50);
      if (offset) sql += ' OFFSET ?'; params.push(offset || 0);
      const campaigns = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(campaigns, null, 2) }] };
    }

    case 'create_campaign': {
      const { name, description, type, budget, targetAudience, startDate, endDate } = args;
      const id = 'cmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO marketing_campaigns (id, tenant_id, name, description, type, status, budget, target_audience, start_date, end_date, metrics, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, '{}', ?, ?)`).run(id, tenantId, name, description || null, type, budget || 0, targetAudience || null, startDate || null, endDate || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'update_campaign': {
      const { campaignId, name: cName, description: cDesc, status: cStatus, budget: cBudget } = args;
      const existing = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND tenant_id = ?').get(campaignId, tenantId);
      if (!existing) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Campaign not found' }) }] };
      const now = Date.now();
      db.prepare(`UPDATE marketing_campaigns SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status), budget = COALESCE(?, budget), updated_at = ? WHERE id = ? AND tenant_id = ?`).run(cName || null, cDesc || null, cStatus || null, cBudget ?? null, now, campaignId, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify({ id: campaignId, success: true }, null, 2) }] };
    }

    case 'get_campaign_metrics': {
      const { campaignId } = args;
      const campaign = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND tenant_id = ?').get(campaignId, tenantId) as any;
      if (!campaign) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Campaign not found' }) }] };
      const items = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent FROM marketing_campaign_items WHERE campaign_id = ?").get(campaignId) as any;
      return { content: [{ type: 'text', text: JSON.stringify({
        campaign: { id: campaign.id, name: campaign.name, status: campaign.status, type: campaign.type },
        items: { total: items.total, sent: items.sent },
      }, null, 2) }] };
    }

    case 'list_email_templates': {
      const { category } = args;
      let sql = 'SELECT * FROM marketing_email_templates WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (category) { sql += ' AND category = ?'; params.push(category); }
      sql += ' ORDER BY created_at DESC';
      const templates = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(templates, null, 2) }] };
    }

    case 'create_email_template': {
      const { name, subject, bodyHtml, bodyText, category } = args;
      const id = 'emt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO marketing_email_templates (id, tenant_id, name, subject, body_html, body_text, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, name, subject, bodyHtml || null, bodyText || null, category || 'general', now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'list_email_lists': {
      const lists = db.prepare('SELECT * FROM marketing_email_lists WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(lists, null, 2) }] };
    }

    case 'create_email_list': {
      const { name, description } = args;
      const id = 'eml_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO marketing_email_lists (id, tenant_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, tenantId, name, description || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'add_subscriber': {
      const { listId, email, name: subName } = args;
      const existing = db.prepare('SELECT * FROM marketing_email_subscribers WHERE tenant_id = ? AND list_id = ? AND email = ?').get(tenantId, listId, email);
      if (existing) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Subscriber already exists in this list' }) }] };
      const id = 'ems_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO marketing_email_subscribers (id, tenant_id, list_id, email, name, status, subscribed_at, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`).run(id, tenantId, listId, email, subName || null, now, now);
      db.prepare('UPDATE marketing_email_lists SET subscriber_count = subscriber_count + 1, updated_at = ? WHERE id = ? AND tenant_id = ?').run(now, listId, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'list_seo_keywords': {
      const { productId } = args;
      let sql = 'SELECT * FROM marketing_seo_keywords WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (productId) { sql += ' AND product_id = ?'; params.push(productId); }
      sql += ' ORDER BY created_at DESC';
      const keywords = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(keywords, null, 2) }] };
    }

    case 'create_seo_keyword': {
      const { keyword, productId, targetUrl, targetRanking, searchVolume } = args;
      const existing = db.prepare('SELECT * FROM marketing_seo_keywords WHERE tenant_id = ? AND keyword = ?').get(tenantId, keyword);
      if (existing) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Keyword already tracked' }) }] };
      const id = 'seo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO marketing_seo_keywords (id, tenant_id, keyword, product_id, target_url, target_ranking, search_volume, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, keyword, productId || null, targetUrl || null, targetRanking || 1, searchVolume || 0, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'list_social_accounts': {
      const accounts = db.prepare('SELECT id, tenant_id, platform, label, account_id, is_active, created_at, updated_at FROM marketing_social_accounts WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(accounts, null, 2) }] };
    }

    case 'create_social_account': {
      const { platform, label, accountId } = args;
      const id = 'soc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO marketing_social_accounts (id, tenant_id, platform, label, account_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).run(id, tenantId, platform, label, accountId || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true }, null, 2) }] };
    }

    case 'schedule_social_post': {
      const { accountId, content, scheduledAt, mediaUrls } = args;
      const id = 'sop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO marketing_social_posts (id, tenant_id, account_id, content, media_urls, scheduled_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`).run(id, tenantId, accountId, content, JSON.stringify(mediaUrls || []), scheduledAt, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, success: true, status: 'scheduled' }, null, 2) }] };
    }

    case 'list_discounts': {
      const { isActive } = args;
      let sql = 'SELECT * FROM marketing_discounts WHERE tenant_id = ?';
      const params: any[] = [tenantId];
      if (isActive !== undefined) { sql += ' AND is_active = ?'; params.push(isActive ? 1 : 0); }
      sql += ' ORDER BY created_at DESC';
      const discounts = db.prepare(sql).all(...params);
      return { content: [{ type: 'text', text: JSON.stringify(discounts, null, 2) }] };
    }

    case 'create_discount': {
      const { code, type, value, minOrderAmount, maxDiscountAmount, usageLimit, startDate, endDate, description } = args;
      const existing = db.prepare('SELECT * FROM marketing_discounts WHERE tenant_id = ? AND code = ?').get(tenantId, code);
      if (existing) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Discount code already exists' }) }] };
      const id = 'dsc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = Date.now();
      db.prepare(`INSERT INTO marketing_discounts (id, tenant_id, code, type, value, min_order_amount, max_discount_amount, usage_limit, start_date, end_date, is_active, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).run(id, tenantId, code.toUpperCase(), type, value, minOrderAmount || 0, maxDiscountAmount || null, usageLimit || null, startDate || null, endDate || null, description || null, now, now);
      return { content: [{ type: 'text', text: JSON.stringify({ id, code: code.toUpperCase(), success: true }, null, 2) }] };
    }

    case 'validate_discount': {
      const { code, orderAmount, customerId } = args;
      const discount = db.prepare('SELECT * FROM marketing_discounts WHERE tenant_id = ? AND code = ? AND is_active = 1').get(tenantId, code.toUpperCase()) as any;
      if (!discount) return { content: [{ type: 'text', text: JSON.stringify({ valid: false, error: 'Invalid or inactive discount code' }) }] };
      const now = Date.now();
      if (discount.start_date && now < discount.start_date) return { content: [{ type: 'text', text: JSON.stringify({ valid: false, error: 'Discount not yet active' }) }] };
      if (discount.end_date && now > discount.end_date) return { content: [{ type: 'text', text: JSON.stringify({ valid: false, error: 'Discount has expired' }) }] };
      if (discount.usage_limit && discount.usage_count >= discount.usage_limit) return { content: [{ type: 'text', text: JSON.stringify({ valid: false, error: 'Discount usage limit reached' }) }] };
      if (orderAmount < discount.min_order_amount) return { content: [{ type: 'text', text: JSON.stringify({ valid: false, error: 'Minimum order amount not met', minAmount: discount.min_order_amount }) }] };
      if (customerId && discount.per_customer_limit > 0) {
        const usage = db.prepare('SELECT COUNT(*) as cnt FROM marketing_discount_redemptions WHERE discount_id = ? AND customer_id = ?').get(discount.id, customerId) as any;
        if (usage.cnt >= discount.per_customer_limit) return { content: [{ type: 'text', text: JSON.stringify({ valid: false, error: 'Customer usage limit reached' }) }] };
      }
      let discountAmount = 0;
      if (discount.type === 'percentage') {
        discountAmount = orderAmount * (discount.value / 100);
        if (discount.max_discount_amount) discountAmount = Math.min(discountAmount, discount.max_discount_amount);
      } else if (discount.type === 'fixed_amount') {
        discountAmount = discount.value;
      }
      return { content: [{ type: 'text', text: JSON.stringify({
        valid: true,
        discount: { id: discount.id, code: discount.code, type: discount.type, value: discount.value },
        discountAmount: Math.round(discountAmount * 100) / 100,
        finalAmount: Math.round((orderAmount - discountAmount) * 100) / 100,
      }, null, 2) }] };
    }

    default:
      // Look up tool in service registry and forward to appropriate service
      
    // ---- AI AGENT MODULES (Phase 2) ----

    case 'ai_chat': {
      const { sessionId, message, customerId, language } = args;
      let customerContext = {};
      if (customerId) {
        const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND tenant_id = ?').get(customerId, tenantId);
        if (customer) customerContext = customer;
      }
      const recentOrders = db.prepare('SELECT id, status, total, created_at FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5').all(tenantId);
      const kbArticles = db.prepare('SELECT title, content FROM documents WHERE collection_id IN (SELECT id FROM collections WHERE tenant_id = ?) ORDER BY updated_at DESC LIMIT 3').all(tenantId);
      return {
        content: [{ type: 'text', text: JSON.stringify({
          sessionId: sessionId || crypto.randomUUID(),
          reply: "I understand you need help. Let me look into that for you.",
          context: {
            customer: customerContext,
            recentOrders,
            kbArticles: kbArticles.map(function(a: any) { return { title: a.title, snippet: a.content ? a.content.slice(0, 200) : null }; }),
          },
          requiresHuman: false,
        }, null, 2) }],
      };
    }

    case 'ai_generate_product_description': {
      const { productId, style, language, keywords } = args;
      const s = style || 'standard';
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(productId, tenantId);
      if (!product) throw new Error('Product not found');
      const name = product.name || '';
      const desc = product.description || '';
      const tags = product.tags ? JSON.parse(product.tags) : [];
      var allKeywords = [];
      var kwSet: any = {};
      if (keywords) { for (var i = 0; i < keywords.length; i++) { if (!kwSet[keywords[i]]) { kwSet[keywords[i]] = true; allKeywords.push(keywords[i]); } } }
      for (var i = 0; i < tags.length; i++) { if (!kwSet[tags[i]]) { kwSet[tags[i]] = true; allKeywords.push(tags[i]); } }
      var nameWords = name.split(' ');
      for (var i = 0; i < nameWords.length; i++) { if (nameWords[i] && !kwSet[nameWords[i]]) { kwSet[nameWords[i]] = true; allKeywords.push(nameWords[i]); } }
      var description = '';
      if (s === 'seo') {
        description = name + '. ' + desc + ' Keywords: ' + allKeywords.join(', ') + '. Perfect for your needs.';
      } else if (s === 'marketing') {
        description = '**' + name + '**\n\n' + desc + '\n\nWhy choose this?\nHigh quality\nBest value\nFast shipping';
      } else if (s === 'short') {
        description = name + ' - ' + (desc ? desc.slice(0, 100) : 'Quality product');
      } else {
        description = '# ' + name + '\n\n' + (desc || 'No description available.') + '\n\n**Tags:** ' + allKeywords.join(', ');
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({
          productId: productId,
          style: s,
          language: language || 'en',
          description: description,
          keywords: allKeywords,
          wordCount: description.split(/\s+/).length,
        }, null, 2) }],
      };
    }

    case 'ai_forecast_demand': {
      const { productId, categoryId, period, method } = args;
      const p = period || '30d';
      const m = method || 'moving_average';
      const days = p === '7d' ? 7 : p === '90d' ? 90 : 30;
      const since = (Date.now() - days * 86400000) / 1000;
      var products = [];
      if (productId) {
        var prod = db.prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?').get(productId, tenantId);
        if (prod) products = [prod];
      } else if (categoryId) {
        products = db.prepare('SELECT * FROM products WHERE category_id = ? AND tenant_id = ?').all(categoryId, tenantId);
      } else {
        products = db.prepare('SELECT * FROM products WHERE tenant_id = ?').all(tenantId);
      }
      var forecasts = [];
      for (var pi = 0; pi < products.length && pi < 20; pi++) {
        var product = products[pi];
        var orderItems = db.prepare('SELECT oi.quantity FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = ? AND o.tenant_id = ? AND o.created_at >= ?').all(product.id, tenantId, since);
        var totalSold = 0;
        for (var oi = 0; oi < orderItems.length; oi++) { totalSold += (orderItems[oi].quantity || 0); }
        var avgDaily = totalSold / Math.max(days, 1);
        var forecast = 0;
        if (m === 'moving_average') {
          forecast = Math.round(avgDaily * days * 1.1);
        } else if (m === 'trend') {
          var mid = Math.floor(orderItems.length / 2);
          var recent = 0; for (var ri = mid; ri < orderItems.length; ri++) { recent += (orderItems[ri].quantity || 0); }
          var older = 0; for (var oi2 = 0; oi2 < mid; oi2++) { older += (orderItems[oi2].quantity || 0); }
          var trend = recent > older ? 1.2 : 0.9;
          forecast = Math.round(avgDaily * days * trend);
        } else {
          forecast = Math.round(avgDaily * days);
        }
        forecasts.push({
          productId: product.id,
          productName: product.name,
          currentStock: product.quantity || 0,
          avgDailySales: Math.round(avgDaily * 10) / 10,
          forecastDemand: forecast,
          daysAnalyzed: days,
          method: m,
          confidence: orderItems.length > 10 ? 'high' : orderItems.length > 3 ? 'medium' : 'low',
          reorderRecommended: forecast > (product.quantity || 0),
        });
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({
          period: p,
          method: m,
          products: forecasts,
          summary: {
            total: forecasts.length,
            needsReorder: forecasts.filter(function(f) { return f.reorderRecommended; }).length,
            avgConfidence: 'medium',
          },
        }, null, 2) }],
      };
    }

    case 'ai_detect_fraud': {
      const { orderId, days, threshold } = args;
      const d = days || 30;
      const t = threshold || 0.7;
      const since = (Date.now() - d * 86400000) / 1000;
      var orders = [];
      if (orderId) {
        var o = db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').get(orderId, tenantId);
        if (o) orders = [o];
      } else {
        orders = db.prepare('SELECT * FROM orders WHERE tenant_id = ? AND created_at >= ?').all(tenantId, since);
      }
      var flags = [];
      for (var oi = 0; oi < orders.length && oi < 50; oi++) {
        var order = orders[oi];
        var riskScore = 0;
        var reasons = [];
        if (order.total > 10000) { riskScore += 0.2; reasons.push('High value order'); }
        var recentCount = db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE customer_id = ? AND tenant_id = ? AND created_at >= ?').get(order.customer_id, tenantId, since);
        if (recentCount && recentCount.cnt > 5) { riskScore += 0.3; reasons.push('Multiple recent orders'); }
        var customerOrders = db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE customer_id = ? AND tenant_id = ?').get(order.customer_id, tenantId);
        if (!customerOrders || customerOrders.cnt <= 1) { riskScore += 0.15; reasons.push('New customer'); }
        var items = db.prepare('SELECT oi.*, p.price FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?').all(order.id);
        for (var ii = 0; ii < items.length; ii++) {
          if (items[ii].unit_price > items[ii].price * 3) { riskScore += 0.2; reasons.push('Price anomaly'); break; }
        }
        if (riskScore >= t) {
          flags.push({
            orderId: order.id,
            orderNumber: order.order_number,
            total: order.total,
            riskScore: Math.round(riskScore * 100) / 100,
            riskLevel: riskScore >= 0.9 ? 'critical' : riskScore >= 0.8 ? 'high' : 'medium',
            reasons: reasons,
            customerId: order.customer_id,
            createdAt: order.created_at,
          });
        }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({
          daysAnalyzed: d,
          threshold: t,
          totalOrders: orders.length,
          flagsFound: flags.length,
          flags: flags,
          summary: flags.length > 0
            ? flags.length + ' suspicious order(s) detected. Review recommended.'
            : 'No suspicious orders detected.',
        }, null, 2) }],
      };
    }

    case 'ai_analyze_image': {
      const { imageUrl, analysis, productId } = args;
      var a = analysis || 'all';
      var isBase64 = imageUrl.startsWith('data:') || /^[A-Za-z0-9+/=]+$/.test(imageUrl.slice(0, 100));
      var result: any = {
        imageType: isBase64 ? 'base64' : 'url',
        analysis: a,
        labels: [],
        detectedText: null,
        quality: null,
        suggestedCategory: null,
      };
      if (a === 'labels' || a === 'all') {
        result.labels = ['product', 'item', 'merchandise'];
      }
      if (a === 'text' || a === 'all') {
        result.detectedText = null;
      }
      if (a === 'quality' || a === 'all') {
        result.quality = { score: 0.85, issues: [], recommendation: 'Image looks good' };
      }
      if (a === 'category' || a === 'all') {
        result.suggestedCategory = 'Uncategorized';
      }
      if (productId) {
        result.productId = productId;
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    // ---- AI PROVIDER SELECTION ----

    case 'list_ai_providers': {
      const { tenantId } = args;
      const providers = db.prepare('SELECT id, name, provider, api_url, model, max_tokens, temperature, is_active, is_tenant_default, created_at, updated_at FROM ai_providers WHERE tenant_id = ? ORDER BY created_at ASC').all(tenantId);
      return { content: [{ type: 'text', text: JSON.stringify(providers, null, 2) }] };
    }

    case 'get_active_ai_provider': {
      const { tenantId } = args;
      const provider = db.prepare('SELECT id, name, provider, api_url, model, max_tokens, temperature, is_active, is_tenant_default, created_at, updated_at FROM ai_providers WHERE tenant_id = ? AND is_active = 1').get(tenantId);
      if (!provider) return { content: [{ type: 'text', text: JSON.stringify({ error: 'No active provider found' }) }] };
      return { content: [{ type: 'text', text: JSON.stringify(provider, null, 2) }] };
    }

    case 'set_active_ai_provider': {
      const { tenantId, providerId } = args;
      const existing = db.prepare('SELECT * FROM ai_providers WHERE id = ? AND tenant_id = ?').get(providerId, tenantId);
      if (!existing) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Provider not found' }) }] };
      const now = Date.now();
      db.prepare('UPDATE ai_providers SET is_active = 0, updated_at = ? WHERE tenant_id = ?').run(now, tenantId);
      db.prepare('UPDATE ai_providers SET is_active = 1, is_tenant_default = 1, updated_at = ? WHERE id = ? AND tenant_id = ?').run(now, providerId, tenantId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, providerId }) }] };
    }

    case 'test_ai_provider': {
      const { tenantId, providerId } = args;
      const provider = db.prepare('SELECT * FROM ai_providers WHERE id = ? AND tenant_id = ?').get(providerId, tenantId) as any;
      if (!provider) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Provider not found' }) }] };
      if (!provider.api_key) return { content: [{ type: 'text', text: JSON.stringify({ error: 'API key is not set' }) }] };
      const apiUrl = provider.api_url || (provider.provider === 'openai' ? 'https://api.openai.com/v1' : provider.provider === 'deepseek' ? 'https://api.deepseek.com' : provider.provider === 'anthropic' ? 'https://api.anthropic.com/v1' : null);
      if (!apiUrl) return { content: [{ type: 'text', text: JSON.stringify({ error: 'API URL not configured' }) }] };
      try {
        const baseUrl = apiUrl.replace(/\/+$/, '');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(baseUrl + '/models', {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + provider.api_key },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Connection successful' }) }] };
        } else {
          const text = await response.text();
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, message: 'Connection failed: ' + text.slice(0, 200) }) }] };
        }
      } catch (err: any) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, message: 'Connection error: ' + err.message }) }] };
      }
    }

    case 'upsert_ai_provider': {
      const { tenantId, providerId, name, provider, apiKey, apiUrl, model, maxTokens, temperature } = args;
      const now = Date.now();
      if (providerId) {
        const existing = db.prepare('SELECT * FROM ai_providers WHERE id = ? AND tenant_id = ?').get(providerId, tenantId);
        if (!existing) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Provider not found' }) }] };
        db.prepare('UPDATE ai_providers SET name = COALESCE(?, name), provider = COALESCE(?, provider), api_key = COALESCE(?, api_key), api_url = COALESCE(?, api_url), model = COALESCE(?, model), max_tokens = COALESCE(?, max_tokens), temperature = COALESCE(?, temperature), updated_at = ? WHERE id = ? AND tenant_id = ?').run(name || null, provider || null, apiKey || null, apiUrl || null, model || null, maxTokens ?? null, temperature ?? null, now, providerId, tenantId);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, providerId }) }] };
      } else {
        const id = 'aip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        db.prepare('INSERT INTO ai_providers (id, tenant_id, name, provider, api_key, api_url, model, max_tokens, temperature, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, tenantId, name, provider, apiKey || '', apiUrl || null, model || 'gpt-4o', maxTokens || 4096, temperature ?? 0.3, '{}', now, now);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, providerId: id }) }] };
      }
    }

      const registry = new ServiceRegistry();
      const allServices = registry.listServices();
      let foundService: any = null;
      let foundTool = false;

      for (const [svcName, svc] of Object.entries(allServices)) {
        if (svc.tools?.includes(name)) {
          foundService = svc;
          foundTool = true;
          break;
        }
      }

      if (!foundTool) {
        // Case-insensitive fallback
        for (const [svcName, svc] of Object.entries(allServices)) {
          if (svc.tools) {
            for (const t of svc.tools!) {
              if (t.toLowerCase() === name.toLowerCase()) {
                foundService = svc;
                foundTool = true;
                break;
              }
            }
          }
          if (foundTool) break;
        }
      }

      if (!foundService || !foundService.url) {
        throw new Error(`Unknown tool: ${name}`);
      }

      // Forward the tool call to the service's MCP endpoint
      const mcpPath = foundService.mcpEndpoint || "/mcp";
      const mcpUrl = new URL(mcpPath, foundService.url).toString();
      try {
        const response = await fetch(mcpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: name, args: _args }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `Service returned ${response.status}`);
        }
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        throw new Error(`Error forwarding tool '${name}' to '${foundService.name}': ${err.message}`);
      }
  }
}
