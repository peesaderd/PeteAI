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

    -- Chart of Accounts (ผังบัญชี)
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK("type" IN ('asset','liability','equity','income','expense')),
      subtype TEXT,
      parent_id TEXT REFERENCES chart_of_accounts(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, code)
    );

    -- Finance Transactions (enhanced)
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      type TEXT NOT NULL CHECK("type" IN ('income','expense','transfer','ar','ap')),
      category TEXT NOT NULL DEFAULT 'general',
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      description TEXT,
      account_id TEXT REFERENCES chart_of_accounts(id),
      reference_type TEXT,
      reference_id TEXT,
      transaction_date INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Accounts Receivable
    CREATE TABLE IF NOT EXISTS accounts_receivable (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      customer_id TEXT REFERENCES customers(id),
      invoice_number TEXT NOT NULL,
      amount REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      due_date INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','overdue','written_off')),
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Accounts Payable
    CREATE TABLE IF NOT EXISTS accounts_payable (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      vendor_name TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      amount REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      due_date INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','overdue','written_off')),
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Bank Reconciliation
    CREATE TABLE IF NOT EXISTS bank_reconciliation (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      account_name TEXT NOT NULL,
      statement_balance REAL NOT NULL,
      system_balance REAL NOT NULL,
      difference REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','reconciled')),
      reconciled_at INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Tax Rates
    CREATE TABLE IF NOT EXISTS tax_rates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      rate REAL NOT NULL,
      type TEXT NOT NULL CHECK("type" IN ('vat','sales_tax','gst','other')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Tax Transactions
    CREATE TABLE IF NOT EXISTS tax_transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      tax_rate_id TEXT REFERENCES tax_rates(id),
      transaction_id TEXT REFERENCES finance_transactions(id),
      taxable_amount REAL NOT NULL,
      tax_amount REAL NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Budgets
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      period TEXT NOT NULL CHECK(period IN ('monthly','quarterly','yearly')),
      start_date INTEGER NOT NULL,
      end_date INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_finance_transactions_tenant ON finance_transactions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_finance_transactions_type ON finance_transactions(type);
    CREATE INDEX IF NOT EXISTS idx_coa_tenant ON chart_of_accounts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_ar_tenant ON accounts_receivable(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_ap_tenant ON accounts_payable(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_bank_recon_tenant ON bank_reconciliation(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tax_rates_tenant ON tax_rates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tax_trans_tenant ON tax_transactions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_tenant ON budgets(tenant_id);

    -- ============================================================
    -- PROCUREMENT & SUPPLY CHAIN
    -- ============================================================

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      contact_person TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      tax_id TEXT,
      payment_terms TEXT DEFAULT 'net30',
      lead_time_days INTEGER DEFAULT 7,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','blacklisted')),
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, code)
    );

    CREATE TABLE IF NOT EXISTS supplier_products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      supplier_sku TEXT,
      unit_cost REAL NOT NULL,
      moq INTEGER DEFAULT 1,
      lead_time_days INTEGER,
      is_preferred INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, supplier_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      po_number TEXT NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','sent','confirmed','partially_received','received','cancelled')),
      order_date INTEGER NOT NULL,
      expected_date INTEGER,
      received_date INTEGER,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      shipping_cost REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      notes TEXT,
      shipping_address TEXT,
      created_by TEXT,
      approved_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, po_number)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      po_id TEXT NOT NULL REFERENCES purchase_orders(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity_ordered REAL NOT NULL,
      quantity_received REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warehouse_locations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'warehouse' CHECK("type" IN ('warehouse','store','storage','returns','transit')),
      address TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, code)
    );

    CREATE TABLE IF NOT EXISTS warehouse_bins (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      warehouse_id TEXT NOT NULL REFERENCES warehouse_locations(id),
      code TEXT NOT NULL,
      zone TEXT,
      max_capacity REAL,
      current_usage REAL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, warehouse_id, code)
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      from_location_id TEXT REFERENCES warehouse_locations(id),
      to_location_id TEXT REFERENCES warehouse_locations(id),
      from_bin_id TEXT REFERENCES warehouse_bins(id),
      to_bin_id TEXT REFERENCES warehouse_bins(id),
      quantity REAL NOT NULL,
      type TEXT NOT NULL CHECK("type" IN ('transfer','receipt','adjustment','issue','return')),
      reference_type TEXT,
      reference_id TEXT,
      notes TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drop_ship_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      order_id TEXT NOT NULL REFERENCES orders(id),
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','confirmed','shipped','delivered','cancelled')),
      customer_name TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      shipping_method TEXT,
      tracking_number TEXT,
      estimated_delivery INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shipping_tracking (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      reference_type TEXT NOT NULL CHECK(reference_type IN ('purchase_order','sales_order','drop_ship')),
      reference_id TEXT NOT NULL,
      carrier TEXT,
      tracking_number TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','picked_up','in_transit','out_for_delivery','delivered','exception')),
      estimated_delivery INTEGER,
      actual_delivery INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Indexes for Procurement & Supply Chain
    CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_products_tenant ON supplier_products(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON supplier_products(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_po_tenant ON purchase_orders(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
    CREATE INDEX IF NOT EXISTS idx_warehouse_tenant ON warehouse_locations(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_warehouse_bins_warehouse ON warehouse_bins(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_inv_movements_tenant ON inventory_movements(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_inv_movements_product ON inventory_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_drop_ship_tenant ON drop_ship_orders(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_drop_ship_order ON drop_ship_orders(order_id);
    CREATE INDEX IF NOT EXISTS idx_shipping_tracking_ref ON shipping_tracking(reference_type, reference_id);

    -- ============================================================
    -- AI PROVIDER SELECTION
    -- ============================================================

    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('openai','deepseek','anthropic','ollama','openhands','custom')),
      api_key TEXT NOT NULL DEFAULT '',
      api_url TEXT,
      model TEXT NOT NULL DEFAULT 'gpt-4o',
      max_tokens INTEGER NOT NULL DEFAULT 4096,
      temperature REAL NOT NULL DEFAULT 0.3,
      is_active INTEGER NOT NULL DEFAULT 0,
      is_tenant_default INTEGER NOT NULL DEFAULT 0,
      config TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_ai_providers_tenant ON ai_providers(tenant_id);
    -- ============================================================
    -- LLM PROVIDERS (Settings)
    -- ============================================================

    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('openai','anthropic','deepseek','ollama','openrouter')),
      endpoint TEXT NOT NULL DEFAULT '',
      api_key_encrypted TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_llm_providers_tenant ON llm_providers(tenant_id);


    -- ============================================================
    -- MARKETING MODULE
    -- ============================================================

    -- Campaigns
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL CHECK(type IN ('email','social','seo','discount','multi')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','paused','completed','cancelled')),
      budget REAL DEFAULT 0,
      spent REAL DEFAULT 0,
      target_audience TEXT,
      start_date INTEGER,
      end_date INTEGER,
      channel_config TEXT DEFAULT '{}',
      metrics TEXT DEFAULT '{}',
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Campaign Items (individual posts, emails, etc.)
    CREATE TABLE IF NOT EXISTS marketing_campaign_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      campaign_id TEXT NOT NULL REFERENCES marketing_campaigns(id),
      type TEXT NOT NULL CHECK(type IN ('email','social_post','ad','landing_page')),
      title TEXT NOT NULL,
      content TEXT,
      channel TEXT,
      scheduled_at INTEGER,
      sent_at INTEGER,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sent','failed','cancelled')),
      metrics TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Email Templates
    CREATE TABLE IF NOT EXISTS marketing_email_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT,
      body_text TEXT,
      category TEXT DEFAULT 'general',
      variables TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Email Lists
    CREATE TABLE IF NOT EXISTS marketing_email_lists (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      subscriber_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Email Subscribers
    CREATE TABLE IF NOT EXISTS marketing_email_subscribers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      list_id TEXT NOT NULL REFERENCES marketing_email_lists(id),
      email TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','unsubscribed','bounced','spam')),
      metadata TEXT DEFAULT '{}',
      subscribed_at INTEGER NOT NULL,
      unsubscribed_at INTEGER,
      UNIQUE(tenant_id, list_id, email)
    );

    -- Email Send Log
    CREATE TABLE IF NOT EXISTS marketing_email_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      campaign_item_id TEXT REFERENCES marketing_campaign_items(id),
      template_id TEXT REFERENCES marketing_email_templates(id),
      subscriber_id TEXT REFERENCES marketing_email_subscribers(id),
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','delivered','opened','clicked','bounced','failed')),
      sent_at INTEGER,
      opened_at INTEGER,
      clicked_at INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL
    );

    -- SEO Keywords
    CREATE TABLE IF NOT EXISTS marketing_seo_keywords (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      keyword TEXT NOT NULL,
      product_id TEXT REFERENCES products(id),
      target_url TEXT,
      current_ranking INTEGER,
      target_ranking INTEGER DEFAULT 1,
      search_volume INTEGER DEFAULT 0,
      difficulty REAL DEFAULT 0,
      last_checked_at INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, keyword)
    );

    -- Social Media Accounts
    CREATE TABLE IF NOT EXISTS marketing_social_accounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      platform TEXT NOT NULL CHECK(platform IN ('facebook','instagram','twitter','linkedin','tiktok','line','other')),
      label TEXT NOT NULL,
      account_id TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Social Media Posts (scheduled)
    CREATE TABLE IF NOT EXISTS marketing_social_posts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      account_id TEXT NOT NULL REFERENCES marketing_social_accounts(id),
      campaign_item_id TEXT REFERENCES marketing_campaign_items(id),
      content TEXT NOT NULL,
      media_urls TEXT DEFAULT '[]',
      scheduled_at INTEGER,
      posted_at INTEGER,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','posted','failed','cancelled')),
      platform_post_id TEXT,
      metrics TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Discounts / Coupons
    CREATE TABLE IF NOT EXISTS marketing_discounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      code TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('percentage','fixed_amount','free_shipping','buy_x_get_y')),
      value REAL NOT NULL,
      min_order_amount REAL DEFAULT 0,
      max_discount_amount REAL,
      usage_limit INTEGER,
      usage_count INTEGER DEFAULT 0,
      per_customer_limit INTEGER DEFAULT 1,
      applies_to TEXT DEFAULT 'all' CHECK(applies_to IN ('all','specific_products','specific_categories','specific_customers')),
      applies_to_ids TEXT DEFAULT '[]',
      start_date INTEGER,
      end_date INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, code)
    );

    -- Discount Redemption Log
    CREATE TABLE IF NOT EXISTS marketing_discount_redemptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      discount_id TEXT NOT NULL REFERENCES marketing_discounts(id),
      order_id TEXT NOT NULL REFERENCES orders(id),
      customer_id TEXT REFERENCES customers(id),
      discount_code TEXT NOT NULL,
      discount_type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      discount_amount REAL NOT NULL,
      order_amount REAL NOT NULL,
      customer_email TEXT,
      redeemed_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      employee_code TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      position TEXT,
      department TEXT,
      manager_id TEXT REFERENCES employees(id),
      hire_date INTEGER,
      employment_type TEXT DEFAULT 'full_time' CHECK(employment_type IN ('full_time','part_time','contract','intern','temporary')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','terminated','on_leave')),
      base_salary REAL DEFAULT 0,
      currency TEXT DEFAULT 'THB',
      bank_name TEXT,
      bank_account TEXT,
      tax_id TEXT,
      address TEXT,
      emergency_contact TEXT,
      emergency_phone TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS time_tracking (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      date TEXT NOT NULL,
      clock_in INTEGER,
      clock_out INTEGER,
      break_start INTEGER,
      break_end INTEGER,
      total_hours REAL DEFAULT 0,
      overtime_hours REAL DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      approved_by TEXT REFERENCES employees(id),
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      leave_type TEXT NOT NULL CHECK(leave_type IN ('annual','sick','personal','maternity','paternity','bereavement','unpaid','other')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_days REAL NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
      approved_by TEXT REFERENCES employees(id),
      approved_at INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leave_balances (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      year INTEGER NOT NULL,
      leave_type TEXT NOT NULL,
      total_days REAL NOT NULL DEFAULT 0,
      used_days REAL NOT NULL DEFAULT 0,
      remaining_days REAL GENERATED ALWAYS AS (total_days - used_days) STORED,
      UNIQUE(tenant_id, employee_id, year, leave_type)
    );

    CREATE TABLE IF NOT EXISTS payroll_periods (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      period_name TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK(period_type IN ('weekly','biweekly','monthly')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      payment_date TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','processing','paid','cancelled')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      period_id TEXT NOT NULL REFERENCES payroll_periods(id),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      base_salary REAL NOT NULL DEFAULT 0,
      overtime_pay REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      commission REAL DEFAULT 0,
      allowance REAL DEFAULT 0,
      deductions REAL DEFAULT 0,
      tax_deduction REAL DEFAULT 0,
      social_security REAL DEFAULT 0,
      net_pay REAL NOT NULL DEFAULT 0,
      payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','cancelled')),
      paid_at INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS performance_reviews (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      reviewer_id TEXT NOT NULL REFERENCES employees(id),
      review_period TEXT NOT NULL,
      review_date INTEGER NOT NULL,
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      goals_achieved TEXT,
      strengths TEXT,
      areas_for_improvement TEXT,
      overall_feedback TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','acknowledged','completed')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
    CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
    CREATE INDEX IF NOT EXISTS idx_time_tracking_employee ON time_tracking(employee_id);
    CREATE INDEX IF NOT EXISTS idx_time_tracking_date ON time_tracking(date);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
    CREATE INDEX IF NOT EXISTS idx_leave_balances_employee ON leave_balances(employee_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_periods_tenant ON payroll_periods(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_items_period ON payroll_items(period_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_items_employee ON payroll_items(employee_id);
    CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee ON performance_reviews(employee_id);
    CREATE INDEX IF NOT EXISTS idx_performance_reviews_reviewer ON performance_reviews(reviewer_id);
  `);
}
