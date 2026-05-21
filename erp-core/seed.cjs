const D = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path"); const db = new D(path.join(process.cwd(), "data", "erp-core.db"));
const now = Math.floor(Date.now() / 1000);
const TENANT = "t_001";

console.log("=== Seeding ERP Core Database ===\n");

// 1. Tenant
console.log("1. Creating tenant...");
db.prepare("INSERT OR IGNORE INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
  .run(TENANT, "Demo Company", "demo", now, now);

// 2. Categories
console.log("2. Creating categories...");
const catNames = ["Electronics", "Clothing", "Home", "Food", "Books"];
const catIds = {};
for (const name of catNames) {
  const id = "cat_" + crypto.randomUUID().slice(0, 8);
  db.prepare("INSERT OR IGNORE INTO categories (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)").run(id, TENANT, name, now);
  catIds[name] = id;
}

// 3. Products
console.log("3. Creating products...");
const products = [
  { n: "Laptop Pro 15", c: "Electronics", p: 1499.99, co: 899.00, q: 50, s: "LP15" },
  { n: "Wireless Headphones", c: "Electronics", p: 199.99, co: 89.00, q: 200, s: "WH100" },
  { n: "Cotton T-Shirt", c: "Clothing", p: 29.99, co: 12.00, q: 500, s: "CTS01" },
  { n: "Denim Jacket", c: "Clothing", p: 89.99, co: 45.00, q: 150, s: "DJ02" },
  { n: "Coffee Maker", c: "Home", p: 79.99, co: 35.00, q: 100, s: "CM01" },
  { n: "Desk Lamp", c: "Home", p: 49.99, co: 22.00, q: 300, s: "DL01" },
  { n: "Organic Green Tea", c: "Food", p: 19.99, co: 8.00, q: 1000, s: "OGT01" },
  { n: "Dark Chocolate Box", c: "Food", p: 24.99, co: 10.00, q: 500, s: "DCB01" },
  { n: "JavaScript Guide", c: "Books", p: 39.99, co: 18.00, q: 400, s: "JSG01" },
  { n: "Design Thinking", c: "Books", p: 29.99, co: 14.00, q: 350, s: "DT01" }
];
const prodIds = {};
for (const p of products) {
  const id = "prod_" + crypto.randomUUID().slice(0, 8);
  db.prepare("INSERT OR IGNORE INTO products (id, tenant_id, name, description, sku, price, cost_price, quantity, low_stock_threshold, category_id, tags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, ?, '[]', 'active', ?, ?)")
    .run(id, TENANT, p.n, p.n + " description", p.s, p.p, p.co, p.q, catIds[p.c], now, now);
  prodIds[p.n] = id;
}

// 4. Customers
console.log("4. Creating customers...");
const customers = [
  { n: "John Smith", e: "john@example.com", s: 5000 },
  { n: "Sarah Johnson", e: "sarah@example.com", s: 12000 },
  { n: "Mike Brown", e: "mike@example.com", s: 3500 },
  { n: "Emily Davis", e: "emily@example.com", s: 8900 },
  { n: "David Wilson", e: "david@example.com", s: 15000 }
];
for (const c of customers) {
  db.prepare("INSERT OR IGNORE INTO customers (id, tenant_id, name, email, total_spent, order_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
    .run("cust_" + crypto.randomUUID().slice(0, 8), TENANT, c.n, c.e, c.s, now, now);
}

// 5. Orders (last 30 days)
console.log("5. Creating orders...");
const monthAgo = now - 30 * 86400;
for (let i = 0; i < 25; i++) {
  const ts = monthAgo + Math.floor(Math.random() * (now - monthAgo));
  const ci = i % customers.length;
  const pi = i % products.length;
  const p = products[pi];
  const qty = Math.floor(Math.random() * 5) + 1;
  const sub = p.p * qty;
  const ship = Math.random() > 0.7 ? 15.00 : 0;
  const oid = "ord_" + crypto.randomUUID().slice(0, 8);
  db.prepare("INSERT OR IGNORE INTO orders (id, tenant_id, order_number, status, customer_name, customer_email, subtotal, shipping_cost, total, channel, created_at, updated_at) VALUES (?, ?, ?, 'delivered', ?, ?, ?, ?, ?, 'direct', ?, ?)")
    .run(oid, TENANT, "ORD-" + (1000 + i), customers[ci].n, customers[ci].e, sub, ship, sub + ship, ts, ts);
  db.prepare("INSERT OR IGNORE INTO order_items (id, order_id, product_id, name, sku, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("item_" + crypto.randomUUID().slice(0, 8), oid, prodIds[p.n], p.n, p.s, qty, p.p, sub);
  db.prepare("UPDATE products SET quantity = quantity - ? WHERE id = ?").run(qty, prodIds[p.n]);
}

// 6. Finance Transactions
console.log("6. Creating finance transactions...");
const fcats = ["Sales Revenue", "Operating Expense", "Marketing", "Payroll", "Utilities"];
for (let i = 0; i < 20; i++) {
  const ts = monthAgo + Math.floor(Math.random() * (now - monthAgo));
  const type = i % 2 === 0 ? "income" : "expense";
  const amt = Math.floor(Math.random() * 5000) + 100;
  db.prepare("INSERT OR IGNORE INTO finance_transactions (id, tenant_id, type, category, amount, currency, description, transaction_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?)")
    .run("ft_" + crypto.randomUUID().slice(0, 8), TENANT, type, fcats[i % fcats.length], amt, type === "income" ? "Sales payment" : "Operating cost", ts, ts, ts);
}

// 7. Chart of Accounts
console.log("7. Creating chart of accounts...");
const accts = [
  { c: "1000", n: "Cash", t: "asset" },
  { c: "1100", n: "Accounts Receivable", t: "asset" },
  { c: "1200", n: "Inventory", t: "asset" },
  { c: "2000", n: "Accounts Payable", t: "liability" },
  { c: "3000", n: "Owner Equity", t: "equity" },
  { c: "4000", n: "Sales Revenue", t: "income" },
  { c: "5000", n: "COGS", t: "expense" },
  { c: "6000", n: "Operating Expenses", t: "expense" }
];
for (const a of accts) {
  db.prepare("INSERT OR IGNORE INTO chart_of_accounts (id, tenant_id, code, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("acct_" + crypto.randomUUID().slice(0, 8), TENANT, a.c, a.n, a.t, now, now);
}

// 8. Tax Rates
console.log("8. Creating tax rates...");
db.prepare("INSERT OR IGNORE INTO tax_rates (id, tenant_id, name, rate, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
  .run("tax_vat", TENANT, "VAT 7%", 0.07, "vat", now, now);
db.prepare("INSERT OR IGNORE INTO tax_rates (id, tenant_id, name, rate, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
  .run("tax_sales", TENANT, "Sales Tax 8%", 0.08, "sales_tax", now, now);

// 9. Suppliers
console.log("9. Creating suppliers...");
const suppArr = [
  { n: "TechSupply Co.", e: "orders@techsupply.com" },
  { n: "FashionWholesale Ltd.", e: "sales@fashionwholesale.com" },
  { n: "HomeGoods Inc.", e: "info@homegoods.com" }
];
for (let si = 0; si < suppArr.length; si++) {
  const s = suppArr[si];
  db.prepare("INSERT OR IGNORE INTO suppliers (id, tenant_id, code, name, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)")
    .run("supp_" + crypto.randomUUID().slice(0, 8), TENANT, "SUPP-" + (100 + si), s.n, s.e, now, now);
}

// 10. Billing Plan & Subscription
console.log("10. Creating billing plan & subscription...");
const planId = "plan_" + crypto.randomUUID().slice(0, 8);
db.prepare("INSERT OR IGNORE INTO billing_plans (id, name, description, price_monthly, price_yearly, features, max_users, max_products, max_storage_mb, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)")
  .run(planId, "Enterprise", "Full ERP features", 99.99, 999.99, JSON.stringify(["All modules", "Unlimited products", "Priority support"]), 50, 10000, 5000);
db.prepare("INSERT OR IGNORE INTO subscriptions (id, tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end, created_at, updated_at) VALUES (?, ?, ?, 'active', 'monthly', ?, ?, ?, ?)")
  .run("sub_" + crypto.randomUUID().slice(0, 8), TENANT, planId, now, now + 30 * 86400, now, now);

// 11. Employees
console.log("11. Creating employees...");
for (const e of [
  { c: "EMP001", f: "Alice", l: "Manager", p: "CEO", d: "Management", s: 120000 },
  { c: "EMP002", f: "Bob", l: "Engineer", p: "Senior Engineer", d: "Engineering", s: 85000 },
  { c: "EMP003", f: "Carol", l: "Designer", p: "Product Designer", d: "Design", s: 65000 }
]) {
  db.prepare("INSERT OR IGNORE INTO employees (id, tenant_id, employee_code, first_name, last_name, position, department, hire_date, employment_type, status, base_salary, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'full_time', 'active', ?, 'USD', ?, ?)")
    .run("emp_" + crypto.randomUUID().slice(0, 8), TENANT, e.c, e.f, e.l, e.p, e.d, now - 365 * 86400, e.s, now, now);
}

// 12. Marketing Campaign
console.log("12. Creating marketing campaign...");
db.prepare("INSERT OR IGNORE INTO marketing_campaigns (id, tenant_id, name, description, type, status, budget, spent, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, 'email', 'active', ?, ?, ?, ?, ?, ?)")
  .run("camp_" + crypto.randomUUID().slice(0, 8), TENANT, "Summer Sale 2026", "Summer promotion campaign", 5000, 1200, now, now + 60 * 86400, now, now);

// 13. Production Order
console.log("13. Creating production order...");
db.prepare("INSERT OR IGNORE INTO production_orders (id, tenant_id, product_id, order_number, quantity, quantity_completed, status, priority, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'planned', 'normal', ?, ?, ?)")
  .run("po_" + crypto.randomUUID().slice(0, 8), TENANT, prodIds["Laptop Pro 15"], "PROD-001", 10, 0, now + 14 * 86400, now, now);

// 14. Warehouse
console.log("14. Creating warehouse...");
db.prepare("INSERT OR IGNORE INTO warehouse_locations (id, tenant_id, code, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, 'warehouse', ?, ?)")
  .run("wh_" + crypto.randomUUID().slice(0, 8), TENANT, "WH-MAIN", "Main Warehouse", now, now);

console.log("\n=== Seed Complete! ===");
console.log("Tenant ID: " + TENANT);
console.log("Products: " + products.length);
console.log("Customers: " + customers.length);
console.log("Orders: 25");
console.log("Finance Transactions: 20");
console.log("Employees: 3");
db.close();
