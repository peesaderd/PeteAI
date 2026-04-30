// ============================================================
// Database Module (SQLite with better-sqlite3)
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.ERP_DB_PATH || path.join(process.cwd(), 'data', 'erp-core.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);
  return db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    -- Tenants
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, email)
    );

    -- Categories
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES categories(id),
      created_at INTEGER NOT NULL
    );

    -- Products
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      sku TEXT,
      price REAL NOT NULL DEFAULT 0,
      cost_price REAL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      category_id TEXT REFERENCES categories(id),
      tags TEXT DEFAULT '[]',
      weight REAL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Orders
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      order_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      shipping_cost REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      channel TEXT NOT NULL DEFAULT 'direct',
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Order Items
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL
    );

    -- Customers
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      total_spent REAL NOT NULL DEFAULT 0,
      order_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Inventory Transactions
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      product_id TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL
    );

    -- Billing Plans
    CREATE TABLE IF NOT EXISTS billing_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price_monthly REAL NOT NULL DEFAULT 0,
      price_yearly REAL NOT NULL DEFAULT 0,
      features TEXT,
      max_users INTEGER NOT NULL DEFAULT 1,
      max_products INTEGER NOT NULL DEFAULT 10,
      max_storage_mb INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Subscriptions
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      plan_id TEXT NOT NULL REFERENCES billing_plans(id),
      status TEXT NOT NULL DEFAULT 'active',
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      current_period_start INTEGER NOT NULL,
      current_period_end INTEGER NOT NULL,
      trial_end INTEGER,
      canceled_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Invoices
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      subscription_id TEXT REFERENCES subscriptions(id),
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'draft',
      paid_at INTEGER,
      due_date INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Invoice Lines
    CREATE TABLE IF NOT EXISTS invoice_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1
    );

    -- ============================================================
    -- PRODUCTION PLANNING
    -- ============================================================

    -- Bill of Materials (BOM)
    CREATE TABLE IF NOT EXISTS boms (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      name TEXT NOT NULL,
      description TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      total_cost REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- BOM Components (raw materials / sub-assemblies)
    CREATE TABLE IF NOT EXISTS bom_components (
      id TEXT PRIMARY KEY,
      bom_id TEXT NOT NULL REFERENCES boms(id),
      component_product_id TEXT NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL DEFAULT 1,
      unit_cost REAL NOT NULL DEFAULT 0,
      wastage_percent REAL NOT NULL DEFAULT 0,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- Production Orders (enhanced)
    CREATE TABLE IF NOT EXISTS production_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      bom_id TEXT REFERENCES boms(id),
      order_number TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      quantity_completed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      priority TEXT NOT NULL DEFAULT 'normal',
      due_date INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Production Order Material Usage
    CREATE TABLE IF NOT EXISTS production_material_usage (
      id TEXT PRIMARY KEY,
      production_order_id TEXT NOT NULL REFERENCES production_orders(id),
      component_product_id TEXT NOT NULL REFERENCES products(id),
      quantity_planned REAL NOT NULL,
      quantity_used REAL NOT NULL DEFAULT 0,
      quantity_wasted REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- Reorder Rules
    CREATE TABLE IF NOT EXISTS reorder_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      min_stock_level REAL NOT NULL DEFAULT 0,
      max_stock_level REAL NOT NULL DEFAULT 0,
      reorder_quantity REAL NOT NULL DEFAULT 0,
      lead_time_days INTEGER NOT NULL DEFAULT 7,
      forecast_daily_demand REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_triggered_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- ============================================================
    -- MULTI-CHANNEL CONNECTORS
    -- ============================================================

    -- Channel Connections (credentials per channel)
    CREATE TABLE IF NOT EXISTS channel_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      channel_type TEXT NOT NULL,
      label TEXT NOT NULL,
      credentials TEXT,
      config TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_sync_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Channel Listings (mapping between channel products and local products)
    CREATE TABLE IF NOT EXISTS channel_listings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      channel_connection_id TEXT NOT NULL REFERENCES channel_connections(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      channel_listing_id TEXT NOT NULL,
      channel_sku TEXT,
      channel_price REAL,
      channel_quantity INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      listing_data TEXT,
      last_sync_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Channel Orders (synced orders from channels)
    CREATE TABLE IF NOT EXISTS channel_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      channel_connection_id TEXT NOT NULL REFERENCES channel_connections(id),
      channel_order_id TEXT NOT NULL,
      order_id TEXT REFERENCES orders(id),
      channel_status TEXT NOT NULL,
      raw_data TEXT,
      synced_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_boms_tenant ON boms(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_bom_components_bom ON bom_components(bom_id);
    CREATE INDEX IF NOT EXISTS idx_production_orders_tenant ON production_orders(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_reorder_rules_tenant ON reorder_rules(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_channel_connections_tenant ON channel_connections(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_channel_listings_tenant ON channel_listings(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_channel_listings_connection ON channel_listings(channel_connection_id);
    CREATE INDEX IF NOT EXISTS idx_channel_orders_tenant ON channel_orders(tenant_id);

    -- ============================================================
    -- ADVANCED REPORTING
    -- ============================================================

    CREATE TABLE IF NOT EXISTS saved_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      schedule TEXT,
      recipients TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant ON saved_reports(tenant_id);

    -- ============================================================
    -- NOTIFICATIONS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      condition_config TEXT,
      channel_ids TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      rule_id TEXT REFERENCES notification_rules(id),
      event_type TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      message TEXT,
      sent_at INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notif_channels_tenant ON notification_channels(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_notif_rules_tenant ON notification_rules(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_notif_logs_tenant ON notification_logs(tenant_id);

    -- ============================================================
    -- RBAC & TEAM MANAGEMENT
    -- ============================================================

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      permissions TEXT NOT NULL DEFAULT '[]',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, name)
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role_id TEXT REFERENCES roles(id),
      created_at INTEGER NOT NULL,
      UNIQUE(team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_teams_tenant ON teams(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

    -- ============================================================
    -- FINANCE & ACCOUNTING
    -- ============================================================

    CREATE TABLE IF NOT EXISTS finance_transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      description TEXT,
      reference_type TEXT,
      reference_id TEXT,
      transaction_date INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions(transaction_date);

    CREATE INDEX IF NOT EXISTS idx_finance_transactions_tenant ON finance_transactions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_finance_transactions_type ON finance_transactions(type);
  `);
}
