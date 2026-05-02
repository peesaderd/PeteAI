import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { AuthManager } from '../auth/auth.js';
import { TenantManager } from '../tenants/manager.js';
import { RBACManager } from '../rbac/index.js';
import { handleToolCall } from '../mcp/server.js';
import { createRegistryRouter } from './registry.js';
import { createProxyRouter } from '../gateway/proxy.js';

export function createRouter() {
  const router = Router();
  const auth = new AuthManager();
  const tenants = new TenantManager();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  router.post('/auth/register', async (req: Request, res: Response) => {
    try {
      const { tenantName, tenantSlug, email, name, password } = req.body;
      if (!tenantName || !tenantSlug || !email || !name || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const tenant = tenants.create(tenantName, tenantSlug);
      const user = await auth.register(tenant.id, email, name, password, 'admin');
      // Initialize default roles for the new tenant
      const rbac = new RBACManager();
      rbac.initializeTenantRoles(tenant.id);
      res.json({ tenant, user });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const result = await auth.login(email, password);
      if (!result) return res.status(401).json({ error: 'Invalid credentials' });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/mcp', async (req: Request, res: Response) => {
    try {
      const { tool, args } = req.body;
      if (!tool || !args) return res.status(400).json({ error: 'tool and args required' });
      const db = getDatabase();
      const result = await handleToolCall(tool, args, db, auth);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Mount registry API
  const registryRouter = createRegistryRouter();
  router.use('/registry', registryRouter);

  const proxyRouter = createProxyRouter();
// Mount Agency Team API proxy
  router.use('/agency', proxyRouter);
  router.use('/proxy', proxyRouter);

    // ---- Finance & Accounting REST API ----

    // Chart of Accounts
    router.get('/finance/accounts', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { type, activeOnly } = req.query;
        let sql = 'SELECT * FROM chart_of_accounts WHERE tenant_id = ?';
        const params: any[] = [tenantId];
        if (type) { sql += ' AND type = ?'; params.push(type); }
        if (activeOnly === 'true') { sql += ' AND is_active = 1'; }
        sql += ' ORDER BY code ASC';
        const results = db.prepare(sql).all(...params);
        res.json(results);
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/accounts', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { code, name, type, subtype, parentId, description } = req.body;
        if (!code || !name || !type) return res.status(400).json({ error: 'code, name, type required' });
        const db = getDatabase();
        const id = 'acct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO chart_of_accounts (id, tenant_id, code, name, type, subtype, parent_id, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, code, name, type, subtype || null, parentId || null, description || null, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Transactions
    router.get('/finance/transactions', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { type, category, limit = '50', offset = '0' } = req.query;
        let sql = 'SELECT * FROM finance_transactions WHERE tenant_id = ?';
        const params: any[] = [tenantId];
        if (type) { sql += ' AND type = ?'; params.push(type); }
        if (category) { sql += ' AND category = ?'; params.push(category); }
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit as string), parseInt(offset as string));
        const results = db.prepare(sql).all(...params);
        res.json(results);
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/transactions', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { type, category, amount, currency = 'USD', description, accountId, referenceType, referenceId, transactionDate } = req.body;
        if (!type || !category || amount === undefined) return res.status(400).json({ error: 'type, category, amount required' });
        const db = getDatabase();
        const id = 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO finance_transactions (id, tenant_id, type, category, amount, currency, description, account_id, reference_type, reference_id, transaction_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, type, category, amount, currency, description || null, accountId || null, referenceType || null, referenceId || null, transactionDate || now, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Balance Sheet
    router.get('/finance/balance-sheet', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const assets = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type IN ('income','ar')").get(tenantId) as any;
        const liabilities = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type IN ('expense','ap')").get(tenantId) as any;
        const equity = (assets?.total || 0) - (liabilities?.total || 0);
        res.json({ totalAssets: assets?.total || 0, totalLiabilities: liabilities?.total || 0, equity });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Profit & Loss
    router.get('/finance/profit-loss', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { startDate, endDate } = req.query;
        const now = Date.now();
        const sd = startDate ? parseInt(startDate as string) : (now - 30 * 86400 * 1000);
        const ed = endDate ? parseInt(endDate as string) : now;
        const income = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type = 'income' AND transaction_date >= ? AND transaction_date <= ?").get(tenantId, sd, ed) as any;
        const expenses = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type = 'expense' AND transaction_date >= ? AND transaction_date <= ?").get(tenantId, sd, ed) as any;
        res.json({ startDate: sd, endDate: ed, totalIncome: income?.total || 0, totalExpenses: expenses?.total || 0, netIncome: (income?.total || 0) - (expenses?.total || 0) });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Accounts Receivable
    router.get('/finance/ar', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { status } = req.query;
        let sql = 'SELECT * FROM accounts_receivable WHERE tenant_id = ?';
        const params: any[] = [tenantId];
        if (status) { sql += ' AND status = ?'; params.push(status); }
        sql += ' ORDER BY due_date ASC';
        res.json(db.prepare(sql).all(...params));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/ar', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { customerId, invoiceNumber, amount, dueDate, notes } = req.body;
        if (!customerId || !invoiceNumber || !amount || !dueDate) return res.status(400).json({ error: 'customerId, invoiceNumber, amount, dueDate required' });
        const db = getDatabase();
        const id = 'ar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO accounts_receivable (id, tenant_id, customer_id, invoice_number, amount, amount_paid, due_date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', ?, ?, ?)`).run(id, tenantId, customerId, invoiceNumber, amount, dueDate, notes || null, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Accounts Payable
    router.get('/finance/ap', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { status } = req.query;
        let sql = 'SELECT * FROM accounts_payable WHERE tenant_id = ?';
        const params: any[] = [tenantId];
        if (status) { sql += ' AND status = ?'; params.push(status); }
        sql += ' ORDER BY due_date ASC';
        res.json(db.prepare(sql).all(...params));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/ap', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { vendorName, invoiceNumber, amount, dueDate, notes } = req.body;
        if (!vendorName || !invoiceNumber || !amount || !dueDate) return res.status(400).json({ error: 'vendorName, invoiceNumber, amount, dueDate required' });
        const db = getDatabase();
        const id = 'ap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO accounts_payable (id, tenant_id, vendor_name, invoice_number, amount, amount_paid, due_date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', ?, ?, ?)`).run(id, tenantId, vendorName, invoiceNumber, amount, dueDate, notes || null, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Tax Rates
    router.get('/finance/tax-rates', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        res.json(db.prepare('SELECT * FROM tax_rates WHERE tenant_id = ? AND is_active = 1').all(tenantId));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/tax-rates', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { name, rate, type } = req.body;
        if (!name || rate === undefined || !type) return res.status(400).json({ error: 'name, rate, type required' });
        const db = getDatabase();
        const id = 'tax_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO tax_rates (id, tenant_id, name, rate, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, name, rate, type, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Budgets
    router.get('/finance/budgets', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        res.json(db.prepare('SELECT * FROM budgets WHERE tenant_id = ? ORDER BY start_date DESC').all(tenantId));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/budgets', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { name, category, amount, period, startDate, endDate } = req.body;
        if (!name || !category || amount === undefined || !period || !startDate || !endDate) return res.status(400).json({ error: 'name, category, amount, period, startDate, endDate required' });
        const db = getDatabase();
        const id = 'budget_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO budgets (id, tenant_id, name, category, amount, period, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, name, category, amount, period, startDate, endDate, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Bank Reconciliation
    router.get('/finance/reconciliations', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        res.json(db.prepare('SELECT * FROM bank_reconciliation WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/reconciliations', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { accountName, statementBalance, systemBalance, notes } = req.body;
        if (!accountName || statementBalance === undefined || systemBalance === undefined) return res.status(400).json({ error: 'accountName, statementBalance, systemBalance required' });
        const db = getDatabase();
        const id = 'recon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        const difference = statementBalance - systemBalance;
        db.prepare(`INSERT INTO bank_reconciliation (id, tenant_id, account_name, statement_balance, system_balance, difference, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`).run(id, tenantId, accountName, statementBalance, systemBalance, difference, notes || null, now, now);
        res.json({ id, difference, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // ---- Procurement & Supply Chain REST API ----

    // Suppliers
    router.get('/procurement/suppliers', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { status, search, limit = '50', offset = '0' } = req.query;
        let sql = 'SELECT * FROM suppliers WHERE tenant_id = ?';
        const params: any[] = [tenantId];
        if (status) { sql += ' AND status = ?'; params.push(status); }
        if (search) { sql += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        sql += ' ORDER BY name ASC LIMIT ? OFFSET ?';
        params.push(parseInt(limit as string), parseInt(offset as string));
        res.json(db.prepare(sql).all(...params));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.get('/procurement/suppliers/:id', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const result = db.prepare('SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
        if (!result) return res.status(404).json({ error: 'Supplier not found' });
        res.json(result);
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/procurement/suppliers', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { code, name, contactPerson, email, phone, address, taxId, paymentTerms, leadTimeDays, notes } = req.body;
        if (!code || !name) return res.status(400).json({ error: 'code, name required' });
        const db = getDatabase();
        const id = 'sup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO suppliers (id, tenant_id, code, name, contact_person, email, phone, address, tax_id, payment_terms, lead_time_days, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`).run(id, tenantId, code, name, contactPerson || null, email || null, phone || null, address || null, taxId || null, paymentTerms || 'net30', leadTimeDays || 7, notes || null, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.put('/procurement/suppliers/:id', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const existing = db.prepare('SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId) as any;
        if (!existing) return res.status(404).json({ error: 'Supplier not found' });
        const { name, contactPerson, email, phone, address, taxId, paymentTerms, leadTimeDays, status, notes } = req.body;
        const now = Date.now();
        db.prepare(`UPDATE suppliers SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?, tax_id = ?, payment_terms = ?, lead_time_days = ?, status = ?, notes = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`).run(name ?? existing.name, contactPerson ?? existing.contact_person, email ?? existing.email, phone ?? existing.phone, address ?? existing.address, taxId ?? existing.tax_id, paymentTerms ?? existing.payment_terms, leadTimeDays ?? existing.lead_time_days, status ?? existing.status, notes ?? existing.notes, now, req.params.id, tenantId);
        res.json({ id: req.params.id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Supplier Products
    router.get('/procurement/suppliers/:id/products', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { limit = '50', offset = '0' } = req.query;
        const result = db.prepare('SELECT sp.*, p.name as product_name, p.sku as product_sku FROM supplier_products sp JOIN products p ON p.id = sp.product_id WHERE sp.supplier_id = ? AND sp.tenant_id = ? ORDER BY sp.is_preferred DESC LIMIT ? OFFSET ?').all(req.params.id, tenantId, parseInt(limit as string), parseInt(offset as string));
        res.json(result);
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/procurement/supplier-products', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { supplierId, productId, supplierSku, unitCost, moq, leadTimeDays, isPreferred } = req.body;
        if (!supplierId || !productId || unitCost === undefined) return res.status(400).json({ error: 'supplierId, productId, unitCost required' });
        const db = getDatabase();
        const id = 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO supplier_products (id, tenant_id, supplier_id, product_id, supplier_sku, unit_cost, moq, lead_time_days, is_preferred, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, supplierId, productId, supplierSku || null, unitCost, moq || 1, leadTimeDays || null, isPreferred ? 1 : 0, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Purchase Orders
    router.get('/procurement/purchase-orders', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { status, supplierId, limit = '50', offset = '0' } = req.query;
        let sql = 'SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.tenant_id = ?';
        const params: any[] = [tenantId];
        if (status) { sql += ' AND po.status = ?'; params.push(status); }
        if (supplierId) { sql += ' AND po.supplier_id = ?'; params.push(supplierId); }
        sql += ' ORDER BY po.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit as string), parseInt(offset as string));
        res.json(db.prepare(sql).all(...params));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.get('/procurement/purchase-orders/:id', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const po = db.prepare('SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ? AND po.tenant_id = ?').get(req.params.id, tenantId) as any;
        if (!po) return res.status(404).json({ error: 'Purchase order not found' });
        po.items = db.prepare('SELECT poi.*, p.name as product_name, p.sku as product_sku FROM purchase_order_items poi JOIN products p ON p.id = poi.product_id WHERE poi.po_id = ?').all(req.params.id);
        res.json(po);
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/procurement/purchase-orders', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { poNumber, supplierId, expectedDate, notes, shippingAddress, items } = req.body;
        if (!poNumber || !supplierId || !items || items.length === 0) return res.status(400).json({ error: 'poNumber, supplierId, and items required' });
        const db = getDatabase();
        const id = 'po_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        let subtotal = 0;
        for (const item of items) subtotal += item.quantityOrdered * item.unitCost;
        db.prepare(`INSERT INTO purchase_orders (id, tenant_id, po_number, supplier_id, status, order_date, subtotal, total_amount, notes, shipping_address, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, poNumber, supplierId, now, subtotal, subtotal, notes || null, shippingAddress || null, now, now);
        for (const item of items) {
          const itemId = 'poi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          db.prepare(`INSERT INTO purchase_order_items (id, tenant_id, po_id, product_id, quantity_ordered, quantity_received, unit_cost, total_cost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`).run(itemId, tenantId, id, item.productId, item.quantityOrdered, item.unitCost, item.quantityOrdered * item.unitCost, now, now);
        }
        res.json({ id, poNumber, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.put('/procurement/purchase-orders/:id/status', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { status, notes } = req.body;
        if (!status) return res.status(400).json({ error: 'status required' });
        const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
        if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
        const now = Date.now();
        db.prepare(`UPDATE purchase_orders SET status = ?, notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END, updated_at = ? WHERE id = ? AND tenant_id = ?`).run(status, notes, notes, now, req.params.id, tenantId);
        res.json({ id: req.params.id, status, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/procurement/purchase-orders/:id/receive', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { items, warehouseId } = req.body;
        if (!items || items.length === 0) return res.status(400).json({ error: 'items required' });
        const now = Date.now();
        const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId) as any;
        if (!po) return res.status(404).json({ error: 'Purchase order not found' });
        let allReceived = true;
        for (const item of items) {
          const poi = db.prepare('SELECT * FROM purchase_order_items WHERE id = ? AND po_id = ?').get(item.itemId, req.params.id) as any;
          if (!poi) return res.status(404).json({ error: `Item ${item.itemId} not found` });
          const newReceived = poi.quantity_received + item.quantityReceived;
          db.prepare('UPDATE purchase_order_items SET quantity_received = ?, updated_at = ? WHERE id = ?').run(newReceived, now, item.itemId);
          if (newReceived < poi.quantity_ordered) allReceived = false;
          db.prepare('UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ?').run(item.quantityReceived, now, poi.product_id);
          const movId = 'mov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          db.prepare(`INSERT INTO inventory_movements (id, tenant_id, product_id, to_location_id, quantity, type, reference_type, reference_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'receipt', 'purchase_order', ?, ?, ?)`).run(movId, tenantId, poi.product_id, warehouseId || null, item.quantityReceived, req.params.id, now, now);
        }
        const newStatus = allReceived ? 'received' : 'partially_received';
        db.prepare('UPDATE purchase_orders SET status = ?, received_date = ?, updated_at = ? WHERE id = ?').run(newStatus, now, now, req.params.id);
        res.json({ id: req.params.id, status: newStatus, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Warehouses
    router.get('/procurement/warehouses', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { type, limit = '50', offset = '0' } = req.query;
        let sql = 'SELECT * FROM warehouse_locations WHERE tenant_id = ?';
        const params: any[] = [tenantId];
        if (type) { sql += ' AND type = ?'; params.push(type); }
        sql += ' ORDER BY name ASC LIMIT ? OFFSET ?';
        params.push(parseInt(limit as string), parseInt(offset as string));
        res.json(db.prepare(sql).all(...params));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/procurement/warehouses', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { code, name, type = 'warehouse', address } = req.body;
        if (!code || !name) return res.status(400).json({ error: 'code, name required' });
        const db = getDatabase();
        const id = 'wh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO warehouse_locations (id, tenant_id, code, name, type, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, code, name, type, address || null, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Warehouse Bins
    router.get('/procurement/warehouses/:id/bins', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { zone, limit = '50', offset = '0' } = req.query;
        let sql = 'SELECT * FROM warehouse_bins WHERE tenant_id = ? AND warehouse_id = ?';
        const params: any[] = [tenantId, req.params.id];
        if (zone) { sql += ' AND zone = ?'; params.push(zone); }
        sql += ' ORDER BY code ASC LIMIT ? OFFSET ?';
        params.push(parseInt(limit as string), parseInt(offset as string));
        res.json(db.prepare(sql).all(...params));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/procurement/warehouse-bins', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { warehouseId, code, zone, maxCapacity } = req.body;
        if (!warehouseId || !code) return res.status(400).json({ error: 'warehouseId, code required' });
        const db = getDatabase();
        const id = 'bin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO warehouse_bins (id, tenant_id, warehouse_id, code, zone, max_capacity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, warehouseId, code, zone || null, maxCapacity || null, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Inventory Movements
    router.get('/procurement/inventory-movements', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { productId, type, limit = '50', offset = '0' } = req.query;
        let sql = 'SELECT im.*, p.name as product_name, p.sku as product_sku FROM inventory_movements im JOIN products p ON p.id = im.product_id WHERE im.tenant_id = ?';
        const params: any[] = [tenantId];
        if (productId) { sql += ' AND im.product_id = ?'; params.push(productId); }
        if (type) { sql += ' AND im.type = ?'; params.push(type); }
        sql += ' ORDER BY im.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit as string), parseInt(offset as string));
        res.json(db.prepare(sql).all(...params));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/procurement/inventory/transfer', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { productId, quantity, fromLocationId, toLocationId, notes } = req.body;
        if (!productId || !quantity || quantity <= 0) return res.status(400).json({ error: 'productId and positive quantity required' });
        const db = getDatabase();
        const now = Date.now();
        if (fromLocationId) db.prepare('UPDATE products SET quantity = quantity - ?, updated_at = ? WHERE id = ?').run(quantity, now, productId);
        if (toLocationId) db.prepare('UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ?').run(quantity, now, productId);
        const id = 'mov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        db.prepare(`INSERT INTO inventory_movements (id, tenant_id, product_id, from_location_id, to_location_id, quantity, type, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?)`).run(id, tenantId, productId, fromLocationId || null, toLocationId || null, quantity, notes || null, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Drop Ship Orders
    router.get('/procurement/drop-ship-orders', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { status, supplierId, limit = '50', offset = '0' } = req.query;
        let sql = 'SELECT dso.*, s.name as supplier_name FROM drop_ship_orders dso JOIN suppliers s ON s.id = dso.supplier_id WHERE dso.tenant_id = ?';
        const params: any[] = [tenantId];
        if (status) { sql += ' AND dso.status = ?'; params.push(status); }
        if (supplierId) { sql += ' AND dso.supplier_id = ?'; params.push(supplierId); }
        sql += ' ORDER BY dso.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit as string), parseInt(offset as string));
        res.json(db.prepare(sql).all(...params));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.put('/procurement/drop-ship-orders/:id/status', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { status, trackingNumber, notes } = req.body;
        if (!status) return res.status(400).json({ error: 'status required' });
        const existing = db.prepare('SELECT * FROM drop_ship_orders WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
        if (!existing) return res.status(404).json({ error: 'Drop ship order not found' });
        const now = Date.now();
        db.prepare(`UPDATE drop_ship_orders SET status = ?, tracking_number = COALESCE(?, tracking_number), notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND tenant_id = ?`).run(status, trackingNumber || null, notes || null, now, req.params.id, tenantId);
        res.json({ id: req.params.id, status, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Shipping Tracking
    router.get('/procurement/shipping-tracking', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { referenceType, referenceId } = req.query;
        if (!referenceType || !referenceId) return res.status(400).json({ error: 'referenceType and referenceId required' });
        res.json(db.prepare('SELECT * FROM shipping_tracking WHERE reference_type = ? AND reference_id = ? AND tenant_id = ?').all(referenceType, referenceId, tenantId));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/procurement/shipping-tracking', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { referenceType, referenceId, carrier, trackingNumber, status, notes } = req.body;
        if (!referenceType || !referenceId) return res.status(400).json({ error: 'referenceType, referenceId required' });
        const db = getDatabase();
        const now = Date.now();
        const existing = db.prepare('SELECT * FROM shipping_tracking WHERE reference_type = ? AND reference_id = ? AND tenant_id = ?').get(referenceType, referenceId, tenantId) as any;
        if (existing) {
          db.prepare(`UPDATE shipping_tracking SET carrier = COALESCE(?, carrier), tracking_number = COALESCE(?, tracking_number), status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`).run(carrier || null, trackingNumber || null, status || null, notes || null, now, existing.id);
          res.json({ id: existing.id, success: true });
        } else {
          const id = 'st_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          db.prepare(`INSERT INTO shipping_tracking (id, tenant_id, reference_type, reference_id, carrier, tracking_number, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, referenceType, referenceId, carrier || null, trackingNumber || null, status || 'pending', notes || null, now, now);
          res.json({ id, success: true });
        }
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // ---- AI Provider Selection ----
    router.get('/ai/providers', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const providers = db.prepare('SELECT * FROM ai_providers WHERE tenant_id = ? ORDER BY created_at ASC').all(tenantId);
        res.json(providers);
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.get('/ai/providers/:id', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const provider = db.prepare('SELECT * FROM ai_providers WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });
        res.json(provider);
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/ai/providers', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { name, provider, apiKey, apiUrl, model, maxTokens, temperature, config } = req.body;
        if (!name || !provider) return res.status(400).json({ error: 'name and provider required' });
        const db = getDatabase();
        const id = 'aip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare('INSERT INTO ai_providers (id, tenant_id, name, provider, api_key, api_url, model, max_tokens, temperature, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, tenantId, name, provider, apiKey || '', apiUrl || null, model || 'gpt-4o', maxTokens || 4096, temperature ?? 0.3, JSON.stringify(config || {}), now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.put('/ai/providers/:id', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const existing = db.prepare('SELECT * FROM ai_providers WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId) as any;
        if (!existing) return res.status(404).json({ error: 'Provider not found' });
        const { name, provider, apiKey, apiUrl, model, maxTokens, temperature, config } = req.body;
        const now = Date.now();
        db.prepare('UPDATE ai_providers SET name = COALESCE(?, name), provider = COALESCE(?, provider), api_key = COALESCE(?, api_key), api_url = COALESCE(?, api_url), model = COALESCE(?, model), max_tokens = COALESCE(?, max_tokens), temperature = COALESCE(?, temperature), config = COALESCE(?, config), updated_at = ? WHERE id = ? AND tenant_id = ?').run(name || null, provider || null, apiKey || null, apiUrl || null, model || null, maxTokens ?? null, temperature ?? null, config ? JSON.stringify(config) : null, now, req.params.id, tenantId);
        res.json({ id: req.params.id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.delete('/ai/providers/:id', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const existing = db.prepare('SELECT * FROM ai_providers WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
        if (!existing) return res.status(404).json({ error: 'Provider not found' });
        db.prepare('DELETE FROM ai_providers WHERE id = ? AND tenant_id = ?').run(req.params.id, tenantId);
        res.json({ id: req.params.id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/ai/providers/:id/activate', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const existing = db.prepare('SELECT * FROM ai_providers WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId) as any;
        if (!existing) return res.status(404).json({ error: 'Provider not found' });
        const now = Date.now();
        db.prepare('UPDATE ai_providers SET is_active = 0, updated_at = ? WHERE tenant_id = ?').run(now, tenantId);
        db.prepare('UPDATE ai_providers SET is_active = 1, is_tenant_default = 1, updated_at = ? WHERE id = ? AND tenant_id = ?').run(now, req.params.id, tenantId);
        res.json({ id: req.params.id, is_active: true, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/ai/providers/:id/test', async (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const provider = db.prepare('SELECT * FROM ai_providers WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId) as any;
        if (!provider) return res.status(404).json({ error: 'Provider not found' });
        if (!provider.api_key) return res.status(400).json({ error: 'API key is not set' });
        const apiUrl = provider.api_url || (provider.provider === 'openai' ? 'https://api.openai.com/v1' : provider.provider === 'deepseek' ? 'https://api.deepseek.com' : provider.provider === 'anthropic' ? 'https://api.anthropic.com/v1' : null);
        if (!apiUrl) return res.status(400).json({ error: 'API URL not configured for this provider' });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const baseUrl = apiUrl.replace(/\/+$/, '');
          const response = await fetch(baseUrl + '/models', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + provider.api_key },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (response.ok) {
            res.json({ success: true, message: 'Connection successful' });
          } else {
            const text = await response.text();
            res.status(400).json({ success: false, message: 'Connection failed: ' + text.slice(0, 200) });
          }
        } catch (err: any) {
          clearTimeout(timeout);
          res.status(400).json({ success: false, message: 'Connection error: ' + err.message });
        }
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // ---- Webhook: SiYuan sync trigger ----
    router.post('/webhooks/siyuan', async (req: Request, res: Response) => {
      try {
        const { docId } = req.body;
        if (!docId) return res.status(400).json({ error: 'docId required' });
        const syncUrl = process.env.SYNC_SIYUAN_URL || 'http://sync-siyuan:54513';
        const response = await fetch(`${syncUrl}/webhook/siyuan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docId }),
        });
        const data = await response.json();
        res.json(data);
      } catch (err: any) {
        res.status(502).json({ error: `Failed to forward webhook: ${err.message}` });
      }
    });

    // ---- Webhook: Generic receiver ----
    router.post('/webhooks/:source', async (req: Request, res: Response) => {
      const { source } = req.params;
      console.log(`[Webhook] Received from ${source}:`, JSON.stringify(req.body).slice(0, 200));
      res.json({ received: true, source });
    });

  return router;
}
